// Status codes as stored in the DB -> display labels.
// Key order is also the order of options in the status dropdown.
export const STATUS_LABELS = {
  open: 'Open',
  in_progress: 'In progress',
  review: 'Review',
  testing: 'Testing',
  done: 'Done',
};

// Chart colors per status, matching the lozenge colors in App.css.
export const STATUS_COLORS = {
  open: '#8590a2',
  in_progress: '#1d7afc',
  review: '#e2b203',
  testing: '#8270db',
  done: '#22a06b',
};

// Unknown codes fall back to the raw value.
export const statusLabel = (code) => STATUS_LABELS[code] ?? code;
