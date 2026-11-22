// Atlassian-style spinner. size: 'small' (16px), 'medium' (24px) or 'large' (32px).
export function Spinner({ size = 'medium' }) {
  return <span className={`spinner spinner-${size}`} role="status" aria-label="Loading" />;
}

// First load: an empty area of the content's size with a centered spinner,
// so nothing jumps when the data arrives.
export function LoadingBlock({ width, height }) {
  return (
    <div className="loading-block" style={{ width, height }}>
      <Spinner size="large" />
    </div>
  );
}

// Reload: keeps the previous content visible but dimmed, with a spinner on top.
export function LoadingOverlay({ loading, children }) {
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
