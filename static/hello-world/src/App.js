import { useRef } from 'react';
import { FiltersBar } from './components/FiltersBar';
import { HistoryTable } from './components/HistoryTable';
import { Spinner } from './components/Loading';
import { Pagination } from './components/Pagination';
import { DailyChart } from './components/charts/DailyChart';
import { StatusChart } from './components/charts/StatusChart';
import { useFilters } from './hooks/useFilters';
import { useInvoke } from './hooks/useInvoke';
import { usePdfExport } from './hooks/usePdfExport';
import './App.css';

/**
 * Dashboard page: filters on top, two charts, history table with pagination.
 * The same filters drive every block, so the table, charts and PDF always match.
 */
function App() {
  const { filters, setFilter, resetFilters, hasFilters, page, setPage } = useFilters();

  // Each block loads independently, so one failing request doesn't break the others.
  const history = useInvoke('getHistory', { ...filters, page });
  const statusStats = useInvoke('getStatusStats', filters);
  const dailyStats = useInvoke('getDailyStats', filters);
  const products = useInvoke('getProducts').data ?? [];

  // Chart containers, used by the PDF export to snapshot the rendered charts.
  const statusChartRef = useRef(null);
  const dailyChartRef = useRef(null);

  const { exportPdf, exporting, exportError } = usePdfExport({
    filters,
    products,
    chartRefs: [statusChartRef, dailyChartRef],
  });

  const totalPages = history.data
    ? Math.max(Math.ceil(history.data.total / history.data.pageSize), 1)
    : 1;

  return (
    <div className="app">
      <div className="toolbar">
        <FiltersBar filters={filters} products={products} onChange={setFilter} />

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

      <div className="charts">
        <StatusChart {...statusStats} cardRef={statusChartRef} />
        <DailyChart {...dailyStats} cardRef={dailyChartRef} />
      </div>

      <div className="card">
        <h3>Status changes</h3>
        <HistoryTable rows={history.data?.rows} error={history.error} loading={history.loading} />
        <Pagination
          page={page}
          totalPages={totalPages}
          total={history.data?.total ?? 0}
          disabled={!history.data}
          onPageChange={setPage}
        />
      </div>
    </div>
  );
}

export default App;
