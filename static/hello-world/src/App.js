import React, { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { invoke } from '@forge/bridge';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

// Превращает SVG-график Recharts в PNG (data URL), который понимает jsPDF.
// container — div, внутри которого Recharts нарисовал свой <svg>
function chartToPng(container) {
  return new Promise((resolve, reject) => {
    // Recharts помечает основной svg классом recharts-surface
    const svg = container?.querySelector('svg.recharts-surface');
    if (!svg) {
      resolve(null); // графика нет, например данные ещё не загрузились
      return;
    }

    const width = svg.clientWidth;
    const height = svg.clientHeight;

    // 1. SVG-элемент → строка с разметкой
    const svgString = new XMLSerializer().serializeToString(svg);

    // 2. Строка → картинка
    const image = new Image();
    image.onload = () => {
      // 3. Картинка → canvas. Рисуем в 2 раза крупнее, иначе в PDF будет мыльно
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff'; // у SVG прозрачный фон, заливаем белым
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

      // 4. Canvas → PNG
      resolve({ png: canvas.toDataURL('image/png'), width, height });
    };
    image.onerror = reject;
    image.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgString);
  });
}

function App() {
  const [data, setData] = useState(null);
  const [page, setPage] = useState(1);
  const [products, setProducts] = useState([]);
  const [productId, setProductId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statusStats, setStatusStats] = useState(null);
  const [dailyStats, setDailyStats] = useState(null);
  const [exporting, setExporting] = useState(false);
  const barChartRef = useRef(null);
  const lineChartRef = useRef(null);

  useEffect(() => {
    setData(null);
    invoke('getHistory', { page, productId, status, dateFrom, dateTo }).then(setData)
  }, [page, productId, status, dateFrom, dateTo]);

  useEffect(() => {
    invoke('getProducts').then(setProducts);
  }, [])

  useEffect(() => {
    invoke('getStatusStats', { productId, status, dateFrom, dateTo }).then(setStatusStats);
  }, [productId, status, dateFrom, dateTo]);

  useEffect(() => {
    invoke('getDailyStats', { productId, status, dateFrom, dateTo }).then(setDailyStats);
  }, [productId, status, dateFrom, dateTo]);

  const totalPages = data ? Math.max(Math.ceil(data.total / data.pageSize), 1) : 1;

  const resetFilters = () => {
    setProductId('');
    setStatus('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  };

  const exportPdf = async () => {
    setExporting(true);

    try {
      // 1. Берём все строки по текущим фильтрам, без пагинации
      const result = await invoke('getHistoryExport', { productId, status, dateFrom, dateTo });

      // 2. Новый документ: A4, книжная ориентация, единицы в миллиметрах
      const doc = new jsPDF();

      // Имя выбранного продукта. productId из select приходит строкой, а id из БД числом,
      // поэтому сравниваем как строки
      const productName =
        products.find((product) => String(product.id) === productId)?.name ?? 'All products';

      // Время генерации в UTC в формате "2026-11-12 14:05"
      const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

      // Строки сводки. Пустой фильтр показываем как "All" или "any", а не как пустоту
      const summary = [
        `Product: ${productName}`,
        `Status: ${status || 'All statuses'}`,
        `Period: ${dateFrom || 'any'} - ${dateTo || 'any'} (UTC)`,
        `Rows: ${result.rows.length}${result.truncated ? ' (limit reached, older rows not included)' : ''}`,
        `Generated: ${generatedAt} UTC`,
      ];

      // Заголовок крупно
      doc.setFontSize(16);
      doc.text('Task history', 14, 15);

      // Сводка мелко, массив строк печатается столбиком
      doc.setFontSize(10);
      doc.text(summary, 14, 23);

      // Графики рядом друг с другом. Ширина A4 — 210 мм, поля по 14 мм,
      // полезная ширина 182 мм: два графика по 88 мм и зазор 6 мм между ними
      const chartWidth = 88;
      const chartsTop = 48;
      let tableTop = chartsTop;

      const charts = [
        await chartToPng(barChartRef.current),
        await chartToPng(lineChartRef.current),
      ];

      charts.forEach((chart, index) => {
        if (!chart) return;

        // Высоту считаем по пропорциям оригинала, чтобы график не сплющило
        const chartHeight = (chart.height / chart.width) * chartWidth;
        const x = 14 + index * (chartWidth + 6);

        doc.addImage(chart.png, 'PNG', x, chartsTop, chartWidth, chartHeight);
        tableTop = Math.max(tableTop, chartsTop + chartHeight + 6);
      });
      
      // 4. Таблица. head — шапка, body — массив строк, каждая строка — массив ячеек
      autoTable(doc, {
        startY: tableTop, // под графиками, а если их нет — сразу под сводкой
        head: [['Date', 'Product', 'Task', 'Transition']],
        body: result.rows.map((row) => [
          row.changed_at,
          row.product_name,
          row.task_name,
          `${row.from_status ?? '-'} -> ${row.to_status}`,
        ]),
      });

      // 5. Скачиваем файл
      doc.save('task-history.pdf');
    } finally {
      // finally выполнится и при успехе, и при ошибке, поэтому кнопка не залипнет
      setExporting(false);
    }
  };

  const hasFilters = productId !== '' || status !== '' || dateFrom !== '' || dateTo !== '';

  return (
    <div>
      <label>
        From{' '}
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => {
            setDateFrom(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <label>
        {' '}To{' '}
        <input
          type="date"
          value={dateTo}
          onChange={(e) => {
            setDateTo(e.target.value);
            setPage(1);
          }}
        />
      </label>
      <div>
        <select
          value={productId}
          onChange={(e) => {
            setProductId(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All products</option>
          {products.map((product) => (
            <option key={product.id} value={product.id}>
              {product.name}
            </option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
        >
          <option value="">All statuses</option>
          <option value="open">open</option>
          <option value="in_progress">in_progress</option>
          <option value="review">review</option>
          <option value="testing">testing</option>
          <option value="done">done</option>
        </select>

        <button onClick={resetFilters} disabled={!hasFilters}>
          Reset filters
        </button>

        <button onClick={exportPdf} disabled={exporting}>
          {exporting ? 'Exporting...' : 'Export PDF'}
        </button>
      </div>
      <button onClick={() => setPage((p) => Math.max(p - 1, 1))} disabled={page === 1}>Prev</button>
      <span>Page {page} of {totalPages} ({data?.total ?? 0} events)</span>
      <button onClick={() => setPage((p) => p + 1)} disabled={!data || page >= totalPages}>Next</button>
      <button onClick={() => setPage(totalPages)} disabled={!data}>Last</button>

      {statusStats && (
         <div ref={barChartRef}>
          <BarChart width={600} height={300} data={statusStats}>
            <XAxis dataKey="status" />
            <YAxis />
            <Tooltip />
            <Bar dataKey="total" fill="#0c66e4" />
          </BarChart>
         </div>
      )}

      {dailyStats && (
        <div ref={lineChartRef}>
          <LineChart width={600} height={300} data={dailyStats}>
            <XAxis dataKey="day" />
            <YAxis />
            <Tooltip />
            <Line type="monotone" dataKey="total" stroke="#0c66e4" dot={false} />
          </LineChart>
        </div>
      )}

      {data ? (
        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th>Product</th>
              <th>Task</th>
              <th>Transition</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.length === 0 ? (
              <tr>
                <td colSpan={4}>No results</td>
              </tr>
            ) : (
              data.rows.map((row) => (
                <tr key={row.id}>
                  <td>{row.changed_at}</td>
                  <td>{row.product_name}</td>
                  <td>{row.task_name}</td>
                  <td>{row.from_status ?? '—'} → {row.to_status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      ) : (
        'Loading...'
      )}
    </div>
  );
}

export default App;
