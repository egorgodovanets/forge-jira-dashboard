import { LoadingBlock, LoadingOverlay } from './Loading';
import { StatusLozenge } from './StatusLozenge';

// One history row: "<from> → <to>", or "Created → <to>" when the task was just created.
function Transition({ from, to }) {
  return (
    <>
      {from ? <StatusLozenge code={from} /> : <span className="muted">Created</span>}
      <span className="arrow">→</span>
      <StatusLozenge code={to} />
    </>
  );
}

/**
 * Current page of the task history.
 * rows is undefined until the first response arrives.
 */
export function HistoryTable({ rows, error, loading }) {
  if (error) {
    return <p className="error">Failed to load: {error}</p>;
  }
  if (!rows) {
    return <LoadingBlock height={360} />;
  }

  return (
    <LoadingOverlay loading={loading}>
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
          {rows.length === 0 ? (
            <tr>
              <td className="empty" colSpan={4}>
                No results for the selected filters
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={row.id}>
                <td className="nowrap">{row.changed_at}</td>
                <td>{row.product_name}</td>
                <td>{row.task_name}</td>
                <td className="nowrap">
                  <Transition from={row.from_status} to={row.to_status} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </LoadingOverlay>
  );
}
