// Mọi ngày giờ hiển thị và "hôm nay" đều tính theo giờ Việt Nam (UTC+7, không đổi giờ mùa hè),
// kể cả khi máy chủ chạy ở múi giờ khác.
export const TZ = "Asia/Ho_Chi_Minh";
const OFFSET = "+07:00";

const parts = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return { y: get("year"), m: get("month"), d: get("day"), h: get("hour"), min: get("minute"), wd: get("weekday") };
};

/** Ngày theo giờ Việt Nam, dạng YYYY-MM-DD. */
export function dayKey(t: Date | string | number = new Date()): string {
  const p = parts(new Date(t));
  return `${p.y}-${p.m}-${p.d}`;
}
export const todayKey = () => dayKey(new Date());

export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00${OFFSET}`);
  d.setUTCDate(d.getUTCDate() + n);
  return dayKey(d);
}

export function fmtDate(t: Date | string | number): string {
  if (typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
    const [y, m, d] = t.split("-");
    return `${d}/${m}/${y}`;
  }
  const p = parts(new Date(t));
  return `${p.d}/${p.m}/${p.y}`;
}
export function fmtTime(t: Date | string | number): string {
  const p = parts(new Date(t));
  return `${p.h}:${p.min}`;
}
export const fmtDateTime = (t: string) => `${fmtTime(t)} ${fmtDate(t)}`;

const WD: Record<string, string> = {
  Sun: "Chủ nhật",
  Mon: "Thứ hai",
  Tue: "Thứ ba",
  Wed: "Thứ tư",
  Thu: "Thứ năm",
  Fri: "Thứ sáu",
  Sat: "Thứ bảy",
};
export function weekday(t: Date | string | number = new Date()): string {
  const d = typeof t === "string" && /^\d{4}-\d{2}-\d{2}$/.test(t) ? new Date(`${t}T12:00:00${OFFSET}`) : new Date(t);
  return WD[parts(d).wd] ?? "";
}
export function dayLabel(key: string): string {
  const today = todayKey();
  if (key === today) return `Hôm nay, ${fmtDate(key)}`;
  if (key === addDays(today, -1)) return `Hôm qua, ${fmtDate(key)}`;
  return `${weekday(key)}, ${fmtDate(key)}`;
}

/** Hạn chót dạng ngày (YYYY-MM-DD) tính đến 23:59 ngày đó; dạng thời điểm thì giữ nguyên. */
export function dueMs(due: string | null | undefined): number | null {
  if (!due) return null;
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? new Date(`${due}T23:59:00${OFFSET}`).getTime() : new Date(due).getTime();
}
export function fmtDue(due: string | null | undefined): string {
  if (!due) return "—";
  return /^\d{4}-\d{2}-\d{2}$/.test(due) ? fmtDate(due) : fmtDateTime(due);
}

export function remaining(due: string | null | undefined, done: boolean, now = Date.now()) {
  const ms = dueMs(due);
  if (ms == null) return { text: "Không có hạn", cls: "muted" };
  if (done) return { text: "Đã xong", cls: "ok" };
  let diff = ms - now;
  const over = diff < 0;
  diff = Math.abs(diff);
  const d = Math.floor(diff / 864e5);
  const h = Math.floor((diff % 864e5) / 36e5);
  const m = Math.floor((diff % 36e5) / 6e4);
  const span = d ? `${d} ngày ${h} giờ` : h ? `${h} giờ ${m} phút` : `${m} phút`;
  if (over) return { text: `Quá hạn ${span}`, cls: "overdue" };
  return { text: `Còn ${span}`, cls: ms - now < 864e5 ? "soon" : "" };
}

/** Giá trị từ ô datetime-local (giờ Việt Nam) sang ISO có múi giờ. */
export function localInputToIso(v: string | null | undefined): string {
  if (!v) return "";
  return `${v.length === 16 ? v + ":00" : v}${OFFSET}`;
}
/** ISO sang giá trị cho ô datetime-local theo giờ Việt Nam. */
export function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const p = parts(new Date(iso));
  return `${p.y}-${p.m}-${p.d}T${p.h}:${p.min}`;
}
