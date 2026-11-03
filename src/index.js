import Resolver from '@forge/resolver';
import { sql } from '@forge/sql';

const resolver = new Resolver();

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
  const productId = Number(payload?.productId);
  const hasProduct = Number.isInteger(productId) && productId > 0;
  const where = hasProduct ? "WHERE p.id = ?" : "";
  const params = hasProduct ? [productId] : [];

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

export const handler = resolver.getDefinitions();

