/**
 * Deterministic test data generator. Pure module: no Forge SQL, so it can be run locally with node.
 * Builds row arrays for products, tasks and tasks_history in the column order of migrations.js.
 *
 * Task status is derived from the generated history, so it always matches the last to_status.
 */

export const STATUSES = ['open', 'in_progress', 'review', 'testing', 'done'];

// Column order per table. Every generated row is an array of values in this order.
export const COLUMNS = {
  products: ['id', 'name', 'organization', 'state', 'created_at'],
  tasks: ['id', 'product_id', 'name', 'description', 'status', 'assignee', 'created_at', 'due_date'],
  tasks_history: ['id', 'task_id', 'from_status', 'to_status', 'changed_at'],
};

// Allowed status transitions with relative weights.
// Going back to in_progress means rework; done is final.
const TRANSITIONS = {
  open: [['in_progress', 1]],
  in_progress: [['review', 1]],
  review: [['testing', 3], ['in_progress', 1]],
  testing: [['done', 4], ['in_progress', 1]],
  done: [],
};

// Defaults, each can be overridden via generateData({ ... }).
const DEFAULT_OPTIONS = {
  seed: 42, // same seed -> same data
  productCount: 15,
  taskCount: 1400, // ~5000 history rows with the other defaults
  taskWindowDays: 180, // tasks are created within the last N days
  continueChance: 0.8, // chance a task makes one more transition
  maxTransitions: 12, // guards against endless review <-> in_progress loops
  minGapHours: 2,
  maxGapHours: 72,
  noDueDateChance: 0.15, // share of tasks with due_date = NULL
  archivedChance: 0.2, // share of archived products
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

// Seeded PRNG (mulberry32): like Math.random(), but reproducible for the same seed.
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

function createHelpers(random) {
  // Integer in [min, max].
  const randomInt = (min, max) => min + Math.floor(random() * (max - min + 1));

  const pick = (items) => items[Math.floor(random() * items.length)];

  const chance = (probability) => random() < probability;

  const randomDateBetween = (from, to) =>
    new Date(from.getTime() + Math.floor(random() * (to.getTime() - from.getTime())));

  // Weighted pick: [['a', 3], ['b', 1]] -> 'a' in 75% of cases.
  const pickWeighted = (options) => {
    const total = options.reduce((sum, [, weight]) => sum + weight, 0);
    let point = random() * total;
    for (const [value, weight] of options) {
      point -= weight;
      if (point < 0) return value;
    }
    return options[options.length - 1][0]; // guard against floating point rounding
  };

  return { randomInt, pick, chance, randomDateBetween, pickWeighted };
}

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// Return new Date objects, never mutate the input.
const addHours = (date, hours) => new Date(date.getTime() + hours * HOUR_MS);
const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

// Date -> 'YYYY-MM-DD HH:MM:SS' (UTC) for DATETIME columns.
export const toSqlDateTime = (date) => date.toISOString().slice(0, 19).replace('T', ' ');

// Date -> 'YYYY-MM-DD' (UTC) for DATE columns.
export const toSqlDate = (date) => date.toISOString().slice(0, 10);

// Names are prefix + suffix by index, so they are unique (8 x 5 = 40 max).
// Products are created 200-365 days ago, i.e. before any task.
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

    // Same order as COLUMNS.products
    products.push([
      i + 1,
      `${prefix} ${suffix}`,
      pick(ORGANIZATIONS),
      chance(options.archivedChance) ? 'archived' : 'active',
      toSqlDateTime(createdAt),
    ]);
  }
  return products;
}

/**
 * Status timeline of one task: starts with null -> open, then follows TRANSITIONS
 * until done, a random stop, a future timestamp or maxTransitions.
 * Returns the events { from, to, at } and the final status.
 */
function generateLifecycle(createdAt, options, helpers, now) {
  const { randomInt, chance, pickWeighted } = helpers;

  const events = [{ from: null, to: 'open', at: createdAt }];
  let current = 'open';
  let time = createdAt;

  for (let step = 0; step < options.maxTransitions; step++) {
    const possibleNext = TRANSITIONS[current];
    if (possibleNext.length === 0) break;
    if (!chance(options.continueChance)) break;

    const nextTime = addHours(time, randomInt(options.minGapHours, options.maxGapHours));
    if (nextTime > now) break; // no events in the future

    const next = pickWeighted(possibleNext);
    events.push({ from: current, to: next, at: nextTime });
    current = next;
    time = nextTime;
  }

  return { events, finalStatus: current };
}

// Tasks and their history are generated together, one task at a time.
function generateTasksWithHistory(products, options, helpers, now) {
  const { randomInt, pick, chance, randomDateBetween } = helpers;
  const tasks = [];
  const history = [];
  let nextHistoryId = 1;

  // Window ends a day ago so even the newest tasks have time for some transitions.
  const windowStart = addDays(now, -options.taskWindowDays);
  const windowEnd = addDays(now, -1);

  for (let taskId = 1; taskId <= options.taskCount; taskId++) {
    const product = pick(products);
    const productId = product[0];
    const productName = product[1];

    const createdAt = randomDateBetween(windowStart, windowEnd);
    const { events, finalStatus } = generateLifecycle(createdAt, options, helpers, now);

    for (const event of events) {
      // Same order as COLUMNS.tasks_history
      history.push([nextHistoryId++, taskId, event.from, event.to, toSqlDateTime(event.at)]);
    }

    const name = `${pick(TASK_ACTIONS)} ${pick(TASK_SUBJECTS)}`;
    const dueDate = chance(options.noDueDateChance) ? null : toSqlDate(addDays(createdAt, randomInt(7, 30)));

    // Same order as COLUMNS.tasks
    tasks.push([
      taskId,
      productId,
      name,
      `${name} for ${productName}.`,
      finalStatus, // derived from history
      pick(ASSIGNEES),
      toSqlDateTime(createdAt),
      dueDate,
    ]);
  }

  return { tasks, history };
}

/**
 * @param {object} overrides - options on top of DEFAULT_OPTIONS; `now` fixes the reference date.
 * @returns {{ products: any[][], tasks: any[][], history: any[][] }} rows in COLUMNS order.
 */
export function generateData(overrides = {}) {
  const { now = new Date(), ...rest } = overrides;
  const options = { ...DEFAULT_OPTIONS, ...rest };
  const helpers = createHelpers(createRandom(options.seed));

  const products = generateProducts(options, helpers, now);
  const { tasks, history } = generateTasksWithHistory(products, options, helpers, now);

  return { products, tasks, history };
}
