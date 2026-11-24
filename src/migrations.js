import { migrationRunner } from '@forge/sql';
import { Queue } from '@forge/events';

// Migrations are tracked by name: changing the text of an applied migration
// does not re-run it. Schema changes must be added as new migrations.

const CREATE_PRODUCTS = `
  CREATE TABLE IF NOT EXISTS products (
    id           INT          PRIMARY KEY,
    name         VARCHAR(255) NOT NULL,
    organization VARCHAR(255) NOT NULL,
    state        VARCHAR(32)  NOT NULL,
    created_at   DATETIME     NOT NULL
  )
`;

const CREATE_TASKS = `
  CREATE TABLE IF NOT EXISTS tasks (
    id          INT          PRIMARY KEY,
    product_id  INT          NOT NULL,
    name        VARCHAR(255) NOT NULL,
    description VARCHAR(255) NOT NULL,
    status      VARCHAR(32)  NOT NULL,
    assignee    VARCHAR(255) NOT NULL,
    created_at  DATETIME     NOT NULL,
    due_date    DATE         NULL,
    INDEX idx_product_id (product_id),
    INDEX idx_created_at (created_at),
    INDEX idx_status (status)
  )
`;

const CREATE_TASKS_HISTORY = `
  CREATE TABLE IF NOT EXISTS tasks_history (
    id          INT         PRIMARY KEY,
    task_id     INT         NOT NULL,
    from_status VARCHAR(32) NULL,
    to_status   VARCHAR(32) NOT NULL,
    changed_at  DATETIME    NOT NULL,
    INDEX idx_task_id (task_id),
    INDEX idx_changed_at (changed_at)
  )
`;

// Async events queue. Its consumer (runMigrationsQueued) gets a 15-minute
// timeout instead of the ~55 seconds a regular trigger function has.
const migrationQueue = new Queue({ key: 'schema-migration-queue' });

// Lifecycle trigger handler (manifest.yml: app-lifecycle-trigger).
// Fires on avi:forge:installed:app (new install) and avi:forge:upgraded:app
// (major version upgrade). It only schedules the work and returns quickly.
export const enqueue = async (event) => {
  console.log(`Lifecycle event ${event?.eventType}: queueing migrations`);
  await migrationQueue.push({ body: { reason: event?.eventType ?? 'unknown' } });
};

// Applies pending migrations. Used by two callers:
//  - the queue consumer, right after install / major upgrade;
//  - the hourly scheduled trigger, a fallback for minor deploys, which fire no event.
// Safe to run repeatedly: already applied migrations are skipped by name.
export const run = async () => {
  try {
    console.log('Running migrations...');

    await migrationRunner
      .enqueue('v001_create_products', CREATE_PRODUCTS)
      .enqueue('v002_create_tasks', CREATE_TASKS)
      .enqueue('v003_create_tasks_history', CREATE_TASKS_HISTORY)
      .run();

    console.log('Migrations done');
  } catch (err) {
    console.error('Migrations failed', err);
    // Rethrow the original error to keep its message and stack trace.
    throw err;
  }
};
