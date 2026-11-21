import { migrationRunner } from '@forge/sql';

const CREATE_PRODUCTS = `
  CREATE TABLE IF NOT EXISTS products (
  id           INT          PRIMARY KEY,
  name        VARCHAR(255) NOT NULL,
  organization        VARCHAR(255) NOT NULL,
  state  VARCHAR(32)         NOT NULL,
  created_at DATETIME NOT NULL
)
`

const CREATE_TASKS = `
CREATE TABLE IF NOT EXISTS tasks (
  id           INT          PRIMARY KEY,
  product_id     INT          NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description        VARCHAR(255) NOT NULL,
  status        VARCHAR(32) NOT NULL,
  assignee        VARCHAR(255) NOT NULL,
  created_at DATETIME         NOT NULL,
  due_date DATE NULL,
  INDEX idx_product_id (product_id),
  INDEX idx_created_at (created_at),
  INDEX idx_status (status)
)
`

const CREATE_TASKS_HISTORY = `
CREATE TABLE IF NOT EXISTS tasks_history (
  id           INT          PRIMARY KEY,
  task_id     INT          NOT NULL,
  from_status VARCHAR(32) NULL,
  to_status VARCHAR(32) NOT NULL,
  changed_at DATETIME NOT NULL,
  INDEX idx_task_id (task_id),
  INDEX idx_changed_at (changed_at)
)
`


export const run = async () => {

  try {
    console.log('Running migrations...')

    await migrationRunner
      .enqueue('v001_create_products', CREATE_PRODUCTS)
      .enqueue('v002_create_tasks', CREATE_TASKS)
      .enqueue('v003_create_tasks_history', CREATE_TASKS_HISTORY)
      .run();

    console.log('Migrations done')
  } catch (err) {
    console.error('Migrations failed', err);
    // Rethrow the original error to keep its message and stack trace.
    throw err;
  }
}
