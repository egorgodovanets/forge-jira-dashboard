/**
 * Наполнение базы тестовыми данными (seed).
 *
 * Запускается через webtrigger (см. manifest.yml: seed-webtrigger → seedData → seed.trigger).
 * Сценарий:
 *   1. Очистить таблицы (чтобы повторный запуск не падал на дубликатах id).
 *   2. Сгенерировать данные в памяти (generateData.js).
 *   3. Вставить их в Forge SQL пачками.
 *   4. Посчитать строки в базе и вернуть отчёт.
 *
 * ВАЖНО: у URL webtrigger нет авторизации. Это инструмент только для разработки,
 * перед сдачей модуль webtrigger нужно удалить из манифеста или защитить.
 */

import { sql } from '@forge/sql';
import { generateData, COLUMNS } from './generateData.js';

/**
 * Сколько строк вставлять одним запросом.
 * 500 строк × 5–8 колонок = 2500–4000 параметров — это десятки килобайт,
 * далеко от лимитов Forge SQL (1 MiB на запрос, 10 с на INSERT).
 */
const BATCH_SIZE = 500;

/**
 * Порядок очистки: сначала «дети», потом «родители».
 * Вставка идёт в обратном порядке: products → tasks → tasks_history.
 */
const TABLES_CHILD_FIRST = ['tasks_history', 'tasks', 'products'];

// ---------------------------------------------------------------------------
// Вспомогательные функции
// ---------------------------------------------------------------------------

/**
 * Разрезает массив на куски по size элементов.
 * chunk([a, b, c, d, e], 2) → [[a, b], [c, d], [e]]
 */
function chunk(items, size) {
  const result = [];
  for (let i = 0; i < items.length; i += size) {
    result.push(items.slice(i, i + size));
  }
  return result;
}

/**
 * Собирает текст многострочного INSERT и плоский список параметров.
 *
 * Пример: table = 'products', columns = ['id', 'name'], rows = [[1, 'A'], [2, 'B']]
 *   query:  INSERT INTO products (id, name) VALUES (?, ?), (?, ?)
 *   params: [1, 'A', 2, 'B']
 *
 * Имена таблицы и колонок подставляются в строку напрямую, потому что
 * плейсхолдеры ? бывают только для значений. Это безопасно, пока имена берутся
 * из наших констант (COLUMNS), а не из пользовательского ввода.
 * Сами значения — только через ?, чтобы база экранировала их сама.
 *
 * Функция экспортируется, чтобы её можно было проверить локально без базы.
 */
export function buildInsertQuery(table, columns, rows) {
  const columnList = columns.join(', '); // 'id, name'
  const rowPlaceholder = `(${columns.map(() => '?').join(', ')})`; // '(?, ?)'
  const allPlaceholders = rows.map(() => rowPlaceholder).join(', '); // '(?, ?), (?, ?)'

  return {
    query: `INSERT INTO ${table} (${columnList}) VALUES ${allPlaceholders}`,
    params: rows.flat(), // [[1, 'A'], [2, 'B']] → [1, 'A', 2, 'B']
  };
}

/** Вставляет одну пачку строк одним запросом. */
async function insertRows(table, columns, rows) {
  const { query, params } = buildInsertQuery(table, columns, rows);
  // bindParams принимает значения отдельными аргументами, поэтому spread (...params).
  // null в params превращается в SQL NULL.
  await sql.prepare(query).bindParams(...params).execute();
}

/**
 * Вставляет все строки таблицы пачками — строго по очереди (await в цикле).
 * Promise.all отправил бы все пачки одновременно и мог упереться в лимиты
 * Forge SQL по частоте запросов; последовательная вставка предсказуема:
 * если упала пачка 7, значит пачки 1–6 уже в базе.
 */
async function insertAll(table, columns, rows) {
  const batches = chunk(rows, BATCH_SIZE);
  for (const [index, batch] of batches.entries()) {
    await insertRows(table, columns, batch);
    console.log(`${table}: batch ${index + 1}/${batches.length} (${batch.length} rows)`);
  }
}

/**
 * Удаляет все строки из всех таблиц.
 * DELETE, а не TRUNCATE: TRUNCATE в MySQL — DDL-команда, а у DDL в Forge SQL
 * отдельный путь выполнения и жёсткий лимит частоты.
 */
async function clearTables() {
  for (const table of TABLES_CHILD_FIRST) {
    const result = await sql.prepare(`DELETE FROM ${table}`).execute();
    console.log(`${table}: deleted ${result.rows.affectedRows} rows`);
  }
}

/**
 * Количество строк в таблице — спрашиваем у самой базы.
 * Для SELECT result.rows — массив объектов; AS total задаёт имя ключа.
 * Number(...) — на случай, если число придёт строкой (ответ идёт через JSON).
 */
async function countRows(table) {
  const result = await sql.prepare(`SELECT COUNT(*) AS total FROM ${table}`).execute();
  return Number(result.rows[0].total);
}

// ---------------------------------------------------------------------------
// Основной сценарий
// ---------------------------------------------------------------------------

export async function seedAll() {
  const startedAt = Date.now();
  console.log('Seed started');

  // 1. Очистка
  await clearTables();

  // 2. Генерация (чистый JS, без базы)
  const { products, tasks, history } = generateData();

  // 3. Вставка: сначала родители, потом дети
  await insertAll('products', COLUMNS.products, products);
  await insertAll('tasks', COLUMNS.tasks, tasks);
  await insertAll('tasks_history', COLUMNS.tasks_history, history);

  // 4. Отчёт: числа берём из базы, а не из длины наших массивов
  const report = {
    products: await countRows('products'),
    tasks: await countRows('tasks'),
    history: await countRows('tasks_history'),
    durationMs: Date.now() - startedAt,
  };

  // Самопроверка: в базе должно оказаться ровно столько строк, сколько сгенерировали.
  // Иначе «тихо вставилось не всё» осталось бы незамеченным.
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

// ---------------------------------------------------------------------------
// Обработчик webtrigger
// ---------------------------------------------------------------------------

/**
 * Forge вызывает эту функцию на HTTP-запрос к URL webtrigger.
 * Webtrigger обязан вернуть объект HTTP-ответа (statusCode обязателен).
 * Значения headers в Forge — массивы строк.
 *
 * Ошибку не пробрасываем, а превращаем в ответ 500: вызывающему (браузеру/curl)
 * полезнее увидеть текст ошибки. Подробности всё равно будут в forge logs.
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
