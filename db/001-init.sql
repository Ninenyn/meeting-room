CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS users (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text NOT NULL UNIQUE, name text NOT NULL,
 department text NOT NULL DEFAULT '', password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','member')),
 active boolean NOT NULL DEFAULT true, must_change_password boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions(token_hash text PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id),expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS login_attempts(key text PRIMARY KEY, count int NOT NULL, window_start timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS bookings(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), room_id int NOT NULL CHECK(room_id IN (1,2,3)),
 user_id uuid NOT NULL REFERENCES users(id), title text NOT NULL CHECK(length(title) BETWEEN 2 AND 120),
 attendees int NOT NULL CHECK(attendees>0 AND attendees<=CASE room_id WHEN 1 THEN 10 WHEN 2 THEN 15 ELSE 20 END),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL, note text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')), revision int NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(ends_at>starts_at),
 EXCLUDE USING gist(room_id WITH =,tstzrange(starts_at,ends_at,'[)') WITH &&) WHERE(status='confirmed')
);
CREATE INDEX IF NOT EXISTS bookings_date_idx ON bookings(starts_at);
CREATE TABLE IF NOT EXISTS audit_log(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,user_id uuid REFERENCES users(id),action text NOT NULL, booking_id uuid,created_at timestamptz NOT NULL DEFAULT now());
