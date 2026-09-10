import React, { useState, useEffect, useRef, useCallback } from "react";
import { createRoot } from "react-dom/client";
import {
  CalendarDays,
  DoorOpen,
  Users,
  Plus,
  ChevronLeft,
  ChevronRight,
  Clock,
  ArrowUpRight,
  LogOut,
  SlidersHorizontal,
  X,
  Check,
  Search,
  ShieldCheck,
  CalendarCheck,
  KeyRound,
  RefreshCw,
  LayoutGrid,
  Menu,
  Building2,
  AlertCircle,
} from "lucide-react";
import "./style.css";
type User = {
  id: string;
  name: string;
  email: string;
  department: string;
  role: string;
  active: boolean;
  must_change_password: boolean;
};
type Booking = {
  id: string;
  room_id: number;
  user_id: string;
  title: string;
  attendees: number;
  starts_at: string;
  ends_at: string;
  note: string;
  status: string;
  revision: number;
  organizer: string;
  department: string;
};
type Data = {
  user: User;
  rooms: { id: number; name: string; capacity: number }[];
  bookings: Booking[];
  users: User[];
};
const roomList = [
  { id: 1, name: "ห้องประชุม 1", capacity: 10 },
  { id: 2, name: "ห้องประชุม 2", capacity: 15 },
  { id: 3, name: "ห้องประชุม 3", capacity: 20 },
];
const day = (d = new Date()) =>
  new Date(+d + 7 * 3600000).toISOString().slice(0, 10);
const addDay = (d: string, n: number) =>
  day(new Date(new Date(d + "T12:00:00+07:00").getTime() + n * 86400000));
const time = (s: string) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Bangkok",
  }).format(new Date(s));
const pretty = (s: string, long = false) =>
  new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: long ? "long" : "short",
    year: long ? "numeric" : undefined,
    timeZone: "Asia/Bangkok",
  }).format(new Date(s + "T12:00:00+07:00"));
const thaiDay = (s: string) =>
  new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    timeZone: "Asia/Bangkok",
  }).format(new Date(s + "T12:00:00+07:00"));
const instant = (d: string, t: string) =>
  new Date(d + "T" + t + ":00+07:00").toISOString();
async function api(op: string, body?: unknown, date?: string) {
  const r = await fetch("/api?op=" + op + (date ? "&date=" + date : ""), {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok)
    throw Object.assign(new Error(data.error || "ไม่สามารถเชื่อมต่อได้"), {
      status: r.status,
    });
  return data;
}
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    return () => ref.current?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <header className="modal-head">
        <h2>{title}</h2>
        <button className="icon-button" onClick={onClose} aria-label="ปิด">
          <X size={20} />
        </button>
      </header>
      {children}
    </dialog>
  );
}
function App() {
  const [date, setDate] = useState(day()),
    [view, setView] = useState("schedule"),
    [mode, setMode] = useState("day"),
    [data, setData] = useState<Data | null>(null),
    [auth, setAuth] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [capacity, setCapacity] = useState(1),
    [roomFilter, setRoomFilter] = useState(0),
    [menu, setMenu] = useState(false),
    [modal, setModal] = useState<"booking" | "users" | "password" | null>(null),
    [editing, setEditing] = useState<Booking | null>(null),
    [selectedRoom, setSelectedRoom] = useState(1),
    [selectedTime, setSelectedTime] = useState("09:00"),
    [cancel, setCancel] = useState<Booking | null>(null),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const d = await api("state", undefined, date);
        setData(d);
        setAuth(true);
        setError("");
        if (d.user.must_change_password) setModal("password");
      } catch (e) {
        const x = e as Error & { status: number };
        if (x.status === 401) {
          setAuth(false);
          setData(null);
        } else setError(x.message);
      } finally {
        setLoading(false);
      }
    },
    [date],
  );
  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(true), 30000);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (toast) {
      const id = setTimeout(() => setToast(""), 4500);
      return () => clearTimeout(id);
    }
  }, [toast]);
  const booked = data?.bookings.filter((b) => b.status === "confirmed") || [];
  const rooms = roomList.filter(
    (r) => r.capacity >= capacity && (!roomFilter || r.id === roomFilter),
  );
  const dayBookings = booked.filter((b) => day(new Date(b.starts_at)) === date);
  const filtered = (data?.bookings || []).filter(
    (b) =>
      (view !== "mine" || b.user_id === data?.user.id) &&
      (!roomFilter || b.room_id === roomFilter) &&
      (!query ||
        (b.title + " " + b.organizer + " " + b.department)
          .toLowerCase()
          .includes(query.toLowerCase())) &&
      (mode === "week" || day(new Date(b.starts_at)) === date),
  );
  function openBooking(
    id = rooms[0]?.id || 1,
    b: Booking | null = null,
    t = "09:00",
  ) {
    setError("");
    setSelectedTime(t);
    setSelectedRoom(id);
    setEditing(b);
    setModal("booking");
  }
  async function logout() {
    try {
      await api("logout", {});
      setData(null);
      setAuth(false);
      setModal(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  const user = data?.user;
  if (!auth)
    return (
      <main className="login-page">
        <div className="login-brand">
          <Logo />
          <div className="login-message">
            <span className="eyebrow">YOUR SPACE TO CONNECT</span>
            <h1>
              พื้นที่ดี ๆ<br />
              สำหรับทุกการประชุม<span>.</span>
            </h1>
            <p>เลือกห้อง เลือกเวลา แล้วเริ่มต้นไอเดียใหม่ไปด้วยกัน</p>
            <div className="login-rooms">
              {roomList.map((r) => (
                <div key={r.id}>
                  <DoorOpen />
                  <strong>{r.name}</strong>
                  <span>{r.capacity} ที่นั่ง</span>
                </div>
              ))}
            </div>
          </div>
          <small>ROOMLY / WORKPLACE BOOKING</small>
        </div>
        <div className="login-form">
          <span className="badge">
            <ShieldCheck size={16} /> สำหรับพนักงานภายในองค์กร
          </span>
          <h2>ยินดีต้อนรับ</h2>
          <p className="muted">เข้าสู่ระบบเพื่อดูตารางและจองห้องประชุม</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setError("");
              const f = new FormData(e.currentTarget);
              try {
                await api("login", Object.fromEntries(f));
                await refresh();
              } catch (x) {
                setError((x as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              อีเมลพนักงาน
              <input
                name="email"
                type="email"
                autoComplete="username"
                placeholder="name@company.com"
                required
              />
            </label>
            <label>
              รหัสผ่าน
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={128}
              />
            </label>
            {error && (
              <div className="error" role="alert">
                <AlertCircle size={18} />
                {error}
              </div>
            )}
            <button className="primary full" disabled={busy || loading}>
              {busy ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}
              <ArrowUpRight size={18} />
            </button>
          </form>
          <p className="login-help">
            ยังไม่มีบัญชีหรือลืมรหัสผ่าน?
            <br />
            ติดต่อผู้ดูแลระบบขององค์กร
          </p>
        </div>
      </main>
    );
  return (
    <div className="app">
      <aside className={menu ? "sidebar opened" : "sidebar"}>
        <Logo />
        <div className="workspace-tag">
          <Building2 size={18} />
          <div>
            <strong>พื้นที่ทำงานของเรา</strong>
            <span>ระบบจองห้องประชุม</span>
          </div>
        </div>
        <div className="nav-label">WORKSPACE</div>
        <nav>
          {[
            { id: "schedule", label: "ตารางห้องประชุม", icon: CalendarDays },
            { id: "mine", label: "การจองของฉัน", icon: CalendarCheck },
            ...(user?.role === "admin"
              ? [{ id: "admin", label: "จัดการพนักงาน", icon: Users }]
              : []),
          ].map((n) => (
            <button
              key={n.id}
              className={view === n.id ? "active" : ""}
              onClick={() => {
                setView(n.id);
                setMenu(false);
              }}
            >
              <n.icon size={20} />
              {n.label}
              {view === n.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="side-note">
          <DoorOpen size={26} />
          <strong>พร้อมสำหรับไอเดียใหม่</strong>
          <p>
            3 ห้องประชุม
            <br />
            เลือกพื้นที่ที่พอดีกับทีมคุณ
          </p>
          <div className="mini-cap">
            <span>10</span>
            <span>15</span>
            <span>20</span>
            <small>ที่นั่ง</small>
          </div>
        </div>
        <div className="sidebar-bottom">
          <span className="avatar">{user?.name.slice(0, 1)}</span>
          <div>
            <strong>{user?.name}</strong>
            <span>
              {user?.role === "admin"
                ? "ผู้ดูแลระบบ"
                : user?.department || "พนักงาน"}
            </span>
          </div>
          <button
            className="icon-button"
            title="ออกจากระบบ"
            aria-label="ออกจากระบบ"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="icon-button mobile-menu"
            onClick={() => setMenu(!menu)}
            aria-label="เมนู"
          >
            <Menu />
          </button>
          <div className="breadcrumb">
            Workspace <span>/</span>{" "}
            <strong>
              {view === "schedule"
                ? "ตารางห้องประชุม"
                : view === "mine"
                  ? "การจองของฉัน"
                  : "จัดการพนักงาน"}
            </strong>
          </div>
          <div className="top-actions">
            <span className="timezone">
              <Clock size={15} /> เวลาไทย (GMT+7)
            </span>
            <button
              className="icon-button"
              onClick={() => setModal("password")}
              aria-label="เปลี่ยนรหัสผ่าน"
              title="เปลี่ยนรหัสผ่าน"
            >
              <KeyRound size={18} />
            </button>
          </div>
        </header>
        <main className="content">
          <div className="page-heading">
            <div>
              <div className="eyebrow">
                {view === "admin"
                  ? "PEOPLE & ACCESS"
                  : "MAKE ROOM FOR GREAT IDEAS"}
              </div>
              <h1>
                {view === "schedule"
                  ? "จองพื้นที่ให้ไอเดียคุณ"
                  : view === "mine"
                    ? "การจองของฉัน"
                    : "พนักงานในองค์กร"}
              </h1>
              <p>
                {view === "schedule"
                  ? "ดูเวลาว่าง แล้วเลือกห้องที่เหมาะกับทีม"
                  : view === "mine"
                    ? "ดู แก้ไข และจัดการการประชุมของคุณ"
                    : "จัดการบัญชีและสิทธิ์เข้าถึงพื้นที่ทำงาน"}
              </p>
            </div>
            <button
              className="primary"
              onClick={() =>
                view === "admin" ? setModal("users") : openBooking()
              }
            >
              <Plus size={19} />
              {view === "admin" ? "เพิ่มพนักงาน" : "จองห้องประชุม"}
            </button>
          </div>
          {error && (
            <div className="error" role="alert">
              {error}
              <button className="text-button" onClick={() => refresh()}>
                ลองอีกครั้ง
              </button>
            </div>
          )}
          {view !== "admin" ? (
            <>
              {view === "schedule" && (
                <section className="room-cards" aria-label="ห้องประชุม">
                  {roomList.map((r) => {
                    const active = dayBookings.some(
                      (b) =>
                        b.room_id === r.id &&
                        +new Date(b.starts_at) <= Date.now() &&
                        +new Date(b.ends_at) > Date.now(),
                    );
                    const count = dayBookings.filter(
                      (b) => b.room_id === r.id,
                    ).length;
                    return (
                      <article key={r.id} className={"room-card room-" + r.id}>
                        <div className="room-top">
                          <div className="room-icon">
                            <DoorOpen size={22} />
                          </div>
                          <span
                            className={
                              "availability " + (active ? "occupied" : "")
                            }
                          >
                            {date === day()
                              ? active
                                ? "กำลังใช้งาน"
                                : "ว่างขณะนี้"
                              : count + " รายการจอง"}
                          </span>
                        </div>
                        <div className="room-title">
                          <div>
                            <h2>{r.name}</h2>
                            <p>
                              <Users size={15} />
                              {r.capacity} ที่นั่ง
                            </p>
                          </div>
                          <span className="room-number">0{r.id}</span>
                        </div>
                        <div className="room-bottom">
                          <span>
                            {count === 0
                              ? "ยังไม่มีการจองในวันนี้"
                              : count + " การประชุมในวันที่เลือก"}
                          </span>
                          <button
                            className="round-button"
                            onClick={() => openBooking(r.id)}
                            aria-label={"จอง" + r.name}
                          >
                            <ArrowUpRight size={20} />
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </section>
              )}
              <section className="schedule-panel">
                <div className="panel-toolbar">
                  <div>
                    <h2>
                      {view === "mine" ? "รายการจองของคุณ" : "ตารางการใช้ห้อง"}
                      <span className="count-pill">
                        {
                          filtered.filter((b) => b.status === "confirmed")
                            .length
                        }
                      </span>
                    </h2>
                    <span className="muted small">
                      {thaiDay(date)} {pretty(date, true)}
                    </span>
                  </div>
                  <div className="date-controls">
                    <button
                      className="outline today"
                      onClick={() => setDate(day())}
                    >
                      วันนี้
                    </button>
                    <button
                      className="icon-button"
                      aria-label="ก่อนหน้า"
                      onClick={() =>
                        setDate(addDay(date, mode === "week" ? -7 : -1))
                      }
                    >
                      <ChevronLeft size={19} />
                    </button>
                    <input
                      type="date"
                      aria-label="วันที่"
                      value={date}
                      onChange={(e) =>
                        e.target.value && setDate(e.target.value)
                      }
                    />
                    <button
                      className="icon-button"
                      aria-label="ถัดไป"
                      onClick={() =>
                        setDate(addDay(date, mode === "week" ? 7 : 1))
                      }
                    >
                      <ChevronRight size={19} />
                    </button>
                    <div className="segmented">
                      <button
                        className={mode === "day" ? "selected" : ""}
                        onClick={() => setMode("day")}
                      >
                        วัน
                      </button>
                      <button
                        className={mode === "week" ? "selected" : ""}
                        onClick={() => setMode("week")}
                      >
                        สัปดาห์
                      </button>
                    </div>
                  </div>
                </div>
                <div className="filterbar">
                  <label className="search">
                    <Search size={17} />
                    <input
                      placeholder="ค้นหาการประชุมหรือผู้จอง"
                      aria-label="ค้นหาการประชุม"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                    />
                  </label>
                  <div className="filters">
                    <SlidersHorizontal size={17} />
                    <select
                      aria-label="กรองห้อง"
                      value={roomFilter}
                      onChange={(e) => setRoomFilter(+e.target.value)}
                    >
                      <option value={0}>ทุกห้องประชุม</option>
                      {roomList.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    <select
                      aria-label="จำนวนผู้เข้าร่วมขั้นต่ำ"
                      value={capacity}
                      onChange={(e) => setCapacity(+e.target.value)}
                    >
                      <option value={1}>ทุกขนาดห้อง</option>
                      <option value={10}>10 คนขึ้นไป</option>
                      <option value={15}>15 คนขึ้นไป</option>
                      <option value={20}>20 คน</option>
                    </select>
                    <button
                      className="icon-button"
                      onClick={() => refresh()}
                      aria-label="โหลดตารางใหม่"
                    >
                      <RefreshCw size={16} className={loading ? "spin" : ""} />
                    </button>
                  </div>
                </div>
                {loading && !data ? (
                  <p className="empty">กำลังโหลดตาราง…</p>
                ) : view === "schedule" && mode === "day" ? (
                  <div className="timeline-scroll">
                    <div className="timeline">
                      <div className="time-header">
                        <span>ห้องประชุม / เวลา</span>
                        <div>
                          {Array.from({ length: 12 }, (_, i) => (
                            <span key={i}>
                              {String(i + 8).padStart(2, "0")}:00
                            </span>
                          ))}
                        </div>
                      </div>
                      {rooms.map((r) => (
                        <div className="timeline-row" key={r.id}>
                          <div className="timeline-room">
                            <span className={"room-mark mark-" + r.id} />
                            <div>
                              <strong>{r.name}</strong>
                              <span>{r.capacity} ที่นั่ง</span>
                            </div>
                          </div>
                          <div className="time-track">
                            {Array.from({ length: 12 }, (_, i) => (
                              <button
                                className="time-slot"
                                key={i}
                                aria-label={
                                  "จอง" + r.name + " เวลา " + (i + 8) + ":00"
                                }
                                onClick={() =>
                                  openBooking(
                                    r.id,
                                    null,
                                    String(i + 8).padStart(2, "0") + ":00",
                                  )
                                }
                              />
                            ))}
                            {filtered
                              .filter(
                                (b) =>
                                  b.room_id === r.id &&
                                  b.status === "confirmed",
                              )
                              .map((b) => {
                                const [h, m] = time(b.starts_at)
                                  .split(":")
                                  .map(Number);
                                const left = (((h - 8) * 60 + m) / 720) * 100;
                                const width =
                                  ((+new Date(b.ends_at) -
                                    +new Date(b.starts_at)) /
                                    60000 /
                                    720) *
                                  100;
                                return (
                                  <button
                                    className={"booking-block block-" + r.id}
                                    key={b.id}
                                    style={{
                                      left: left + "%",
                                      width: width + "%",
                                    }}
                                    onClick={() => openBooking(r.id, b)}
                                    title={
                                      b.title +
                                      " · " +
                                      time(b.starts_at) +
                                      "–" +
                                      time(b.ends_at)
                                    }
                                  >
                                    <strong>{b.title}</strong>
                                    <span>
                                      {time(b.starts_at)}–{time(b.ends_at)}
                                    </span>
                                  </button>
                                );
                              })}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
                {mode === "week" && view === "schedule" ? (
                  <div className="week-grid">
                    {Array.from({ length: 7 }, (_, i) => addDay(date, i)).map(
                      (d) => (
                        <section key={d}>
                          <header>
                            <strong>{thaiDay(d).replace("วัน", "")}</strong>
                            <span className={d === day() ? "current-day" : ""}>
                              {pretty(d)}
                            </span>
                          </header>
                          {filtered
                            .filter(
                              (b) =>
                                day(new Date(b.starts_at)) === d &&
                                b.status === "confirmed" &&
                                rooms.some((r) => r.id === b.room_id),
                            )
                            .map((b) => (
                              <button
                                key={b.id}
                                className={"week-booking block-" + b.room_id}
                                onClick={() => openBooking(b.room_id, b)}
                              >
                                <span>
                                  {time(b.starts_at)}–{time(b.ends_at)}
                                </span>
                                <strong>{b.title}</strong>
                                <small>
                                  ห้อง {b.room_id} · {b.organizer}
                                </small>
                              </button>
                            ))}
                          {!filtered.some(
                            (b) =>
                              day(new Date(b.starts_at)) === d &&
                              b.status === "confirmed",
                          ) && (
                            <span className="week-empty">ไม่มีการประชุม</span>
                          )}
                          <button
                            className="week-add"
                            onClick={() => {
                              setDate(d);
                              openBooking();
                            }}
                          >
                            <Plus size={16} /> จอง
                          </button>
                        </section>
                      ),
                    )}
                  </div>
                ) : (
                  <div className="booking-list">
                    <div className="list-heading">
                      <h3>
                        {view === "mine"
                          ? "รายการในช่วงวันที่เลือก"
                          : "การประชุมในวันที่เลือก"}
                      </h3>
                      <span className="muted small">อัปเดตทุก 30 วินาที</span>
                    </div>
                    {filtered.filter(
                      (b) =>
                        rooms.some((r) => r.id === b.room_id) &&
                        (view === "mine" || b.status === "confirmed"),
                    ).length === 0 ? (
                      <div className="empty">
                        <div className="empty-icon">
                          <CalendarDays size={26} />
                        </div>
                        <h3>
                          {query
                            ? "ไม่พบการประชุมที่ค้นหา"
                            : "พื้นที่ว่างสำหรับการประชุมครั้งถัดไป"}
                        </h3>
                        <p>
                          {query
                            ? "ลองใช้คำค้นหรือเงื่อนไขอื่น"
                            : "เลือกห้องและเวลาที่เหมาะกับทีมของคุณ"}
                        </p>
                        <button
                          className="text-button"
                          onClick={() => openBooking()}
                        >
                          จองห้องประชุม <ArrowUpRight size={16} />
                        </button>
                      </div>
                    ) : (
                      filtered
                        .filter(
                          (b) =>
                            rooms.some((r) => r.id === b.room_id) &&
                            (view === "mine" || b.status === "confirmed"),
                        )
                        .map((b) => (
                          <div
                            key={b.id}
                            className={
                              "list-row " +
                              (b.status === "cancelled" ? "cancelled" : "")
                            }
                          >
                            <div className="list-time">
                              <strong>{time(b.starts_at)}</strong>
                              <span>{time(b.ends_at)}</span>
                              {mode === "week" && (
                                <small>
                                  {pretty(day(new Date(b.starts_at)))}
                                </small>
                              )}
                            </div>
                            <span className={"room-mark mark-" + b.room_id} />
                            <div className="meeting-info">
                              <strong>{b.title}</strong>
                              <span>
                                {b.organizer}{" "}
                                {b.department && "· " + b.department}
                              </span>
                            </div>
                            <span className={"room-label block-" + b.room_id}>
                              ห้องประชุม {b.room_id}
                            </span>
                            <span className="attendee-label">
                              <Users size={15} />
                              {b.attendees}
                            </span>
                            <span
                              className={
                                "status-label " +
                                (b.status === "cancelled" ? "" : "confirmed")
                              }
                            >
                              {b.status === "cancelled"
                                ? "ยกเลิก"
                                : +new Date(b.ends_at) < Date.now()
                                  ? "สิ้นสุดแล้ว"
                                  : "ยืนยันแล้ว"}
                            </span>
                            <button
                              className="icon-button"
                              onClick={() => openBooking(b.room_id, b)}
                              aria-label={"รายละเอียด " + b.title}
                            >
                              <ArrowUpRight size={18} />
                            </button>
                          </div>
                        ))
                    )}
                  </div>
                )}
                <div className="panel-footer">
                  <span>
                    <ShieldCheck size={15} /> ตรวจสอบเวลาว่างก่อนยืนยันทุกครั้ง
                  </span>
                  <span>เปิดจอง 08:00–20:00 น.</span>
                </div>
              </section>
              <div className="bottom-notes">
                <span>
                  <Clock size={16} /> จองล่วงหน้าได้ 90 วัน · ครั้งละ 30 นาที–8
                  ชั่วโมง
                </span>
                <span>
                  ROOMLY <span className="slash">/</span> WORK BETTER, TOGETHER
                </span>
              </div>
            </>
          ) : (
            <section className="schedule-panel users-panel">
              <div className="panel-toolbar">
                <h2>
                  บัญชีพนักงาน{" "}
                  <span className="count-pill">{data?.users.length}</span>
                </h2>
              </div>
              {data?.users.map((u) => (
                <div className="user-row" key={u.id}>
                  <span className="avatar">{u.name.slice(0, 1)}</span>
                  <div>
                    <strong>{u.name}</strong>
                    <span>
                      {u.email} · {u.department || "ไม่ระบุแผนก"}
                    </span>
                  </div>
                  <span className="badge">
                    {u.role === "admin"
                      ? "ผู้ดูแลระบบ"
                      : u.active
                        ? "ใช้งาน"
                        : "ปิดใช้งาน"}
                  </span>
                  {u.role !== "admin" && (
                    <>
                      <button
                        className="outline"
                        onClick={async () => {
                          setBusy(true);
                          try {
                            await api("user-status", {
                              id: u.id,
                              active: !u.active,
                            });
                            await refresh(true);
                          } catch (e) {
                            setError((e as Error).message);
                          } finally {
                            setBusy(false);
                          }
                        }}
                        disabled={busy}
                      >
                        {u.active ? "ปิดบัญชี" : "เปิดบัญชี"}
                      </button>
                      <button
                        className="outline"
                        onClick={() => {
                          const pw = window.prompt(
                            "ตั้งรหัสผ่านชั่วคราวใหม่ (อย่างน้อย 12 ตัวอักษร) ให้ " +
                              u.name,
                          );
                          if (pw)
                            void api("reset-password", {
                              id: u.id,
                              password: pw,
                            })
                              .then(() => setToast("ตั้งรหัสผ่านชั่วคราวแล้ว"))
                              .catch((e) => setError(e.message));
                        }}
                      >
                        รีเซ็ตรหัสผ่าน
                      </button>
                    </>
                  )}
                </div>
              ))}
            </section>
          )}
        </main>
      </div>
      {modal === "booking" && (
        <BookingModal
          booking={editing}
          date={date}
          room={selectedRoom}
          initialTime={selectedTime}
          user={user!}
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            setToast(
              editing ? "แก้ไขการจองแล้ว" : "จองห้องประชุมเรียบร้อยแล้ว",
            );
            await refresh(true);
          }}
          onCancel={(b) => {
            setModal(null);
            setCancel(b);
          }}
        />
      )}
      {modal === "users" && (
        <AccountModal
          onClose={() => setModal(null)}
          onSaved={async () => {
            setModal(null);
            setToast("เพิ่มบัญชีพนักงานแล้ว");
            await refresh(true);
          }}
        />
      )}
      {modal === "password" && (
        <PasswordModal
          required={!!user?.must_change_password}
          onClose={() =>
            user?.must_change_password ? void logout() : setModal(null)
          }
          onSaved={async () => {
            setModal(null);
            setToast("เปลี่ยนรหัสผ่านแล้ว");
            await refresh(true);
          }}
        />
      )}
      {cancel && (
        <Modal title="ยกเลิกการจองนี้?" onClose={() => setCancel(null)}>
          <div className="modal-body">
            <p>
              “{cancel.title}” · ห้องประชุม {cancel.room_id}
            </p>
            <p className="muted">ห้องจะว่างให้พนักงานคนอื่นจองในช่วงเวลานี้</p>
            <div className="form-actions">
              <button
                className="outline"
                disabled={busy}
                onClick={() => setCancel(null)}
              >
                เก็บการจองไว้
              </button>
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api("cancel", {
                      id: cancel.id,
                      revision: cancel.revision,
                    });
                    setCancel(null);
                    setToast("ยกเลิกการจองแล้ว");
                    await refresh(true);
                  } catch (e) {
                    setError((e as Error).message);
                    setCancel(null);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                ยืนยันยกเลิก
              </button>
            </div>
          </div>
        </Modal>
      )}
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
        </div>
      )}
    </div>
  );
}
function Logo() {
  return (
    <div className="logo">
      <span>
        <DoorOpen size={23} />
      </span>
      roomly<span className="logo-period">.</span>
    </div>
  );
}
function BookingModal({
  booking,
  date,
  room,
  initialTime,
  user,
  onClose,
  onSaved,
  onCancel,
}: {
  booking: Booking | null;
  date: string;
  room: number;
  initialTime: string;
  user: User;
  onClose: () => void;
  onSaved: () => void;
  onCancel: (b: Booking) => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [rid, setRid] = useState(booking?.room_id || room);
  const writable =
    !booking ||
    ((booking.user_id === user.id || user.role === "admin") &&
      booking.status === "confirmed" &&
      +new Date(booking.starts_at) > Date.now());
  return (
    <Modal
      title={
        booking
          ? writable
            ? "แก้ไขการจอง"
            : "รายละเอียดการประชุม"
          : "จองห้องประชุม"
      }
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          const f = new FormData(e.currentTarget);
          try {
            await api(booking ? "update" : "create", {
              ...(booking
                ? { id: booking.id, revision: booking.revision }
                : {}),
              roomId: rid,
              title: f.get("title"),
              attendees: Number(f.get("attendees")),
              start: instant(String(f.get("date")), String(f.get("start"))),
              end: instant(String(f.get("date")), String(f.get("end"))),
              note: f.get("note"),
            });
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        {booking && (
          <p className="muted">
            ผู้จอง: {booking.organizer} ·{" "}
            {booking.status === "cancelled" ? "ยกเลิกแล้ว" : "ยืนยันแล้ว"}
          </p>
        )}
        <fieldset disabled={!writable || busy}>
          <label>
            หัวข้อการประชุม
            <input
              name="title"
              placeholder="เช่น วางแผนงานประจำสัปดาห์"
              minLength={2}
              maxLength={120}
              defaultValue={booking?.title}
              required
              autoFocus
            />
          </label>
          <div className="form-grid">
            <label>
              ห้องประชุม
              <select value={rid} onChange={(e) => setRid(+e.target.value)}>
                {roomList.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name} · {r.capacity} ที่นั่ง
                  </option>
                ))}
              </select>
            </label>
            <label>
              จำนวนผู้เข้าร่วม
              <input
                name="attendees"
                type="number"
                min={1}
                max={roomList[rid - 1].capacity}
                defaultValue={booking?.attendees || 2}
                required
              />
            </label>
          </div>
          <label>
            วันที่
            <input
              name="date"
              type="date"
              defaultValue={booking ? day(new Date(booking.starts_at)) : date}
              min={day()}
              max={addDay(day(), 90)}
              required
            />
          </label>
          <div className="form-grid">
            <label>
              เวลาเริ่ม
              <select
                name="start"
                defaultValue={booking ? time(booking.starts_at) : initialTime}
              >
                {Array.from({ length: 47 }, (_, i) => {
                  const t =
                    String(8 + Math.floor(i / 4)).padStart(2, "0") +
                    ":" +
                    String((i % 4) * 15).padStart(2, "0");
                  return <option key={t}>{t}</option>;
                })}
              </select>
            </label>
            <label>
              เวลาสิ้นสุด
              <select
                name="end"
                defaultValue={
                  booking
                    ? time(booking.ends_at)
                    : String(
                        Math.min(20, Number(initialTime.slice(0, 2)) + 1),
                      ).padStart(2, "0") + ":00"
                }
              >
                {Array.from({ length: 47 }, (_, i) => {
                  const t =
                    String(8 + Math.floor((i + 2) / 4)).padStart(2, "0") +
                    ":" +
                    String(((i + 2) % 4) * 15).padStart(2, "0");
                  return <option key={t}>{t}</option>;
                })}
              </select>
            </label>
          </div>
          <label>
            หมายเหตุ <span className="muted">· ไม่บังคับ</span>
            <textarea
              name="note"
              rows={3}
              maxLength={500}
              defaultValue={booking?.note}
              placeholder="รายละเอียดเพิ่มเติมสำหรับทีม"
            />
          </label>
        </fieldset>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        {writable && (
          <>
            <p className="form-hint">
              <ShieldCheck size={17} /> หากมีผู้จองเวลาเดียวกัน
              ระบบจะให้สิทธิ์รายการที่บันทึกสำเร็จก่อน
            </p>
            <div className="form-actions">
              {booking && (
                <button
                  type="button"
                  className="text-button danger-text"
                  disabled={busy}
                  onClick={() => onCancel(booking)}
                >
                  ยกเลิกการจอง
                </button>
              )}
              <button type="button" className="outline" onClick={onClose}>
                ปิด
              </button>
              <button className="primary" disabled={busy}>
                {busy
                  ? "กำลังบันทึก…"
                  : booking
                    ? "บันทึกการแก้ไข"
                    : "ยืนยันการจอง"}
              </button>
            </div>
          </>
        )}
      </form>
    </Modal>
  );
}
function AccountModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal title="เพิ่มบัญชีพนักงาน" onClose={onClose}>
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api(
              "users",
              Object.fromEntries(new FormData(e.currentTarget)),
            );
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          ชื่อ–นามสกุล
          <input name="name" minLength={2} maxLength={80} required autoFocus />
        </label>
        <label>
          อีเมล
          <input name="email" type="email" required maxLength={160} />
        </label>
        <label>
          แผนก
          <input name="department" maxLength={80} />
        </label>
        <label>
          รหัสผ่านชั่วคราว
          <input
            name="password"
            type="password"
            minLength={12}
            maxLength={128}
            autoComplete="new-password"
            required
          />
        </label>
        <p className="muted">
          อย่างน้อย 12 ตัวอักษร
          พนักงานต้องเปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งแรก
          ส่งรหัสผ่านให้เจ้าของบัญชีผ่านช่องทางภายในที่ปลอดภัย
        </p>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          สร้างบัญชีพนักงาน
        </button>
      </form>
    </Modal>
  );
}
function PasswordModal({
  required,
  onClose,
  onSaved,
}: {
  required: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <Modal
      title={required ? "ตั้งรหัสผ่านของคุณ" : "เปลี่ยนรหัสผ่าน"}
      onClose={onClose}
    >
      <form
        className="modal-body"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          const f = new FormData(e.currentTarget);
          if (f.get("password") !== f.get("confirm")) {
            setError("รหัสผ่านใหม่ไม่ตรงกัน");
            setBusy(false);
            return;
          }
          try {
            await api("password", Object.fromEntries(f));
            onSaved();
          } catch (e) {
            setError((e as Error).message);
          } finally {
            setBusy(false);
          }
        }}
      >
        <p className="muted">
          {required
            ? "กรุณาเปลี่ยนรหัสผ่านชั่วคราวก่อนเริ่มจองห้องประชุม"
            : "การเปลี่ยนรหัสผ่านจะออกจากระบบบนอุปกรณ์อื่น"}
        </p>
        <label>
          รหัสผ่านปัจจุบัน
          <input
            name="current"
            type="password"
            autoComplete="current-password"
            maxLength={128}
            required
          />
        </label>
        <label>
          รหัสผ่านใหม่
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        <label>
          ยืนยันรหัสผ่านใหม่
          <input
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={12}
            maxLength={128}
            required
          />
        </label>
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <button className="primary full" disabled={busy}>
          บันทึกรหัสผ่าน
        </button>
      </form>
    </Modal>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
