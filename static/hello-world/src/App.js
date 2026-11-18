import React, { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { invoke } from '@forge/bridge';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

// DB status code -> display label. Key order is also the dropdown order.
const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  review: 'Review',
  testing: 'Testing',
  done: 'Done',
};

// Unknown codes fall back to the raw value.
const statusLabel = (code) => STATUS_LABELS[code] ?? code;

// Converts a Recharts SVG inside `container` to a PNG data URL for jsPDF:
// SVG -> string -> Image -> canvas -> PNG.
function chartToPng(container) {
  return new Promise((resolve, reject) => {
    const svg = container?.querySelector('svg.recharts-surface');
    if (!svg) {
      resolve(null); // chart is not rendered yet
      return;
    }

    const width = svg.clientWidth;
    const height = svg.clientHeight;

    const svgString = new XMLSerializer().serializeToString(svg);

    const image = new Image();
    image.onload = () => {
      // Render at 2x so the chart stays sharp in the PDF.
      const scale = 2;
      const canvas = document.createElement('canvas');
      canvas.width = width * scale;
      canvas.height = height * scale;

      const ctx = canvas.getContext('2d');
      ctx.scale(scale, scale);
      ctx.fillStyle = '#ffffff'; // SVG background is transparent
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(image, 0, 0, width, height);

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
      // All rows for the current filters, without pagination.
      const result = await invoke('getHistoryExport', { productId, status, dateFrom, dateTo });

      // A4 portrait, units in mm.
      const doc = new jsPDF();

      // productId from <select> is a string, DB ids are numbers.
      const productName =
        products.find((product) => String(product.id) === productId)?.name ?? 'All products';

      // "YYYY-MM-DD HH:MM" in UTC
      const generatedAt = new Date().toISOString().slice(0, 16).replace('T', ' ');

      const summary = [
        `Product: ${productName}`,
        `Status: ${status ? statusLabel(status) : 'All statuses'}`,
        `Period: ${dateFrom || 'any'} - ${dateTo || 'any'} (UTC)`,
        `Rows: ${result.rows.length}${result.truncated ? ' (limit reached, older rows not included)' : ''}`,
        `Generated: ${generatedAt} UTC`,
      ];

      doc.setFontSize(16);
      doc.text('Task history', 14, 15);

      // An array of strings is printed line by line.
      doc.setFontSize(10);
      doc.text(summary, 14, 23);

      // Two charts side by side: 182 mm usable width = 88 + 6 gap + 88.
      const chartWidth = 88;
      const chartsTop = 48;
      let tableTop = chartsTop;

      const charts = [
        await chartToPng(barChartRef.current),
        await chartToPng(lineChartRef.current),
      ];

      charts.forEach((chart, index) => {
        if (!chart) return;

        // Keep the original aspect ratio.
        const chartHeight = (chart.height / chart.width) * chartWidth;
        const x = 14 + index * (chartWidth + 6);

        doc.addImage(chart.png, 'PNG', x, chartsTop, chartWidth, chartHeight);
        tableTop = Math.max(tableTop, chartsTop + chartHeight + 6);
      });

      autoTable(doc, {
        startY: tableTop, // only affects the first page
        head: [['Date', 'Product', 'Task', 'Transition']],
        // Built-in PDF fonts are ASCII only, hence '-' and '->' instead of '—' and '→'.
        body: result.rows.map((row) => [
          row.changed_at,
          row.product_name,
          row.task_name,
          `${row.from_status ? statusLabel(row.from_status) : '-'} -> ${statusLabel(row.to_status)}`,
        ]),
      });

      doc.save('task-history.pdf');
    } finally {
      // Re-enable the button even if the export failed.
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
          {Object.entries(STATUS_LABELS).map(([code, label]) => (
            <option key={code} value={code}>
              {label}
            </option>
          ))}
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
            <XAxis dataKey="status" tickFormatter={statusLabel} />
            <YAxis />
            <Tooltip labelFormatter={statusLabel} />
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
                  <td>
                    {row.from_status ? statusLabel(row.from_status) : '—'} → {statusLabel(row.to_status)}
                  </td>
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
