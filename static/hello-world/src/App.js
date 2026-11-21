import React, { useEffect, useState, useRef } from 'react';
import { BarChart, Bar, Cell, CartesianGrid, LineChart, Line, XAxis, YAxis, Tooltip } from 'recharts';
import { invoke } from '@forge/bridge';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';
import './App.css';

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

// Bar colors per status, matching the lozenge colors in App.css.
const STATUS_COLORS = {
  open: '#8590a2',
  in_progress: '#1d7afc',
  review: '#e2b203',
  testing: '#8270db',
  done: '#22a06b',
};

// Shared chart styling in Atlassian colors.
const AXIS_PROPS = {
  tick: { fill: '#626f86', fontSize: 12 },
  axisLine: { stroke: '#dcdfe4' },
  tickLine: false,
};
const TOOLTIP_STYLE = { borderRadius: 3, border: '1px solid #dcdfe4', fontSize: 12 };

// "2026-10-27" or "2026-10-27T00:00:00.000Z" -> "2026-10-27"
const formatDay = (day) => String(day).slice(0, 10);

// Jira-like status badge.
function StatusLozenge({ code }) {
  return <span className={`lozenge lozenge-${code}`}>{statusLabel(code)}</span>;
}

// PDF: built-in fonts can't render '→', so the Transition cell is drawn by hand:
// "<from> [vector arrow] <to>". Sizes are in mm.
const PDF_ARROW_GAP = 2;
const PDF_ARROW_LENGTH = 5;
// Spaces in the cell text reserve room for the arrow when autotable measures column widths.
const PDF_ARROW_PLACEHOLDER = ' '.repeat(10);

function drawPdfTransition(doc, cell, { from, to, created }) {
  const fontSize = doc.getFontSize() / doc.internal.scaleFactor; // pt -> mm
  // Same baseline autotable uses for regular cells, so the text lines up with other columns.
  const baseline = cell.getTextPos().y + fontSize * 0.85;
  const arrowY = baseline - fontSize * 0.3; // vertical middle of lowercase letters
  const textColor = [].concat(cell.styles.textColor); // number (gray) or [r, g, b]
  let x = cell.x + cell.padding('left');

  // "Created" is secondary information, so it's gray.
  doc.setTextColor(...(created ? [133, 144, 162] : textColor));
  doc.text(from, x, baseline);
  x += doc.getTextWidth(from) + PDF_ARROW_GAP;

  // Arrow: a thin line plus a filled triangle as the head.
  const headStart = x + PDF_ARROW_LENGTH - 1.6;
  doc.setDrawColor(133, 144, 162);
  doc.setFillColor(133, 144, 162);
  doc.setLineWidth(0.3);
  doc.line(x, arrowY, headStart, arrowY);
  doc.triangle(headStart, arrowY - 0.9, headStart, arrowY + 0.9, x + PDF_ARROW_LENGTH, arrowY, 'F');
  x += PDF_ARROW_LENGTH + PDF_ARROW_GAP;

  doc.setTextColor(...textColor);
  doc.text(to, x, baseline);
}

// Atlassian-style spinner. size: 'small' (16px), 'medium' (24px) or 'large' (32px).
function Spinner({ size = 'medium' }) {
  return <span className={`spinner spinner-${size}`} role="status" aria-label="Loading" />;
}

// Placeholder with a centered spinner for the first load, sized like the real content.
function LoadingBlock({ width, height }) {
  return (
    <div className="loading-block" style={{ width, height }}>
      <Spinner size="large" />
    </div>
  );
}

// Keeps the previous content visible but dimmed while fresh data loads.
function LoadingOverlay({ loading, children }) {
  return (
    <div className={`loading-area${loading ? ' is-loading' : ''}`}>
      {children}
      {loading && (
        <div className="loading-overlay">
          <Spinner size="large" />
        </div>
      )}
    </div>
  );
}

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

    // The SVG becomes a standalone image without page CSS, so copy the font explicitly
    // (otherwise chart labels fall back to a serif font in the PDF).
    const clone = svg.cloneNode(true);
    clone.setAttribute('font-family', getComputedStyle(svg).fontFamily);
    const svgString = new XMLSerializer().serializeToString(clone);

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

// Calls a Forge resolver and tracks { data, error, loading }.
// Re-runs whenever functionKey or payload content changes.
function useInvoke(functionKey, payload) {
  const [state, setState] = useState({ data: null, error: null, loading: true });

  // A new payload object is created on every render, so compare by content.
  const payloadKey = JSON.stringify(payload ?? {});

  useEffect(() => {
    // Set to true when a newer request starts or the component unmounts,
    // so a late response can't overwrite fresher data.
    let ignore = false;

    // Keep the previous data while loading, so the UI doesn't flicker.
    setState((prev) => ({ ...prev, error: null, loading: true }));

    invoke(functionKey, JSON.parse(payloadKey))
      .then((data) => {
        if (!ignore) setState({ data, error: null, loading: false });
      })
      .catch((err) => {
        console.error(`${functionKey} failed`, err);
        if (!ignore) setState({ data: null, error: err?.message ?? String(err), loading: false });
      });

    return () => {
      ignore = true;
    };
  }, [functionKey, payloadKey]);

  return state;
}

function App() {
  const [page, setPage] = useState(1);
  const [productId, setProductId] = useState('');
  const [status, setStatus] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const barChartRef = useRef(null);
  const lineChartRef = useRef(null);

  const filters = { productId, status, dateFrom, dateTo };

  // Renamed so the JSX below keeps using data, statusStats, dailyStats, products.
  const {
    data,
    error: historyError,
    loading: historyLoading,
  } = useInvoke('getHistory', { ...filters, page });
  const {
    data: statusStats,
    error: statusStatsError,
    loading: statusStatsLoading,
  } = useInvoke('getStatusStats', filters);
  const {
    data: dailyStats,
    error: dailyStatsError,
    loading: dailyStatsLoading,
  } = useInvoke('getDailyStats', filters);
  const { data: productsData } = useInvoke('getProducts');
  const products = productsData ?? [];

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
    setExportError(null);

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

      const transitions = result.rows.map((row) => ({
        from: row.from_status ? statusLabel(row.from_status) : 'Created',
        to: statusLabel(row.to_status),
        created: !row.from_status,
      }));
      const TRANSITION_COLUMN = 3;

      autoTable(doc, {
        startY: tableTop, // only affects the first page
        headStyles: { fillColor: [12, 102, 228] }, // Atlassian blue
        // Fit the Transition column to its content so it never wraps.
        columnStyles: { [TRANSITION_COLUMN]: { cellWidth: 'wrap' } },
        head: [['Date', 'Product', 'Task', 'Transition']],
        body: result.rows.map((row, index) => [
          row.changed_at,
          row.product_name,
          row.task_name,
          // Placeholder text: only used to measure the width, the cell is drawn by hand below.
          `${transitions[index].from}${PDF_ARROW_PLACEHOLDER}${transitions[index].to}`,
        ]),
        // Skip the default text output for the Transition cell (background and borders stay)...
        willDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === TRANSITION_COLUMN) {
            data.cell.text = [];
          }
        },
        // ...and draw "<from> → <to>" instead.
        didDrawCell: (data) => {
          if (data.section === 'body' && data.column.index === TRANSITION_COLUMN) {
            drawPdfTransition(doc, data.cell, transitions[data.row.index]);
          }
        },
      });

      doc.save('task-history.pdf');
    } catch (err) {
      console.error('PDF export failed', err);
      setExportError(err?.message ?? String(err));
    } finally {
      // Re-enable the button even if the export failed.
      setExporting(false);
    }
  };

  const hasFilters = productId !== '' || status !== '' || dateFrom !== '' || dateTo !== '';

  return (
    <div className="app">
      {/* Filters and actions */}
      <div className="toolbar">
        <label className="filter">
          <span className="filter-label">From</span>
          <input
            className="field"
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>

        <label className="filter">
          <span className="filter-label">To</span>
          <input
            className="field"
            type="date"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
        </label>

        <label className="filter">
          <span className="filter-label">Product</span>
          <select
            className="field"
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
        </label>

        <label className="filter">
          <span className="filter-label">Status</span>
          <select
            className="field"
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
        </label>

        <div className="toolbar-actions">
          <button className="btn" onClick={resetFilters} disabled={!hasFilters}>
            Reset filters
          </button>
          <button className="btn btn-primary" onClick={exportPdf} disabled={exporting}>
            {exporting && <Spinner size="small" />}
            {exporting ? 'Exporting...' : 'Export PDF'}
          </button>
        </div>
      </div>

      {exportError && <p className="banner-error">Export failed: {exportError}</p>}

      {/* Charts. Refs are on the cards: chartToPng looks for the svg inside them */}
      <div className="charts">
        <div className="card" ref={barChartRef}>
          <h3>Events by target status</h3>
          {statusStatsError ? (
            <p className="error">Failed to load: {statusStatsError}</p>
          ) : statusStats ? (
            <LoadingOverlay loading={statusStatsLoading}>
              <BarChart width={480} height={260} data={statusStats}>
                <CartesianGrid vertical={false} stroke="#ebecf0" />
                <XAxis dataKey="status" tickFormatter={statusLabel} {...AXIS_PROPS} />
                <YAxis allowDecimals={false} {...AXIS_PROPS} />
                <Tooltip
                  cursor={{ fill: '#091e420f' }}
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={statusLabel}
                  formatter={(value) => [value, 'Events']}
                />
                <Bar dataKey="total" radius={[3, 3, 0, 0]}>
                  {statusStats.map((entry) => (
                    <Cell key={entry.status} fill={STATUS_COLORS[entry.status] ?? '#1d7afc'} />
                  ))}
                </Bar>
              </BarChart>
            </LoadingOverlay>
          ) : (
            <LoadingBlock width={480} height={260} />
          )}
        </div>

        <div className="card" ref={lineChartRef}>
          <h3>Status changes per day</h3>
          {dailyStatsError ? (
            <p className="error">Failed to load: {dailyStatsError}</p>
          ) : dailyStats ? (
            <LoadingOverlay loading={dailyStatsLoading}>
              <LineChart width={480} height={260} data={dailyStats}>
                <CartesianGrid vertical={false} stroke="#ebecf0" />
                <XAxis dataKey="day" tickFormatter={formatDay} {...AXIS_PROPS} />
                <YAxis allowDecimals={false} {...AXIS_PROPS} />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  labelFormatter={formatDay}
                  formatter={(value) => [value, 'Events']}
                />
                <Line type="monotone" dataKey="total" stroke="#1d7afc" strokeWidth={2} dot={false} />
              </LineChart>
            </LoadingOverlay>
          ) : (
            <LoadingBlock width={480} height={260} />
          )}
        </div>
      </div>

      {/* History table with pagination */}
      <div className="card">
        <h3>Status changes</h3>
        {historyError ? (
          <p className="error">Failed to load: {historyError}</p>
        ) : data ? (
          <LoadingOverlay loading={historyLoading}>
            <table className="history-table">
              <thead>
                <tr>
                  <th>Date (UTC)</th>
                  <th>Product</th>
                  <th>Task</th>
                  <th>Transition</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.length === 0 ? (
                  <tr>
                    <td className="empty" colSpan={4}>
                      No results for the selected filters
                    </td>
                  </tr>
                ) : (
                  data.rows.map((row) => (
                    <tr key={row.id}>
                      <td className="nowrap">{row.changed_at}</td>
                      <td>{row.product_name}</td>
                      <td>{row.task_name}</td>
                      <td className="nowrap">
                        {row.from_status ? (
                          <StatusLozenge code={row.from_status} />
                        ) : (
                          <span className="muted">Created</span>
                        )}
                        <span className="arrow">→</span>
                        <StatusLozenge code={row.to_status} />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </LoadingOverlay>
        ) : (
          <LoadingBlock height={360} />
        )}

        <div className="pagination">
          <button
            className="btn"
            onClick={() => setPage((p) => Math.max(p - 1, 1))}
            disabled={page === 1}
          >
            Prev
          </button>
          <span className="page-info">
            Page {page} of {totalPages} · {data?.total ?? 0} events
          </span>
          <button
            className="btn"
            onClick={() => setPage((p) => p + 1)}
            disabled={!data || page >= totalPages}
          >
            Next
          </button>
          <button className="btn" onClick={() => setPage(totalPages)} disabled={!data}>
            Last
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;
