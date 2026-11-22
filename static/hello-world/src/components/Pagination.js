/**
 * Prev / Next / Last controls with "Page X of Y · N events".
 * disabled is true until the first page has loaded.
 */
export function Pagination({ page, totalPages, total, disabled, onPageChange }) {
  return (
    <div className="pagination">
      <button
        className="btn"
        onClick={() => onPageChange(Math.max(page - 1, 1))}
        disabled={disabled || page === 1}
      >
        Prev
      </button>
      <span className="page-info">
        Page {page} of {totalPages} · {total} events
      </span>
      <button
        className="btn"
        onClick={() => onPageChange(page + 1)}
        disabled={disabled || page >= totalPages}
      >
        Next
      </button>
      <button className="btn" onClick={() => onPageChange(totalPages)} disabled={disabled}>
        Last
      </button>
    </div>
  );
}
