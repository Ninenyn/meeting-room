// Run only against a dedicated TEST_DATABASE_URL, never production.
import pg from "pg";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
if (!process.env.TEST_DATABASE_URL)
  throw new Error("TEST_DATABASE_URL required (isolated test database)");
const pool = new pg.Pool({
  connectionString: process.env.TEST_DATABASE_URL,
  max: 4,
});
const schema = "test_roomly_" + Date.now();
const c = await pool.connect();
try {
  await c.query("CREATE SCHEMA " + schema);
  await c.query("SET search_path TO " + schema + ",public");
  await c.query(
    readFileSync(new URL("../db/001-init.sql", import.meta.url), "utf8"),
  );
  const user = (
    await c.query(
      "INSERT INTO users(name,email,password_hash,role) VALUES('Test','test@example.invalid','unused','member') RETURNING id",
    )
  ).rows[0].id;
  const insert =
    "INSERT INTO " +
    schema +
    ".bookings(room_id,user_id,title,attendees,starts_at,ends_at) VALUES($1,$2,'Race test',2,$3,$4) RETURNING id";
  const args = [
    1,
    user,
    "2030-01-01T09:00:00+07:00",
    "2030-01-01T10:00:00+07:00",
  ];
  const result = await Promise.allSettled([
    pool.query(insert, args),
    pool.query(insert, args),
  ]);
  assert.equal(result.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal(
    result.filter((r) => r.status === "rejected" && r.reason.code === "23P01")
      .length,
    1,
  );
  await pool.query(insert, [
    1,
    user,
    "2030-01-01T10:00:00+07:00",
    "2030-01-01T11:00:00+07:00",
  ]);
  await pool.query(insert, [2, user, args[2], args[3]]);
  await c.query(
    "UPDATE bookings SET status='cancelled' WHERE room_id=1 AND starts_at=$1",
    [args[2]],
  );
  await pool.query(insert, args);
  await assert.rejects(
    () =>
      pool.query(insert, [
        1,
        user,
        "2030-01-01T09:30:00+07:00",
        "2030-01-01T10:30:00+07:00",
      ]),
    (e: any) => e.code === "23P01",
  );
  console.log(
    "PASS: simultaneous double booking rejected; adjacent/different-room accepted; cancellation releases slot; partial overlap rejected",
  );
} finally {
  await c.query("DROP SCHEMA " + schema + " CASCADE");
  c.release();
  await pool.end();
}
