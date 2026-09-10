import type { IncomingMessage, ServerResponse } from "node:http";
import { z } from "zod";
import { db } from "../server/db.js";
import {
  hashPassword,
  checkPassword,
  tokenHash,
  sessionToken,
} from "../server/auth.js";
import { rooms, validateBooking } from "../server/domain.js";
type Req = IncomingMessage & { body?: unknown; query?: Record<string, string> };
const uuid = z.string().uuid();
const identity = z.object({
  name: z.string().trim().min(2).max(80),
  email: z
    .string()
    .trim()
    .email()
    .max(160)
    .transform((s) => s.toLowerCase()),
  department: z.string().trim().max(80).default(""),
  password: z.string().min(12).max(128),
});
function send(res: ServerResponse, status: number, data: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(data));
}
export default async function handler(req: Req, res: ServerResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const op =
      new URL(req.url || "/", "https://local").searchParams.get("op") ||
      "state";
    if (op === "health")
      return send(res, 200, {
        configured: Boolean(
          process.env.DATABASE_URL && process.env.SESSION_SECRET,
        ),
        app: "Roomly",
      });
    const pool = db();
    if (req.method !== "GET" && req.method !== "POST")
      return send(res, 405, { error: "ไม่รองรับคำขอนี้" });
    if (req.method === "POST") {
      const origin = req.headers.origin;
      const host = req.headers.host;
      if (
        !origin ||
        (!process.env.APP_ORIGIN
          ? new URL(origin).host !== host
          : origin !== process.env.APP_ORIGIN)
      )
        return send(res, 403, { error: "แหล่งที่มาของคำขอไม่ถูกต้อง" });
      if (!req.headers["content-type"]?.startsWith("application/json"))
        return send(res, 415, { error: "รูปแบบข้อมูลไม่ถูกต้อง" });
    }
    const body =
      typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    if (op === "login" && req.method === "POST") {
      const b = z
        .object({
          email: z.string().email().max(160),
          password: z.string().min(1).max(128),
        })
        .parse(body);
      const email = b.email.toLowerCase().trim(),
        ip = String(
          req.headers["x-real-ip"] || req.socket.remoteAddress || "unknown",
        );
      for (const key of ["email:" + email, "ip:" + ip]) {
        const { rows } = await pool.query(
          "INSERT INTO login_attempts(key,count,window_start) VALUES($1,1,now()) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN 1 ELSE login_attempts.count+1 END,window_start=CASE WHEN login_attempts.window_start<now()-interval '15 minutes' THEN now() ELSE login_attempts.window_start END RETURNING count",
          [tokenHash(key)],
        );
        if (rows[0].count > (key.startsWith("ip:") ? 50 : 10))
          return send(res, 429, {
            error: "ลองเข้าสู่ระบบหลายครั้งเกินไป กรุณารอ 15 นาที",
          });
      }
      const { rows } = await pool.query(
        "SELECT * FROM users WHERE email=$1 AND active=true",
        [email],
      );
      const user = rows[0];
      const valid = checkPassword(
        b.password,
        user?.password_hash || hashPassword("dummy-password-no-account"),
      );
      if (!user || !valid)
        return send(res, 401, { error: "อีเมลหรือรหัสผ่านไม่ถูกต้อง" });
      const token = sessionToken();
      await pool.query(
        "INSERT INTO sessions VALUES($1,$2,now()+interval '12 hours')",
        [tokenHash(token), user.id],
      );
      res.setHeader(
        "Set-Cookie",
        "roomly_session=" +
          token +
          "; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=43200",
      );
      return send(res, 200, { ok: true });
    }
    const token =
      req.headers.cookie
        ?.split(";")
        .map((v) => v.trim())
        .find((v) => v.startsWith("roomly_session="))
        ?.slice(15) || "";
    const { rows: ur } = await pool.query(
      "SELECT u.id,u.name,u.email,u.department,u.role,u.must_change_password FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true",
      [tokenHash(token)],
    );
    const user = ur[0];
    if (!user) return send(res, 401, { error: "กรุณาเข้าสู่ระบบ" });
    if (op === "logout" && req.method === "POST") {
      await pool.query("DELETE FROM sessions WHERE token_hash=$1", [
        tokenHash(token),
      ]);
      res.setHeader(
        "Set-Cookie",
        "roomly_session=; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=0",
      );
      return send(res, 200, { ok: true });
    }
    if (op === "password" && req.method === "POST") {
      const b = z
        .object({
          current: z.string().max(128),
          password: z.string().min(12).max(128),
        })
        .parse(body);
      const { rows } = await pool.query(
        "SELECT password_hash FROM users WHERE id=$1",
        [user.id],
      );
      if (!checkPassword(b.current, rows[0].password_hash))
        return send(res, 400, { error: "รหัสผ่านเดิมไม่ถูกต้อง" });
      if (b.current === b.password)
        return send(res, 400, { error: "กรุณาตั้งรหัสผ่านใหม่ที่ต่างจากเดิม" });
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        await c.query(
          "UPDATE users SET password_hash=$1,must_change_password=false WHERE id=$2",
          [hashPassword(b.password), user.id],
        );
        await c.query(
          "DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2",
          [user.id, tokenHash(token)],
        );
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      return send(res, 200, { ok: true });
    }
    if (op === "state" && req.method === "GET") {
      if (user.must_change_password)
        return send(res, 200, { user, rooms, bookings: [], users: [] });
      const date =
        new URL(req.url || "/", "https://local").searchParams.get("date") ||
        new Date().toISOString().slice(0, 10);
      z.string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .parse(date);
      const { rows: bookings } = await pool.query(
        "SELECT b.*,u.name AS organizer,u.department FROM bookings b JOIN users u ON u.id=b.user_id WHERE b.starts_at >= $1::date - interval '1 day' AND b.starts_at < $1::date + interval '8 days' ORDER BY b.starts_at",
        [date],
      );
      const users =
        user.role === "admin"
          ? (
              await pool.query(
                "SELECT id,name,email,department,role,active FROM users ORDER BY name",
              )
            ).rows
          : [];
      return send(res, 200, { user, rooms, bookings, users });
    }
    if (user.must_change_password)
      return send(res, 403, { error: "กรุณาเปลี่ยนรหัสผ่านก่อนเริ่มใช้งาน" });
    if (op === "users" && req.method === "POST" && user.role === "admin") {
      const b = identity.parse(body);
      await pool.query(
        "INSERT INTO users(name,email,department,password_hash,role) VALUES($1,$2,$3,$4,'member')",
        [b.name, b.email, b.department, hashPassword(b.password)],
      );
      return send(res, 201, { ok: true });
    }
    if (
      op === "user-status" &&
      req.method === "POST" &&
      user.role === "admin"
    ) {
      const b = z.object({ id: uuid, active: z.boolean() }).parse(body);
      if (b.id === user.id)
        return send(res, 400, { error: "ไม่สามารถปิดบัญชีตนเอง" });
      await pool.query(
        "UPDATE users SET active=$1 WHERE id=$2 AND role='member'",
        [b.active, b.id],
      );
      if (!b.active)
        await pool.query("DELETE FROM sessions WHERE user_id=$1", [b.id]);
      return send(res, 200, { ok: true });
    }
    if (
      op === "reset-password" &&
      req.method === "POST" &&
      user.role === "admin"
    ) {
      const b = z
        .object({ id: uuid, password: z.string().min(12).max(128) })
        .parse(body);
      if (b.id === user.id)
        return send(res, 400, {
          error: "ใช้เมนูเปลี่ยนรหัสผ่านสำหรับบัญชีตนเอง",
        });
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        const r = await c.query(
          "UPDATE users SET password_hash=$1,must_change_password=true WHERE id=$2 AND role='member' RETURNING id",
          [hashPassword(b.password), b.id],
        );
        if (r.rowCount)
          await c.query("DELETE FROM sessions WHERE user_id=$1", [b.id]);
        await c.query("COMMIT");
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
      return send(res, 200, { ok: true });
    }
    if (["create", "update", "cancel"].includes(op) && req.method === "POST") {
      const c = await pool.connect();
      try {
        await c.query("BEGIN");
        let existing;
        if (op !== "create") {
          const meta = z
            .object({ id: uuid, revision: z.number().int().positive() })
            .parse(body);
          const r = await c.query(
            "SELECT * FROM bookings WHERE id=$1 FOR UPDATE",
            [meta.id],
          );
          existing = r.rows[0];
          if (!existing) {
            await c.query("ROLLBACK");
            return send(res, 404, { error: "ไม่พบรายการจอง" });
          }
          if (existing.user_id !== user.id && user.role !== "admin") {
            await c.query("ROLLBACK");
            return send(res, 403, { error: "จัดการได้เฉพาะรายการจองของคุณ" });
          }
          if (
            existing.status !== "confirmed" ||
            existing.revision !== meta.revision
          ) {
            await c.query("ROLLBACK");
            return send(res, 409, {
              error: "รายการนี้ถูกแก้ไขแล้ว กรุณาโหลดข้อมูลใหม่",
            });
          }
          if (new Date(existing.starts_at).getTime() <= Date.now()) {
            await c.query("ROLLBACK");
            return send(res, 400, {
              error: "รายการที่เริ่มแล้วไม่สามารถแก้ไขหรือยกเลิกได้",
            });
          }
        }
        let row;
        if (op === "cancel")
          row = (
            await c.query(
              "UPDATE bookings SET status='cancelled',revision=revision+1,updated_at=now() WHERE id=$1 RETURNING *",
              [existing.id],
            )
          ).rows[0];
        else {
          const b = validateBooking(body);
          const values = [
            b.roomId,
            b.title,
            b.attendees,
            b.start,
            b.end,
            b.note,
          ];
          row =
            op === "create"
              ? (
                  await c.query(
                    "INSERT INTO bookings(room_id,title,attendees,starts_at,ends_at,note,user_id) VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *",
                    [...values, user.id],
                  )
                ).rows[0]
              : (
                  await c.query(
                    "UPDATE bookings SET room_id=$1,title=$2,attendees=$3,starts_at=$4,ends_at=$5,note=$6,revision=revision+1,updated_at=now() WHERE id=$7 RETURNING *",
                    [...values, existing.id],
                  )
                ).rows[0];
        }
        await c.query(
          "INSERT INTO audit_log(user_id,action,booking_id) VALUES($1,$2,$3)",
          [user.id, op, row.id],
        );
        await c.query("COMMIT");
        return send(res, op === "create" ? 201 : 200, { booking: row });
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      } finally {
        c.release();
      }
    }
    return send(res, 404, { error: "ไม่พบคำขอ" });
  } catch (e) {
    const err = e as Error & { code?: string };
    if (err.code === "23P01")
      return send(res, 409, {
        error: "ห้องนี้ถูกจองในช่วงเวลาที่เลือกแล้ว กรุณาเลือกเวลาอื่น",
      });
    if (err.code === "23505")
      return send(res, 409, { error: "มีข้อมูลนี้อยู่แล้ว" });
    if (err instanceof z.ZodError)
      return send(res, 400, {
        error: "กรุณาตรวจสอบข้อมูลให้ครบถ้วนและถูกต้อง",
      });
    if (/CONFIGURED/.test(err.message) || err.code === "42P01")
      return send(res, 503, {
        error: "ระบบยังไม่พร้อมใช้งาน กรุณาติดต่อผู้ดูแลเพื่อตั้งค่าระบบ",
      });
    if (/[ก-๙]/.test(err.message))
      return send(res, 400, { error: err.message });
    console.error("API error", err.code || err.name);
    return send(res, 500, { error: "ไม่สามารถดำเนินการได้ กรุณาลองอีกครั้ง" });
  }
}
