import Link from "next/link";
import { Remain } from "@/components/Remain";
import { countPendingEdits, getNames, getSupabase, getTasks } from "@/lib/data";
import { TASK_STATUS, type Subtask, type Task } from "@/lib/types";
import { dueMs, fmtDue } from "@/lib/time";

function deadlineCounts(tasks: Task[], now = Date.now()) {
  const open = tasks.filter((t) => t.status !== "approved");
  const ms = (t: Task) => dueMs(t.due);
  const overdue = open.filter((t) => t.due && ms(t)! < now).length;
  const soon = open.filter((t) => t.due && ms(t)! >= now && ms(t)! - now < 2 * 864e5).length;
  return { open, overdue, soon };
}

export default async function DashboardPage({ searchParams }: PageProps<"/dashboard">) {
  const all = (await searchParams).xem === "tat-ca";
  const supabase = await getSupabase();
  const [tasks, name, editReq, subsRes] = await Promise.all([
    getTasks(),
    getNames(),
    countPendingEdits(),
    supabase.from("subtasks").select("id, task_id, status, assignee_id"),
  ]);
  const subs = (subsRes.data ?? []) as Pick<Subtask, "id" | "task_id" | "status" | "assignee_id">[];

  const { open, overdue, soon } = deadlineCounts(tasks);
  const list = (all ? tasks.slice() : open).sort((a, b) => (dueMs(a.due) ?? 9e15) - (dueMs(b.due) ?? 9e15));

  return (
    <>
      <div className="kpis">
        <div className={`kpi${overdue ? " bad" : ""}`}>
          <span className="n">{overdue}</span>
          <span className="l">Quá hạn</span>
        </div>
        <div className={`kpi${soon ? " warn" : ""}`}>
          <span className="n">{soon}</span>
          <span className="l">Đến hạn trong 2 ngày</span>
        </div>
        <div className="kpi">
          <span className="n">{open.length}</span>
          <span className="l">Chưa hoàn thành</span>
        </div>
        <div className={`kpi${editReq ? " warn" : ""}`}>
          <span className="n">{editReq}</span>
          <span className="l">Yêu cầu sửa chờ duyệt</span>
        </div>
      </div>

      <div className="sec-h">
        <h2>Hạn chót và trạng thái</h2>
        <div className="seg" role="group">
          <Link className="btn ghost" href="/dashboard" aria-current={!all ? "page" : undefined} style={{ fontWeight: all ? 500 : 700 }}>
            Chưa xong
          </Link>
          <Link className="btn ghost" href="/dashboard?xem=tat-ca" aria-current={all ? "page" : undefined} style={{ fontWeight: all ? 700 : 500 }}>
            Tất cả
          </Link>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="empty">Chưa có công việc nào để theo dõi.</div>
      ) : (
        <div className="tablewrap">
          <table className="dash">
            <thead>
              <tr>
                {["Công việc", "Trạng thái", "Hạn chót", "Thời gian còn lại", "Việc con", "Phụ trách"].map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {list.map((t) => {
                const mine = subs.filter((s) => s.task_id === t.id);
                const done = mine.filter((s) => s.status === "done").length;
                const people = [...new Set(mine.map((s) => s.assignee_id).filter((x): x is string => !!x))].map(name);
                const href = `/viec/${t.id}?tab=viec-con`;
                return (
                  <tr key={t.id}>
                    <td className="tt">
                      <Link href={href}>
                        <span className="t">{t.title}</span>
                        {t.priority === "high" && <span className="prio-high"> · Gấp</span>}
                      </Link>
                    </td>
                    <td>
                      <span className={`pill ${t.status}`}>{TASK_STATUS[t.status]}</span>
                    </td>
                    <td className="mono">{fmtDue(t.due)}</td>
                    <td>
                      <Remain due={t.due} done={t.status === "approved"} />
                    </td>
                    <td>
                      {mine.length ? (
                        <span className="prog">
                          <span className="bar">
                            <i style={{ width: `${Math.round((done / mine.length) * 100)}%` }} />
                          </span>
                          <span className="mono">
                            {done}/{mine.length}
                          </span>
                        </span>
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </td>
                    <td className="muted">{people.join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
