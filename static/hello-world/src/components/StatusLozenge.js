import { statusLabel } from '../constants/status';

// Jira-like status badge. Colors per status are defined in App.css (.lozenge-<code>).
export function StatusLozenge({ code }) {
  return <span className={`lozenge lozenge-${code}`}>{statusLabel(code)}</span>;
}
