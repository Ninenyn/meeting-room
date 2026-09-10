import { readFileSync } from "node:fs";
import { db } from "../server/db.js";
const pool = db();
const c = await pool.connect();
try {
  await c.query("BEGIN");
  await c.query(
    await readFileSync(new URL("../db/001-init.sql", import.meta.url), "utf8"),
  );
  await c.query("COMMIT");
  console.log("Database schema ready");
} catch (e) {
  await c.query("ROLLBACK");
  throw e;
} finally {
  c.release();
  await pool.end();
}
