import Resolver from '@forge/resolver';
import { sql } from '@forge/sql';

const resolver = new Resolver();

function buildHistoryWhere(payload) {
  const productId = Number(payload?.productId);
  const hasProduct = Number.isInteger(productId) && productId > 0;
  const conditions = [];
  const params = [];

  if (hasProduct) {
    conditions.push('p.id = ?');
    params.push(productId);
  }

  const STATUSES = ['open', 'in_progress', 'review', 'testing', 'done'];
  const status = payload?.status;
  if (STATUSES.includes(status)) {
    conditions.push('h.to_status = ?');
    params.push(status);
  }

  const DATE_FORMAT = /^\d{4}-\d{2}-\d{2}$/;

  if (DATE_FORMAT.test(payload?.dateFrom ?? '')) {
    conditions.push('h.changed_at >= ?');
    params.push(`${payload.dateFrom} 00:00:00`);
  }

  if (DATE_FORMAT.test(payload?.dateTo ?? '')) {
    conditions.push('h.changed_at <= ?');
    params.push(`${payload.dateTo} 23:59:59`);
  }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  return { where, params }
}

resolver.define('getText', (req) => {
    console.log(req);

    return 'Hello world!';
});

resolver.define('getProductsCount', async () => {
    const result = await sql
        .prepare(`SELECT COUNT(*) AS total FROM products`)
        .execute();
    
    return Number(result.rows[0].total)
})

resolver.define('getProducts', async () => {
    const result = await sql
        .prepare(`SELECT id, name FROM products ORDER BY name`)
        .execute()
    
    return result.rows
})

resolver.define('getTasks', async () => {
    const result = await sql   
        .prepare(`
            SELECT
                t.id,
                t.name AS task_name,
                t.status,
                p.name AS product_name
            FROM tasks t
            JOIN products p ON p.id = t.product_id
            ORDER BY t.id
            LIMIT 5
        `)
        .execute()

    return result.rows
})

resolver.define('getHistory', async ({ payload }) => {
  const pageSize = 10;
  const page = Math.max(Math.floor(Number(payload?.page)) || 1, 1);
  const offset = (page - 1) * pageSize;

  const { where, params } = buildHistoryWhere(payload);

  const result = await sql
    .prepare(`
      SELECT
        h.id,
        h.changed_at,
        h.from_status,
        h.to_status,
        t.name AS task_name,
        p.name AS product_name
      FROM tasks_history h
      JOIN tasks t    ON t.id = h.task_id
      JOIN products p ON p.id = t.product_id
      ${where}
      ORDER BY h.changed_at DESC, h.id DESC
      LIMIT ${pageSize} OFFSET ${offset}
    `)
    .bindParams(...params)
    .execute();

  const countResult = await sql 
    .prepare(`
        SELECT COUNT(*) AS total
        FROM tasks_history h
        JOIN tasks t ON t.id = h.task_id
        JOIN products p ON p.id = t.product_id
        ${where}
    `)
    .bindParams(...params)
    .execute()

  const total = Number(countResult.rows[0].total);
  return {rows: result.rows, total, page, pageSize };
});

resolver.define('getStatusStats', async ({ payload }) => {
  const { where, params } = buildHistoryWhere(payload);

  const result = await sql
    .prepare(`
      SELECT h.to_status AS status, COUNT(*) AS total
      FROM tasks_history h
      JOIN tasks t    ON t.id = h.task_id
      JOIN products p ON p.id = t.product_id
      ${where}
      GROUP BY h.to_status
      ORDER BY total DESC
    `)
    .bindParams(...params)
    .execute();

  return result.rows.map((row) => ({
    status: row.status,
    total: Number(row.total),
  }));
});

resolver.define('getDailyStats', async ({ payload }) => {
  const { where, params } = buildHistoryWhere(payload);

  const result = await sql
    .prepare(`
      SELECT DATE(h.changed_at) AS day, COUNT(*) AS total
      FROM tasks_history h
      JOIN tasks t    ON t.id = h.task_id
      JOIN products p ON p.id = t.product_id
      ${where}
      GROUP BY DATE(h.changed_at)
      ORDER BY day
    `)
    .bindParams(...params)
    .execute();

  return result.rows.map((row) => ({
    day: row.day,
    total: Number(row.total),
  }));
});

resolver.define('getHistoryExport', async ({ payload }) => {
  // Максимум строк в одном экспорте, чтобы не упереться в лимиты ответа
  const MAX_EXPORT_ROWS = 10000;

  // Тот же WHERE, что у таблицы и графиков, поэтому фильтры совпадают
  const { where, params } = buildHistoryWhere(payload);

  const result = await sql
    .prepare(`
      SELECT
        h.id,
        h.changed_at,
        h.from_status,
        h.to_status,
        t.name AS task_name,
        p.name AS product_name
      FROM tasks_history h
      JOIN tasks t    ON t.id = h.task_id
      JOIN products p ON p.id = t.product_id
      ${where}
      ORDER BY h.changed_at DESC, h.id DESC
      LIMIT ${MAX_EXPORT_ROWS + 1}
    `)
    .bindParams(...params)
    .execute();

  // Пришла лишняя строка: данных больше лимита
  const truncated = result.rows.length > MAX_EXPORT_ROWS;
  const rows = truncated ? result.rows.slice(0, MAX_EXPORT_ROWS) : result.rows;

  return { rows, truncated };
});

export const handler = resolver.getDefinitions();

