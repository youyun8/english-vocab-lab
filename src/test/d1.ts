import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * A D1-compatible adapter backed by `node:sqlite`.
 *
 * Worker tests run against the real migration and real SQL rather than a
 * hand-written mock, so constraints, indexes and — crucially — the `user_id`
 * predicates that enforce cross-user isolation are all genuinely exercised.
 */

type Row = Record<string, unknown>;

// `import.meta.url` is resolved as a plain string so the Workers `URL` global
// and Node's `URL` type do not have to agree.
const ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url).href));

class TestPreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): TestPreparedStatement {
    const next = new TestPreparedStatement(this.db, this.sql);
    next.params = values.map(normalize);
    return next;
  }

  async first<T = Row>(): Promise<T | null> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[]));
    const row = rows[0];
    return row ? ({ ...row } as T) : null;
  }

  async all<T = Row>(): Promise<{ results: T[]; success: true }> {
    const rows = this.db.prepare(this.sql).all(...(this.params as never[]));
    return { results: rows.map((row) => ({ ...row }) as T), success: true };
  }

  async run(): Promise<{ success: true }> {
    // `all` handles both mutations and `RETURNING`, which `run` cannot.
    this.db.prepare(this.sql).all(...(this.params as never[]));
    return { success: true };
  }
}

/** SQLite has no boolean type; D1 callers already pass 0/1, but be tolerant. */
function normalize(value: unknown): unknown {
  if (typeof value === 'boolean') return value ? 1 : 0;
  if (value === undefined) return null;
  return value;
}

export interface TestDatabase {
  /** Structurally compatible with the `D1Database` binding. */
  db: unknown;
  close: () => void;
  raw: DatabaseSync;
}

export function createTestD1(): TestDatabase {
  const sqlite = new DatabaseSync(':memory:');
  const migration = readFileSync(resolve(ROOT, 'migrations/0001_initial.sql'), 'utf8');
  sqlite.exec(migration);

  const database = {
    prepare: (sql: string) => new TestPreparedStatement(sqlite, sql),
    batch: async (statements: TestPreparedStatement[]) => {
      sqlite.exec('BEGIN');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        sqlite.exec('COMMIT');
        return results;
      } catch (error) {
        sqlite.exec('ROLLBACK');
        throw error;
      }
    },
    dump: async () => new ArrayBuffer(0),
    exec: async (sql: string) => {
      sqlite.exec(sql);
      return { count: 0, duration: 0 };
    },
  };

  return { db: database, close: () => sqlite.close(), raw: sqlite };
}
