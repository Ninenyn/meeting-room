import pg from "pg";
let pool: pg.Pool | undefined;
export function db() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_NOT_CONFIGURED");
  return (pool ??= new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: 3,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
  }));
}
