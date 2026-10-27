/**
 * Генератор тестовых данных для дашборда.
 *
 * Это «чистый» модуль: он ничего не знает о Forge SQL и ничего не пишет в базу.
 * Он только строит в памяти три массива строк — products, tasks, history —
 * в том же порядке колонок, что и таблицы в migrations.js.
 * Поэтому его можно запускать и проверять локально через node, без деплоя.
 *
 * Главная идея согласованности: статус задачи НЕ выбирается случайно отдельно.
 * Сначала генерируется история переходов, а tasks.status берётся из последнего
 * перехода. Так последний to_status в истории всегда совпадает со статусом задачи.
 */

// ---------------------------------------------------------------------------
// Справочники и настройки
// ---------------------------------------------------------------------------

/** Все допустимые статусы задачи (машинные коды, как хранятся в базе). */
export const STATUSES = ['open', 'in_progress', 'review', 'testing', 'done'];

/**
 * Порядок колонок для каждой таблицы. Каждая сгенерированная строка —
 * это массив значений ровно в этом порядке. Пригодится при сборке INSERT.
 */
export const COLUMNS = {
  products: ['id', 'name', 'organization', 'state', 'created_at'],
  tasks: ['id', 'product_id', 'name', 'description', 'status', 'assignee', 'created_at', 'due_date'],
  tasks_history: ['id', 'task_id', 'from_status', 'to_status', 'changed_at'],
};

/**
 * Конечный автомат статусов: из какого статуса куда можно перейти и с каким весом.
 * Вес — относительная вероятность: [['testing', 3], ['in_progress', 1]] значит
 * «в testing в 3 раза чаще, чем обратно в in_progress».
 * Возвраты в in_progress — это «отправили на доработку» (rework).
 * Из done переходов нет: это конечная точка.
 */
const TRANSITIONS = {
  open: [['in_progress', 1]],
  in_progress: [['review', 1]],
  review: [['testing', 3], ['in_progress', 1]],
  testing: [['done', 4], ['in_progress', 1]],
  done: [],
};

/** Настройки по умолчанию. Любую можно переопределить через generateData({ ... }). */
const DEFAULT_OPTIONS = {
  seed: 42, // зерно генератора случайных чисел: одинаковое зерно → одинаковые данные
  productCount: 15,
  taskCount: 1400, // при остальных настройках даёт ~5000 строк истории
  taskWindowDays: 180, // задачи создаются в течение последних N дней
  continueChance: 0.8, // шанс, что задача сделает ещё один переход, а не «замрёт»
  maxTransitions: 12, // страховка от бесконечного хождения review ⇄ in_progress
  minGapHours: 2, // минимальная пауза между переходами
  maxGapHours: 72, // максимальная пауза между переходами
  noDueDateChance: 0.15, // доля задач без дедлайна (due_date = NULL)
  archivedChance: 0.2, // доля архивных продуктов
};

const PRODUCT_PREFIXES = ['Nova', 'Orion', 'Atlas', 'Zephyr', 'Helix', 'Quantum', 'Vertex', 'Lumen'];
const PRODUCT_SUFFIXES = ['CRM', 'Portal', 'Analytics', 'Mobile', 'Billing'];
const ORGANIZATIONS = ['Acme Corp', 'Globex', 'Initech', 'Umbrella', 'Stark Industries'];
const ASSIGNEES = [
  'Anna Kovalenko',
  'Ivan Petrenko',
  'Olena Shevchenko',
  'Dmytro Bondar',
  'Maria Tkachenko',
  'Andrii Melnyk',
  'Sofia Kravets',
  'Taras Lysenko',
];
const TASK_ACTIONS = ['Fix', 'Implement', 'Refactor', 'Test', 'Document', 'Optimize', 'Review', 'Design'];
const TASK_SUBJECTS = [
  'login form',
  'payment flow',
  'user profile page',
  'search API',
  'notification service',
  'export to CSV',
  'dashboard widgets',
  'access permissions',
  'onboarding wizard',
  'error logging',
];

// ---------------------------------------------------------------------------
// Случайные числа
// ---------------------------------------------------------------------------

/**
 * Генератор псевдослучайных чисел с зерном (алгоритм mulberry32).
 * Math.random() каждый раз даёт новые данные, а этот генератор при одном
 * и том же seed выдаёт одну и ту же последовательность. Это удобно для отладки:
 * перезапустил seed — получил те же самые строки.
 * Возвращает функцию, которая, как Math.random(), даёт число в [0, 1).
 */
function createRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Набор удобных помощников поверх одной функции random().
 * Все они используют один и тот же генератор, поэтому результат воспроизводим.
 */
function createHelpers(random) {
  /** Целое число от min до max включительно. */
  const randomInt = (min, max) => min + Math.floor(random() * (max - min + 1));

  /** Случайный элемент массива. */
  const pick = (items) => items[Math.floor(random() * items.length)];

  /** true с вероятностью probability (0..1). */
  const chance = (probability) => random() < probability;

  /** Случайная дата в диапазоне [from, to). */
  const randomDateBetween = (from, to) =>
    new Date(from.getTime() + Math.floor(random() * (to.getTime() - from.getTime())));

  /**
   * Выбор с весами: options = [['a', 3], ['b', 1]] → 'a' в 75% случаев.
   * Берём случайную точку на отрезке [0, сумма весов) и смотрим, в чей кусок она попала.
   */
  const pickWeighted = (options) => {
    const total = options.reduce((sum, [, weight]) => sum + weight, 0);
    let point = random() * total;
    for (const [value, weight] of options) {
      point -= weight;
      if (point < 0) return value;
    }
    return options[options.length - 1][0]; // защита от погрешностей округления
  };

  return { randomInt, pick, chance, randomDateBetween, pickWeighted };
}

// ---------------------------------------------------------------------------
// Даты
// ---------------------------------------------------------------------------

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

/** Новая дата на hours часов позже. Исходную дату не меняем (Date изменяемый объект). */
const addHours = (date, hours) => new Date(date.getTime() + hours * HOUR_MS);

/** Новая дата на days дней позже (days может быть отрицательным). */
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

/**
 * Date → строка для колонки DATETIME: 'YYYY-MM-DD HH:MM:SS' (в UTC).
 * toISOString() даёт '2026-10-26T17:27:10.000Z': обрезаем миллисекунды и Z, T меняем на пробел.
 */
export const toSqlDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

/** Date → строка для колонки DATE: 'YYYY-MM-DD' (в UTC). */
export const toSqlDate = (date) => date.toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Генерация
// ---------------------------------------------------------------------------

/**
 * Продукты. Имена строим из комбинаций префикс + суффикс по индексу,
 * чтобы они гарантированно не повторялись (8 × 5 = 40 уникальных имён).
 * Продукты «старше» задач: созданы 200–365 дней назад, а задачи — за последние 180 дней.
 */
function generateProducts(options, helpers, now) {
  const { randomInt, pick, chance } = helpers;
  const maxUniqueNames = PRODUCT_PREFIXES.length * PRODUCT_SUFFIXES.length;
  if (options.productCount > maxUniqueNames) {
    throw new Error(`productCount must be <= ${maxUniqueNames} to keep product names unique`);
  }

  const products = [];
  for (let i = 0; i < options.productCount; i++) {
    const prefix = PRODUCT_PREFIXES[i % PRODUCT_PREFIXES.length];
    const suffix = PRODUCT_SUFFIXES[Math.floor(i / PRODUCT_PREFIXES.length)];
    const createdAt = addDays(now, -randomInt(200, 365));

    // Порядок значений = COLUMNS.products
    products.push([
      i + 1, // id: 1, 2, 3, ... задаём сами
      `${prefix} ${suffix}`,
      pick(ORGANIZATIONS),
      chance(options.archivedChance) ? 'archived' : 'active',
      toSqlDateTime(createdAt),
    ]);
  }
  return products;
}

/**
 * Жизнь одной задачи: последовательность переходов статусов во времени.
 * Возвращает массив событий { from, to, at } и итоговый статус.
 *
 * Алгоритм:
 *   1. Первое событие — создание задачи: null → open в момент createdAt.
 *   2. Дальше в цикле: с шансом continueChance задача делает следующий переход
 *      по таблице TRANSITIONS через случайную паузу; иначе «замирает».
 *   3. Стоп, если дошли до done, если следующий переход оказался бы в будущем,
 *      или если упёрлись в maxTransitions.
 */
function generateLifecycle(createdAt, options, helpers, now) {
  const { randomInt, chance, pickWeighted } = helpers;

  const events = [{ from: null, to: 'open', at: createdAt }];
  let current = 'open';
  let time = createdAt;

  for (let step = 0; step < options.maxTransitions; step++) {
    const possibleNext = TRANSITIONS[current];
    if (possibleNext.length === 0) break; // done — дальше идти некуда
    if (!chance(options.continueChance)) break; // задача «замерла» в текущем статусе

    const nextTime = addHours(time, randomInt(options.minGapHours, options.maxGapHours));
    if (nextTime > now) break; // событий из будущего быть не должно

    const next = pickWeighted(possibleNext);
    events.push({ from: current, to: next, at: nextTime });
    current = next;
    time = nextTime;
  }

  return { events, finalStatus: current };
}

/**
 * Задачи и их история — генерируются ВМЕСТЕ, одна задача за раз.
 * id задач и записей истории — сквозные счётчики 1, 2, 3, ...
 */
function generateTasksWithHistory(products, options, helpers, now) {
  const { randomInt, pick, chance, randomDateBetween } = helpers;
  const tasks = [];
  const history = [];
  let nextHistoryId = 1;

  // Окно создания задач: от (now - taskWindowDays) до (now - 1 день),
  // чтобы у самых свежих задач было хоть немного времени на переходы.
  const windowStart = addDays(now, -options.taskWindowDays);
  const windowEnd = addDays(now, -1);

  for (let taskId = 1; taskId <= options.taskCount; taskId++) {
    const product = pick(products);
    const productId = product[0];
    const productName = product[1];

    const createdAt = randomDateBetween(windowStart, windowEnd);
    const { events, finalStatus } = generateLifecycle(createdAt, options, helpers, now);

    for (const event of events) {
      // Порядок значений = COLUMNS.tasks_history
      history.push([nextHistoryId++, taskId, event.from, event.to, toSqlDateTime(event.at)]);
    }

    const name = `${pick(TASK_ACTIONS)} ${pick(TASK_SUBJECTS)}`;
    const dueDate = chance(options.noDueDateChance) ? null : toSqlDate(addDays(createdAt, randomInt(7, 30)));

    // Порядок значений = COLUMNS.tasks
    tasks.push([
      taskId,
      productId,
      name,
      `${name} for ${productName}.`,
      finalStatus, // ← берётся из истории, поэтому всегда совпадает с последним to_status
      pick(ASSIGNEES),
      toSqlDateTime(createdAt),
      dueDate,
    ]);
  }

  return { tasks, history };
}

/**
 * Точка входа модуля.
 *
 * @param {object} overrides — необязательные настройки поверх DEFAULT_OPTIONS,
 *   например generateData({ taskCount: 100 }) для быстрой проверки.
 *   now — «текущий момент», относительно которого строятся даты (удобно фиксировать в тестах).
 * @returns {{ products: any[][], tasks: any[][], history: any[][] }}
 *   Три массива строк; порядок значений в строке совпадает с COLUMNS.
 */
export function generateData(overrides = {}) {
  const { now = new Date(), ...rest } = overrides;
  const options = { ...DEFAULT_OPTIONS, ...rest };
  const helpers = createHelpers(createRandom(options.seed));

  const products = generateProducts(options, helpers, now);
  const { tasks, history } = generateTasksWithHistory(products, options, helpers, now);

  return { products, tasks, history };
}
