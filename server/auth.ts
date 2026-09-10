import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHmac,
} from "node:crypto";
export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return salt + ":" + scryptSync(password, salt, 64).toString("hex");
}
export function checkPassword(password: string, hash: string) {
  const [salt, key] = hash.split(":");
  const expected = Buffer.from(key, "hex"),
    actual = scryptSync(password, salt, 64);
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
export function tokenHash(token: string) {
  if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32)
    throw new Error("SESSION_NOT_CONFIGURED");
  return createHmac("sha256", process.env.SESSION_SECRET)
    .update(token)
    .digest("hex");
}
export function sessionToken() {
  return randomBytes(32).toString("hex");
}
