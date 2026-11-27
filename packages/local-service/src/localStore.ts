import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import initSqlJs from "sql.js/dist/sql-wasm-inline.js";
import type { Database } from "sql.js";

// A small document repository over SQLite preserves the existing agent operations.
// Writes are serialized, transactional, and atomically persisted before notifying the UI.
type Data = Record<string, any>;
let database: Database;
let directory: string;
let tail: Promise<unknown> = Promise.resolve();
export const storeEvents = new EventEmitter();
export async function initializeLocalStore(dir: string): Promise<void> {
  await tail;
  database?.close();
  directory = dir;
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const SQL = await initSqlJs();
  const filename = path.join(dir, "focus.sqlite");
  database = new SQL.Database(fs.existsSync(filename) ? fs.readFileSync(filename) : undefined);
  database.run(
    "CREATE TABLE IF NOT EXISTS documents (path TEXT PRIMARY KEY, parent TEXT NOT NULL, data TEXT NOT NULL)",
  );
  database.run("CREATE INDEX IF NOT EXISTS documents_parent ON documents(parent)");
  // A terminated process cannot leave sessions locked forever.
  for (const row of rows("sessions")) {
    const data = row.data;
    data.updateInFlight = false;
    if (data.status === "reporting") data.status = "stopped";
    write(row.path, data);
  }
  persist();
}
function persist() {
  const filename = path.join(directory, "focus.sqlite");
  const temp = `${filename}.tmp`;
  fs.writeFileSync(temp, database.export(), { mode: 0o600 });
  const fd = fs.openSync(temp, "r");
  try {
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(temp, filename);
}
function read(key: string): Data | undefined {
  const stmt = database.prepare("SELECT data FROM documents WHERE path = ?");
  try {
    stmt.bind([key]);
    return stmt.step() ? JSON.parse(stmt.getAsObject().data as string) : undefined;
  } finally {
    stmt.free();
  }
}
function rows(parent: string): { path: string; data: Data }[] {
  const stmt = database.prepare("SELECT path, data FROM documents WHERE parent = ?");
  const result: { path: string; data: Data }[] = [];
  try {
    stmt.bind([parent]);
    while (stmt.step()) {
      const row = stmt.getAsObject();
      result.push({ path: row.path as string, data: JSON.parse(row.data as string) });
    }
  } finally {
    stmt.free();
  }
  return result;
}
function write(key: string, value: Data) {
  database.run("INSERT OR REPLACE INTO documents VALUES (?, ?, ?)", [
    key,
    key.slice(0, key.lastIndexOf("/")),
    JSON.stringify(value),
  ]);
}
function validSegment(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(id)) throw new Error("Invalid local record identifier");
  return id;
}
class Transform {
  constructor(
    public kind: "increment" | "delete",
    public amount = 0,
  ) {}
}
export const FieldValue = {
  increment: (n: number) => new Transform("increment", n),
  delete: () => new Transform("delete"),
};
function patch(target: Data, changes: Data): Data {
  for (const [key, value] of Object.entries(changes)) {
    if (value === undefined) continue;
    const parts = key.split(".");
    let node = target;
    for (const part of parts.slice(0, -1)) node = node[part] ??= {};
    const field = parts[parts.length - 1];
    if (value instanceof Transform) {
      if (value.kind === "delete") delete node[field];
      else node[field] = (node[field] ?? 0) + value.amount;
    } else node[field] = value;
  }
  return target;
}
class Snapshot {
  constructor(
    public ref: DocumentReference,
    private value: Data | undefined,
  ) {}
  get id() {
    return this.ref.id;
  }
  get exists() {
    return this.value !== undefined;
  }
  data(): Data | undefined {
    return this.value;
  }
  get(field: string) {
    return this.value?.[field];
  }
}
class Query {
  constructor(
    public path: string,
    private filters: [string, unknown][] = [],
    private sort?: [string, string],
    private maximum = Infinity,
  ) {}
  where(field: string, operator: string, value: unknown) {
    if (operator !== "==") throw new Error("Unsupported query operator");
    return new Query(this.path, [...this.filters, [field, value]], this.sort, this.maximum);
  }
  orderBy(field: string, direction = "asc") {
    return new Query(this.path, this.filters, [field, direction], this.maximum);
  }
  limit(maximum: number) {
    return new Query(this.path, this.filters, this.sort, maximum);
  }
  async get() {
    await tail;
    const result = rows(this.path).filter((row) =>
      this.filters.every(([field, value]) => row.data[field] === value),
    );
    if (this.sort) {
      const [field, dir] = this.sort;
      result.sort(
        (a, b) =>
          (a.data[field] < b.data[field] ? -1 : a.data[field] > b.data[field] ? 1 : 0) *
          (dir === "desc" ? -1 : 1),
      );
    }
    const docs = result
      .slice(0, this.maximum)
      .map((row) => new Snapshot(new DocumentReference(row.path), row.data));
    return { docs, empty: docs.length === 0, size: docs.length };
  }
  doc(id: string = randomUUID()) {
    return new DocumentReference(`${this.path}/${validSegment(id)}`);
  }
}
export class DocumentReference {
  constructor(public path: string) {}
  get id() {
    return this.path.slice(this.path.lastIndexOf("/") + 1);
  }
  collection(name: string) {
    return new Query(`${this.path}/${validSegment(name)}`);
  }
  async get() {
    await tail;
    return new Snapshot(this, read(this.path));
  }
  async set(value: Data, options?: { merge?: boolean }) {
    await transact((tx) => {
      tx.set(this, value, options);
    });
  }
  async update(value: Data) {
    await transact((tx) => {
      tx.update(this, value);
    });
  }
  async delete() {
    await transact((tx) => {
      tx.delete(this);
    });
  }
}
class Transaction {
  async get(ref: DocumentReference) {
    return new Snapshot(ref, read(ref.path));
  }
  set(ref: DocumentReference, value: Data, options?: { merge?: boolean }) {
    write(ref.path, patch(options?.merge ? (read(ref.path) ?? {}) : {}, value));
  }
  update(ref: DocumentReference, value: Data) {
    const previous = read(ref.path);
    if (!previous) throw new Error("Local record no longer exists");
    write(ref.path, patch(previous, value));
  }
  delete(ref: DocumentReference) {
    database.run("DELETE FROM documents WHERE path = ?", [ref.path]);
  }
}
function transact<T>(work: (tx: Transaction) => T | Promise<T>): Promise<T> {
  const job = tail.then(async () => {
    const prior = database.export();
    database.run("BEGIN");
    let result: T;
    try {
      result = await work(new Transaction());
      database.run("COMMIT");
    } catch (error) {
      database.run("ROLLBACK");
      throw error;
    }
    try {
      persist();
    } catch (error) {
      database.close();
      const SQL = await initSqlJs();
      database = new SQL.Database(prior);
      throw error;
    }
    storeEvents.emit("change");
    return result;
  });
  tail = job.catch(() => undefined);
  return job;
}
export const db = {
  collection: (name: string) => new Query(validSegment(name)),
  runTransaction: transact,
  batch() {
    const operations: ((tx: Transaction) => void)[] = [];
    return {
      set(ref: DocumentReference, value: Data, options?: { merge?: boolean }) {
        operations.push((tx) => tx.set(ref, value, options));
      },
      commit: () =>
        transact((tx) => {
          for (const operation of operations) operation(tx);
        }),
    };
  },
  recursiveDelete(ref: DocumentReference) {
    return transact(() => {
      database.run("DELETE FROM documents WHERE path = ? OR substr(path, 1, ?) = ?", [
        ref.path,
        ref.path.length + 1,
        `${ref.path}/`,
      ]);
    });
  },
};
function imagePath(key: string): string {
  if (!/^screenshots\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(key))
    throw new Error("Invalid screenshot path");
  return path.join(directory, key);
}
export const bucket = {
  file(key: string) {
    const filename = imagePath(key);
    return {
      async save(buffer: Buffer, _options?: unknown) {
        fs.mkdirSync(path.dirname(filename), { recursive: true, mode: 0o700 });
        fs.writeFileSync(filename, buffer, { mode: 0o600 });
      },
      async download(): Promise<[Buffer]> {
        return [fs.readFileSync(filename)];
      },
      async getMetadata() {
        const bytes = fs.readFileSync(filename);
        return [
          { contentType: bytes[0] === 0xff && bytes[1] === 0xd8 ? "image/jpeg" : "image/png" },
        ];
      },
    };
  },
  async deleteFiles({ prefix }: { prefix: string; force?: boolean }) {
    if (!/^screenshots\/[A-Za-z0-9_-]+\/$/.test(prefix))
      throw new Error("Invalid screenshot prefix");
    fs.rmSync(path.join(directory, prefix), { recursive: true, force: true });
  },
};
