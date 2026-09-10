import { test } from "node:test";
import assert from "node:assert/strict";
import { validateBooking, overlaps, rooms } from "../server/domain.js";
import { checkPassword, hashPassword } from "../server/auth.js";
const now = Date.parse("2026-09-10T00:00:00Z");
const base = {
  roomId: 1,
  title: "Weekly planning",
  attendees: 10,
  start: "2026-09-11T09:00:00+07:00",
  end: "2026-09-11T10:00:00+07:00",
  note: "",
};
test("three room capacities are fixed", () =>
  assert.deepEqual(
    rooms.map((r) => r.capacity),
    [10, 15, 20],
  ));
test("valid Thai time booking accepted", () =>
  assert.equal(validateBooking(base, now).roomId, 1));
test("capacity uses selected room", () => {
  assert.throws(() => validateBooking({ ...base, attendees: 11 }, now));
  assert.equal(
    validateBooking({ ...base, roomId: 2, attendees: 15 }, now).attendees,
    15,
  );
  assert.throws(() =>
    validateBooking({ ...base, roomId: 2, attendees: 16 }, now),
  );
});
test("past and advance limit", () => {
  assert.throws(() => validateBooking(base, Date.parse(base.start)));
  assert.throws(() =>
    validateBooking(
      {
        ...base,
        start: "2027-01-01T09:00:00+07:00",
        end: "2027-01-01T10:00:00+07:00",
      },
      now,
    ),
  );
});
test("opening closing duration boundaries", () => {
  assert.doesNotThrow(() =>
    validateBooking(
      {
        ...base,
        start: "2026-09-11T19:30:00+07:00",
        end: "2026-09-11T20:00:00+07:00",
      },
      now,
    ),
  );
  for (const [start, end] of [
    ["07:45", "08:30"],
    ["19:45", "20:15"],
    ["09:00", "09:15"],
    ["08:00", "16:15"],
    ["10:00", "09:00"],
    ["09:05", "10:00"],
  ])
    assert.throws(() =>
      validateBooking(
        {
          ...base,
          start: "2026-09-11T" + start + ":00+07:00",
          end: "2026-09-11T" + end + ":00+07:00",
        },
        now,
      ),
    );
});
test("no overnight meetings", () =>
  assert.throws(() =>
    validateBooking(
      {
        ...base,
        start: "2026-09-11T19:00:00+07:00",
        end: "2026-09-12T01:00:00+07:00",
      },
      now,
    ),
  ));
test("invalid payload and fractional capacity", () => {
  assert.throws(() => validateBooking({ ...base, roomId: 4 }, now));
  assert.throws(() => validateBooking({ ...base, attendees: 1.5 }, now));
  assert.throws(() => validateBooking({ ...base, title: " " }, now));
  assert.throws(() => validateBooking({ ...base, start: "invalid" }, now));
});
test("overlap includes contained equal and partial; allows adjacent", () => {
  assert.equal(overlaps(9, 10, 9, 10), true);
  assert.equal(overlaps(9, 12, 10, 11), true);
  assert.equal(overlaps(9, 11, 10, 12), true);
  assert.equal(overlaps(9, 10, 10, 11), false);
  assert.equal(overlaps(9, 10, 8, 9), false);
});
test("password salts and verification", () => {
  const a = hashPassword("correct-password");
  const b = hashPassword("correct-password");
  assert.notEqual(a, b);
  assert.equal(checkPassword("correct-password", a), true);
  assert.equal(checkPassword("wrong-password", a), false);
});
