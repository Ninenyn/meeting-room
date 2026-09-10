import { db } from "../server/db.js";
import { hashPassword } from "../server/auth.js";
import { z } from "zod";
// Pass admin information via environment; never put credentials in command arguments.
const b = z
  .object({
    ADMIN_EMAIL: z.string().email(),
    ADMIN_NAME: z.string().min(2),
    ADMIN_PASSWORD: z.string().min(12).max(128),
  })
  .parse(process.env);
const pool = db();
try {
  await pool.query(
    "INSERT INTO users(name,email,password_hash,role) VALUES($1,$2,$3,'admin')",
    [b.ADMIN_NAME, b.ADMIN_EMAIL.toLowerCase(), hashPassword(b.ADMIN_PASSWORD)],
  );
  console.log("Admin created; password change required on first login");
} finally {
  await pool.end();
}
