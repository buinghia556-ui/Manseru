import Link from "next/link";
import { getNames, getSupabase, getTasks } from "@/lib/data";
import { LOG_KIND, type TaskLog } from "@/lib/types";
import { dayKey, dayLabel, fmtTime } from "@/lib/time";

const KIND_CLS: Record<string, string> = { approve: "approve", reject: "reject", submit: "submit", log: "log" };

export default async function LogPage() {
  const supabase = await getSupabase();
  const [tasks, name, logsRes] = await Promise.all([
    getTasks(),
    getNames(),
    supabase.from("task_logs").select("*").order("created_at", { ascending: false }).limit(500),
  ]);
  const logs = (logsRes.data ?? []) as TaskLog[];
  const title = new Map(tasks.map((t) => [t.id, t.title]));
  if (!logs.length) {
    return (
      <div className="empty">
        Nhật ký trống. Mỗi lần thêm việc, ghi tiến độ, gửi duyệt hay được duyệt đều được lưu ở đây.
      </div>
    );
  }
  const groups = new Map<string, TaskLog[]>();
  for (const l of logs) {
    const k = dayKey(l.created_at);
    groups.set(k, [...(groups.get(k) ?? []), l]);
  }
  return (
    <div className="list" style={{ gap: 16 }}>
      {[...groups].map(([day, items]) => {
        const hrs = items.reduce((s, l) => s + (Number(l.hours) || 0), 0);
        return (
          <div className="day" key={day}>
            <h3>
              <span>{dayLabel(day)}</span>
              {hrs > 0 && <span className="mono">Tổng {hrs} giờ</span>}
            </h3>
            <div className="box">
              <ul className="timeline">
                {items.map((l) => (
                  <li key={l.id}>
                    <span className="when mono">{fmtTime(l.created_at)}</span>
                    <div className="what">
                      <span className={`k ${KIND_CLS[l.kind] ?? ""}`}>{LOG_KIND[l.kind] ?? l.kind}</span>
                      <b>{name(l.author_id)}</b> ·{" "}
                      <Link className="loglink" href={`/viec/${l.task_id}?tab=lich-su`}>
                        {title.get(l.task_id) ?? "Công việc"}
                      </Link>
                      {l.hours ? <span className="mono muted"> · {Number(l.hours)} giờ</span> : null}
                      {l.body && <div className="note">{l.body}</div>}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        );
      })}
    </div>
  );
}
