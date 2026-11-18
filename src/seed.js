/**
 * Seeds the database with generated test data.
 * Triggered via webtrigger (manifest.yml: seed-webtrigger -> seedData -> seed.trigger).
 * Flow: clear tables -> generate data in memory -> insert in batches -> verify row counts.
 *
 * NOTE: the webtrigger URL has no auth. Dev-only tool, remove it from the manifest before release.
 */

import { sql } from '@forge/sql';
import { generateData, COLUMNS } from './generateData.js';

// Rows per INSERT. 500 rows is a few dozen KB, well below Forge SQL limits (1 MiB per query).
const BATCH_SIZE = 500;

// Delete children before parents; inserts go in the reverse order.
const TABLES_CHILD_FIRST = ['tasks_history', 'tasks', 'products'];

// chunk([a, b, c, d, e], 2) -> [[a, b], [c, d], [e]]
function chunk(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/**
 * Builds a multi-row INSERT and a flat parameter list:
 *   ('products', ['id', 'name'], [[1, 'A'], [2, 'B']])
 *   -> INSERT INTO products (id, name) VALUES (?, ?), (?, ?)  with params [1, 'A', 2, 'B']
 *
 * Table/column names are interpolated (placeholders work only for values), which is safe
 * because they come from our constants, never from user input.
 */
export function buildInsertQuery(table, columns, rows) {
  const columnList = columns.join(', ');
  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`;
  const allPlaceholders = rows.map(() => rowPlaceholder).join(', ');

  return {
    query: `INSERT INTO ${table} (${columnList}) VALUES ${allPlaceholders}`,
    params: rows.flat(),
  };
}

async function insertRows(table, columns, rows) {
  const { query, params } = buildInsertQuery(table, columns, rows);
  // null values become SQL NULL.
  await sql.prepare(query).bindParams(...params).execute();
}

// Batches run sequentially (not Promise.all) to stay within Forge SQL rate limits.
async function insertAll(table, columns, rows) {
  const batches = chunk(rows, BATCH_SIZE);
  for (const [index, batch] of batches.entries()) {
    await insertRows(table, columns, batch);
    console.log(`${table}: batch ${index + 1}/${batches.length} (${batch.length} rows)`);
  }
}

// DELETE instead of TRUNCATE: TRUNCATE is DDL, which Forge SQL rate-limits separately.
async function clearTables() {
  for (const table of TABLES_CHILD_FIRST) {
    const result = await sql.prepare(`DELETE FROM ${table}`).execute();
    console.log(`${table}: deleted ${result.rows.affectedRows} rows`);
  }
}

async function countRows(table) {
  const result = await sql.prepare(`SELECT COUNT(*) AS total FROM ${table}`).execute();
  // COUNT(*) may come back as a string, so normalize it.
  return Number(result.rows[0].total);
}

export async function seedAll() {
  const startedAt = Date.now();
  console.log('Seed started');

  await clearTables();

  const { products, tasks, history } = generateData();

  // Parents first, then children.
  await insertAll('products', COLUMNS.products, products);
  await insertAll('tasks', COLUMNS.tasks, tasks);
  await insertAll('tasks_history', COLUMNS.tasks_history, history);

  // Counts come from the database, not from the generated arrays.
  const report = {
    products: await countRows('products'),
    tasks: await countRows('tasks'),
    history: await countRows('tasks_history'),
    durationMs: Date.now() - startedAt,
  };

  // Fail loudly if some rows were silently not inserted.
  if (
    report.products !== products.length ||
    report.tasks !== tasks.length ||
    report.history !== history.length
  ) {
    throw new Error(
      `Row count mismatch: expected ${products.length}/${tasks.length}/${history.length}, ` +
        `got ${report.products}/${report.tasks}/${report.history}`,
    );
  }

  console.log('Seed done', report);
  return report;
}

/**
 * Webtrigger handler. Must return an HTTP response object; Forge header values are string arrays.
 * Errors are returned as 500 with a message so the caller sees them (details are in forge logs).
 */
export const trigger = async () => {
  try {
    const report = await seedAll();
    return {
      statusCode: 200,
      headers: { 'Content-Type': ['application/json'] },
      body: JSON.stringify(report),
    };
  } catch (err) {
    console.error('Seed failed', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': ['text/plain'] },
      body: `Seed failed: ${err?.message ?? err}`,
    };
  }
};
