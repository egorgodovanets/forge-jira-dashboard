import Resolver from '@forge/resolver';
import { sql } from '@forge/sql';

const resolver = new Resolver();

const STATUSES = ['open', 'in_progress', 'review', 'testing', 'done'];
const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
const PAGE_SIZE = 10;
// Cap the export to stay within Forge response size limits.
const MAX_EXPORT_ROWS = 10000;

// Every history query joins history -> task -> product.
const HISTORY_FROM = `
  FROM tasks_history h
  JOIN tasks t    ON t.id = h.task_id
  JOIN products p ON p.id = t.product_id
`;

// Row shape for the table and the PDF export.
const HISTORY_COLUMNS = `
  h.id,
  h.changed_at,
  h.from_status,
  h.to_status,
  t.name AS task_name,
  p.name AS product_name
`;

// Runs a parameterized query and returns its rows.
async function runQuery(text, params = []) {
  const result = await sql.prepare(text).bindParams(...params).execute();
  return result.rows;
}

/**
 * Builds a WHERE clause from UI filters. Values always go through ? placeholders;
 * empty or invalid filters are ignored.
 */
function buildHistoryWhere(payload) {
  const conditions = [];
  const params = [];

  const productId = Number(payload?.productId);
  if (Number.isInteger(productId) && productId > 0) {
    conditions.push('p.id = ?');
    params.push(productId);
  }

  // Whitelist: unknown statuses are ignored.
  if (STATUSES.includes(payload?.status)) {
    conditions.push('h.to_status = ?');
    params.push(payload.status);
  }

  // Inclusive whole days, UTC.
  if (DATE_FORMAT.test(payload?.dateFrom ?? '')) {
    conditions.push('h.changed_at >= ?');
    params.push(`${payload.dateFrom} 00:00:00`);
  }
  if (DATE_FORMAT.test(payload?.dateTo ?? '')) {
    conditions.push('h.changed_at <= ?');
    params.push(`${payload.dateTo} 23:59:59`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  return { where, params };
}

resolver.define('getProducts', async () => {
  return runQuery('SELECT id, name FROM products ORDER BY name');
});

resolver.define('getHistory', async ({ payload }) => {
  const page = Math.max(Math.floor(Number(payload?.page)) || 1, 1);
  const offset = (page - 1) * PAGE_SIZE;
  const { where, params } = buildHistoryWhere(payload);

  // Page rows and total count are independent, so run them in parallel.
  // LIMIT/OFFSET are interpolated, which is safe: both are integers computed above.
  const [rows, countRows] = await Promise.all([
    runQuery(
      `SELECT ${HISTORY_COLUMNS}
       ${HISTORY_FROM}
       ${where}
       ORDER BY h.changed_at DESC, h.id DESC
       LIMIT ${PAGE_SIZE} OFFSET ${offset}`,
      params,
    ),
    runQuery(`SELECT COUNT(*) AS total ${HISTORY_FROM} ${where}`, params),
  ]);

  // COUNT(*) may come back as a string, so normalize it here and below.
  return { rows, total: Number(countRows[0].total), page, pageSize: PAGE_SIZE };
});

resolver.define('getStatusStats', async ({ payload }) => {
  const { where, params } = buildHistoryWhere(payload);

  const rows = await runQuery(
    `SELECT h.to_status AS status, COUNT(*) AS total
     ${HISTORY_FROM}
     ${where}
     GROUP BY h.to_status
     ORDER BY total DESC`,
    params,
  );

  return rows.map((row) => ({ status: row.status, total: Number(row.total) }));
});

resolver.define('getDailyStats', async ({ payload }) => {
  const { where, params } = buildHistoryWhere(payload);

  const rows = await runQuery(
    `SELECT DATE(h.changed_at) AS day, COUNT(*) AS total
     ${HISTORY_FROM}
     ${where}
     GROUP BY DATE(h.changed_at)
     ORDER BY day`,
    params,
  );

  return rows.map((row) => ({ day: row.day, total: Number(row.total) }));
});

resolver.define('getHistoryExport', async ({ payload }) => {
  const { where, params } = buildHistoryWhere(payload);

  const rows = await runQuery(
    `SELECT ${HISTORY_COLUMNS}
     ${HISTORY_FROM}
     ${where}
     ORDER BY h.changed_at DESC, h.id DESC
     LIMIT ${MAX_EXPORT_ROWS + 1}`,
    params,
  );

  // We fetch one extra row: if it arrives, the result was cut off.
  const truncated = rows.length > MAX_EXPORT_ROWS;
  return { rows: truncated ? rows.slice(0, MAX_EXPORT_ROWS) : rows, truncated };
});

export const handler = resolver.getDefinitions();