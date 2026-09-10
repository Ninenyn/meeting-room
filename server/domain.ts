import { z } from "zod";
export const rooms = [
  { id: 1, name: "ห้องประชุม 1", capacity: 10 },
  { id: 2, name: "ห้องประชุม 2", capacity: 15 },
  { id: 3, name: "ห้องประชุม 3", capacity: 20 },
];
export const bookingSchema = z.object({
  roomId: z.number().int().min(1).max(3),
  title: z.string().trim().min(2).max(120),
  attendees: z.number().int().min(1).max(20),
  start: z.string().datetime({ offset: true }),
  end: z.string().datetime({ offset: true }),
  note: z.string().trim().max(500).default(""),
});
export function validateBooking(input: unknown, now = Date.now()) {
  const b = bookingSchema.parse(input);
  const s = new Date(b.start),
    e = new Date(b.end);
  const cap = rooms.find((r) => r.id === b.roomId)!.capacity;
  if (b.attendees > cap) throw new Error("จำนวนผู้เข้าร่วมเกินความจุห้อง");
  if (+s <= now) throw new Error("กรุณาเลือกเวลาในอนาคต");
  if (+s > now + 90 * 86400000) throw new Error("จองล่วงหน้าได้ไม่เกิน 90 วัน");
  if (+e - +s < 30 * 60000 || +e - +s > 8 * 3600000)
    throw new Error("ระยะเวลาจองต้องอยู่ระหว่าง 30 นาทีถึง 8 ชั่วโมง");
  const local = (d: Date) => new Date(+d + 7 * 3600000),
    a = local(s),
    z = local(e);
  if (
    a.toISOString().slice(0, 10) !== z.toISOString().slice(0, 10) ||
    a.getUTCHours() < 8 ||
    z.getUTCHours() > 20 ||
    (z.getUTCHours() === 20 && z.getUTCMinutes() > 0)
  )
    throw new Error("จองได้ภายในวันเดียวกัน เวลา 08:00–20:00 น.");
  if (
    s.getUTCMinutes() % 15 ||
    e.getUTCMinutes() % 15 ||
    s.getUTCSeconds() ||
    e.getUTCSeconds() ||
    s.getUTCMilliseconds() ||
    e.getUTCMilliseconds()
  )
    throw new Error("กรุณาเลือกเวลาเป็นช่วงละ 15 นาที");
  return b;
}
export const overlaps = (a: number, b: number, c: number, d: number) =>
  a < d && c < b;
