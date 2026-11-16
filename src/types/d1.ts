/**
 * Minimal structural subset of the Cloudflare D1 API used by the adapters.
 * Cloudflare's `D1Database` (and Miniflare's) satisfy these interfaces, which
 * keeps the shared code free of the global Workers type definitions.
 */
export interface D1ResultMeta {
  changes?: number;
  [key: string]: unknown;
}

export interface D1Result<T = unknown> {
  results: T[];
  success: boolean;
  meta: D1ResultMeta;
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  all<T = unknown>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(query: string): D1PreparedStatement;
  /** Executes the statements atomically, in order. */
  batch<T = unknown>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}
