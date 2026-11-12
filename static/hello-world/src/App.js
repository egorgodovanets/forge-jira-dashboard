import React, { useEffect, useState } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { invoke } from '@forge/bridge';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

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

      // 3. Заголовок: текст, x = 14 мм от левого края, y = 15 мм от верха
      doc.text('Task history', 14, 15);

      // 4. Таблица. head — шапка, body — массив строк, каждая строка — массив ячеек
      autoTable(doc, {
        startY: 20, // таблица начинается под заголовком
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
        <BarChart width={600} height={300} data={statusStats}>
          <XAxis dataKey="status" />
          <YAxis />
          <Tooltip />
          <Bar dataKey="total" fill="#0c66e4" />
        </BarChart>
      )}

      {dailyStats && (
        <LineChart width={600} height={300} data={dailyStats}>
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Line type="monotone" dataKey="total" stroke="#0c66e4" dot={false} />
        </LineChart>
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
