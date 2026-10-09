import Link from "next/link";
import { TaskRow } from "@/components/TaskRow";
import { getNames, getSupabase, getTasks, requireMe } from "@/lib/data";
import { EDIT_FIELDS, type EditRequest } from "@/lib/types";
import { fmtDateTime } from "@/lib/time";

export default async function ReviewPage() {
  const supabase = await getSupabase();
  const [me, tasks, name, reqRes] = await Promise.all([
    requireMe(),
    getTasks(),
    getNames(),
    supabase
      .from("subtask_edit_requests")
      .select("*, subtasks(id, title, task_id)")
      .eq("status", "pending")
      .order("created_at"),
  ]);
  const boss = me.role === "boss";
  const pending = tasks
    .filter((t) => t.status === "pending")
    .sort((a, b) => (a.submitted_at ?? "").localeCompare(b.submitted_at ?? ""));
  const reqs = (reqRes.data ?? []) as (EditRequest & { subtasks: { id: string; title: string; task_id: string } | null })[];
  const done = tasks
    .filter((t) => t.review_at && t.status !== "pending")
    .sort((a, b) => (b.review_at ?? "").localeCompare(a.review_at ?? ""))
    .slice(0, 10);
  const taskTitle = new Map(tasks.map((t) => [t.id, t.title]));

  return (
    <>
      <p className="muted" style={{ margin: 0 }}>
        {boss
          ? "Việc nhân viên đã gửi lên. Mở từng việc để xem nhật ký, rồi Duyệt hoặc Trả về."
          : "Việc đã gửi sếp. Sếp duyệt xong sẽ hiện con dấu Đã duyệt."}
      </p>
      <div className="list">
        {pending.length ? (
          pending.map((t) => <TaskRow key={t.id} t={t} name={name} />)
        ) : (
          <div className="empty">Không có công việc nào đang chờ duyệt.</div>
        )}
      </div>

      {reqs.length > 0 && (
        <section className="sec">
          <h3 className="muted" style={{ fontSize: 13 }}>Yêu cầu sửa việc con</h3>
          <div className="list">
            {reqs.map((r) =>
              r.subtasks ? (
                <Link key={r.id} className="task" href={`/viec/${r.subtasks.task_id}/con/${r.subtasks.id}`}>
                  <span className="dot pending" />
                  <span className="t">{r.subtasks.title}</span>
                  <span className="pill pending">Chờ duyệt sửa</span>
                  <span className="meta">
                    <span>Thuộc: {taskTitle.get(r.subtasks.task_id)}</span>
                    <span>
                      {name(r.requested_by)} đề xuất sửa {Object.keys(r.changes).map((k) => EDIT_FIELDS[k] ?? k).join(", ")}
                    </span>
                    <span className="mono">{fmtDateTime(r.created_at)}</span>
                  </span>
                </Link>
              ) : null,
            )}
          </div>
        </section>
      )}

      {done.length > 0 && (
        <section className="sec">
          <h3 className="muted" style={{ fontSize: 13 }}>Đã xử lý gần đây</h3>
          <div className="list">
            {done.map((t) => (
              <TaskRow key={t.id} t={t} name={name} />
            ))}
          </div>
        </section>
      )}
    </>
  );
}
