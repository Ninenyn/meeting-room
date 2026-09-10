import { createServer } from "node:http";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { randomUUID, randomBytes } from "node:crypto";
if (!process.env.TEST_DATABASE_URL)
  throw new Error("Dedicated TEST_DATABASE_URL required");
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.SESSION_SECRET = randomBytes(48).toString("hex");
const { db } = await import("../server/db.js");
const { hashPassword } = await import("../server/auth.js");
const { default: handler } = await import("../api/index.js");
const pool = db();
await pool.query(
  readFileSync(new URL("../db/001-init.sql", import.meta.url), "utf8"),
);
const prefix = randomUUID().slice(0, 8),
  pw = "Roomly-test-password-123";
const ids: string[] = [];
const server = createServer(async (req, res) => {
  let raw = "";
  for await (const c of req) raw += c;
  (req as any).body = raw ? JSON.parse(raw) : {};
  await handler(req, res);
});
await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
const port = (server.address() as any).port;
const origin = "http://127.0.0.1:" + port;
async function call(
  op: string,
  body?: unknown,
  cookie = "",
  headerOrigin = origin,
) {
  const r = await fetch(origin + "/api?op=" + op, {
    method: body ? "POST" : "GET",
    headers: {
      ...(body
        ? { "Content-Type": "application/json", Origin: headerOrigin }
        : {}),
      ...(cookie ? { cookie } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookie: r.headers.get("set-cookie")?.split(";")[0] || "",
  };
}
try {
  for (const [name, role] of [
    ["admin", "admin"],
    ["alice", "member"],
    ["bob", "member"],
  ]) {
    const r = await pool.query(
      "INSERT INTO users(name,email,password_hash,role,must_change_password) VALUES($1,$2,$3,$4,false) RETURNING id",
      [name, prefix + name + "@example.invalid", hashPassword(pw), role],
    );
    ids.push(r.rows[0].id);
  }
  assert.equal((await call("state")).status, 401);
  assert.equal(
    (
      await call(
        "login",
        { email: prefix + "alice@example.invalid", password: pw },
        "",
        "https://evil.invalid",
      )
    ).status,
    403,
  );
  const login = async (name: string) =>
    (
      await call("login", {
        email: prefix + name + "@example.invalid",
        password: pw,
      })
    ).cookie;
  const alice = await login("alice"),
    bob = await login("bob"),
    admin = await login("admin");
  assert.ok(alice && bob && admin);
  const d = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const b = {
    roomId: 1,
    title: "Integration meeting",
    attendees: 5,
    start: d + "T09:00:00+07:00",
    end: d + "T10:00:00+07:00",
    note: "",
  };
  const race = await Promise.all([
    call("create", b, alice),
    call("create", b, bob),
  ]);
  assert.deepEqual(race.map((r) => r.status).sort(), [201, 409]);
  const created = race.find((r) => r.status === 201)!.data.booking;
  const owner = created.user_id === ids[1] ? alice : bob;
  const other = owner === alice ? bob : alice;
  assert.equal(
    (await call("update", { ...b, id: created.id, revision: 1 }, other)).status,
    403,
  );
  assert.equal((await call("create", { ...b, roomId: 2 }, other)).status, 201);
  assert.equal(
    (
      await call(
        "create",
        { ...b, start: d + "T10:00:00+07:00", end: d + "T11:00:00+07:00" },
        other,
      )
    ).status,
    201,
  );
  assert.equal(
    (
      await call(
        "update",
        { ...b, title: "Changed", id: created.id, revision: 1 },
        owner,
      )
    ).status,
    200,
  );
  assert.equal(
    (await call("update", { ...b, id: created.id, revision: 1 }, owner)).status,
    409,
  );
  assert.equal(
    (await call("cancel", { id: created.id, revision: 2 }, owner)).status,
    200,
  );
  assert.equal((await call("create", b, other)).status, 201);
  assert.equal(
    (await call("user-status", { id: ids[2], active: false }, alice)).status,
    404,
  );
  assert.equal(
    (await call("user-status", { id: ids[2], active: false }, admin)).status,
    200,
  );
  assert.equal((await call("state", undefined, bob)).status, 401);
  assert.equal((await call("logout", {}, alice)).status, 200);
  assert.equal((await call("state", undefined, alice)).status, 401);
  console.log(
    "PASS: login, CSRF, API concurrent conflict, adjacency, different room, ownership, revision conflict, cancellation, account disable and logout",
  );
} finally {
  await pool.query("DELETE FROM audit_log WHERE user_id=ANY($1::uuid[])", [
    ids,
  ]);
  await pool.query("DELETE FROM bookings WHERE user_id=ANY($1::uuid[])", [ids]);
  await pool.query("DELETE FROM sessions WHERE user_id=ANY($1::uuid[])", [ids]);
  await pool.query("DELETE FROM users WHERE id=ANY($1::uuid[])", [ids]);
  await new Promise<void>((r) => server.close(() => r()));
  await pool.end();
}
