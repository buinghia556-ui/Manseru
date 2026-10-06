import Link from "next/link";
import { notFound } from "next/navigation";
import { addSubtask, addTaskLog, deleteTask, editTask, taskStep } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Disclosure } from "@/components/Disclosure";
import { Confirm } from "@/components/Confirm";
import { MemberSelect } from "@/components/MemberSelect";
import { Remain } from "@/components/Remain";
import { FileCards } from "@/components/FileCards";
import { FileUpload } from "@/components/FileUpload";
import { getNames, getProfiles, getSupabase, requireMe } from "@/lib/data";
import { LOG_KIND, PRIORITY, SUB_STATUS, TASK_STATUS, type Subtask, type Task, type TaskFile, type TaskLog } from "@/lib/types";
import { dueMs, fmtDate, fmtDateTime, fmtDue, fmtTime, todayKey } from "@/lib/time";

const TABS = [
  ["tong-quan", "Tổng quan"],
  ["viec-con", "Việc con"],
  ["tai-lieu", "Tài liệu"],
  ["lich-su", "Lịch sử"],
] as const;
const KIND_CLS: Record<string, string> = { approve: "approve", reject: "reject", submit: "submit", log: "log" };

export default async function TaskPage({ params, searchParams }: PageProps<"/viec/[id]">) {
  const { id } = await params;
  const tabParam = (await searchParams).tab;
  const tab = TABS.some(([k]) => k === tabParam) ? (tabParam as string) : "tong-quan";

  const supabase = await getSupabase();
  const [me, name, members, taskRes, subsRes, logsRes, reqRes, filesRes] = await Promise.all([
    requireMe(),
    getNames(),
    getProfiles(),
    supabase.from("tasks").select("*").eq("id", id).maybeSingle<Task>(),
    supabase.from("subtasks").select("*").eq("task_id", id),
    supabase.from("task_logs").select("*").eq("task_id", id).order("created_at"),
    supabase.from("subtask_edit_requests").select("subtask_id, subtasks!inner(task_id)").eq("status", "pending").eq("subtasks.task_id", id),
    supabase.from("task_files").select("*").eq("task_id", id).order("created_at", { ascending: false }),
  ]);
  const t = taskRes.data;
  if (!t) notFound();
  const subs = ((subsRes.data ?? []) as Subtask[]).sort(
    (a, b) => Number(a.status === "done") - Number(b.status === "done") || (dueMs(a.due) ?? 9e15) - (dueMs(b.due) ?? 9e15),
  );
  const logs = (logsRes.data ?? []) as TaskLog[];
  const pendingEdit = new Set((reqRes.data ?? []).map((r) => r.subtask_id as string));
  const done = subs.filter((s) => s.status === "done").length;
  const files = (filesRes.data ?? []) as TaskFile[];

  const boss = me.role === "boss";
  const mine = t.created_by === me.id;
  const today = todayKey();
  const activeMembers = members.filter((m) => m.active);

  const steps: { step: string; label: string; cls: string }[] = [];
  const reviewing = boss && t.status === "pending";
  if (reviewing) {
    steps.push({ step: "reject", label: "Trả về sửa", cls: "btn danger" }, { step: "approve", label: "Duyệt", cls: "btn seal" });
  }
  if (mine) {
    if (t.status === "todo" || t.status === "returned") steps.push({ step: "start", label: "Bắt đầu làm", cls: "btn" });
    if (["todo", "doing", "returned"].includes(t.status)) steps.push({ step: "submit", label: "Gửi sếp duyệt", cls: "btn primary" });
    if (t.status === "pending") steps.push({ step: "recall", label: "Rút lại", cls: "btn" });
  }
  if (mine || boss) {
    if (t.status !== "approved" && t.work_day !== today) steps.push({ step: "today", label: "Làm hôm nay", cls: "btn ghost" });
    if (t.status === "approved") steps.push({ step: "reopen", label: "Mở lại", cls: "btn ghost" });
  }
  const needNote = reviewing || (mine && ["todo", "doing", "returned"].includes(t.status));
  const canEdit = boss || (mine && ["todo", "doing", "returned"].includes(t.status));
  const canDelete = boss || (mine && t.status !== "approved");
  const totalH = logs.reduce((s, l) => s + (Number(l.hours) || 0), 0);

  return (
    <div className="detail">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="back" href="/">
          ‹ Danh sách công việc
        </Link>
        <span className={`pill ${t.status}`}>{TASK_STATUS[t.status]}</span>
      </div>
      <h2>{t.title}</h2>
      <div className="row">
        <span className="muted">Hạn {fmtDue(t.due)}</span>
        <Remain due={t.due} done={t.status === "approved"} />
      </div>

      <div className="stabs" role="tablist">
        {TABS.map(([k, l]) => (
          <Link key={k} href={`/viec/${t.id}?tab=${k}`} aria-current={tab === k ? "page" : undefined} replace>
            {l}
            {k === "viec-con" && subs.length ? ` ${done}/${subs.length}` : ""}
            {k === "tai-lieu" && files.length ? ` ${files.length}` : ""}
          </Link>
        ))}
      </div>

      {tab === "tong-quan" && (
        <>
          {t.description && <p className="desc">{t.description}</p>}
          {t.review_result && t.review_at && (
            <div className={`stamp${t.review_result === "returned" ? " ret" : ""}`}>
              {t.review_result === "approved" ? "Đã duyệt" : "Trả về sửa"}
              <small>
                {name(t.review_by)} · {fmtDateTime(t.review_at)}
              </small>
              {t.review_note && <small>“{t.review_note}”</small>}
            </div>
          )}
          <dl className="kv">
            <dt>Người tạo</dt>
            <dd>{name(t.created_by)}</dd>
            <dt>Ngày làm</dt>
            <dd className="mono">{fmtDate(t.work_day)}</dd>
            <dt>Tạo lúc</dt>
            <dd className="mono">{fmtDateTime(t.created_at)}</dd>
            <dt>Sửa lần cuối</dt>
            <dd className="mono">{fmtDateTime(t.updated_at)}</dd>
            <dt>Ưu tiên</dt>
            <dd>{PRIORITY[t.priority]}</dd>
            {totalH > 0 && (
              <>
                <dt>Tổng giờ</dt>
                <dd className="mono">{totalH} giờ</dd>
              </>
            )}
          </dl>

          {steps.length > 0 && (
            <ActionForm action={taskStep} className="box" resetOnOk>
              <h3>{reviewing ? "Sếp duyệt" : "Bước tiếp theo"}</h3>
              <input type="hidden" name="id" value={t.id} />
              {needNote && (
                <label className="f">
                  {reviewing ? "Nhận xét (bắt buộc khi trả về)" : "Lời nhắn cho sếp (không bắt buộc)"}
                  <textarea name="note" rows={2} />
                </label>
              )}
              <div className="row">
                {steps.map((s) => (
                  <button key={s.step} className={s.cls} type="submit" name="step" value={s.step}>
                    {s.label}
                  </button>
                ))}
              </div>
            </ActionForm>
          )}

          <ActionForm action={addTaskLog} className="box" resetOnOk>
            <h3>{mine ? "Ghi nhật ký" : "Ghi nhận xét"}</h3>
            <input type="hidden" name="id" value={t.id} />
            <label className="f">
              {mine ? "Hôm nay đã làm gì" : "Nội dung"}
              <textarea name="body" rows={2} required placeholder={mine ? "Ví dụ: Gọi khách chốt số lượng, gửi bản nháp báo giá" : ""} />
            </label>
            <div className="row">
              <label className="f" style={{ width: 120 }}>
                Số giờ
                <input type="number" name="hours" min="0" max="24" step="0.25" placeholder="0" />
              </label>
              <div style={{ flex: 1 }} />
              <button className="btn" type="submit" style={{ alignSelf: "flex-end" }}>
                Lưu nhật ký
              </button>
            </div>
          </ActionForm>

          {canEdit && (
            <Disclosure summary="Sửa công việc">
              <ActionForm action={editTask} className="add">
                <input type="hidden" name="id" value={t.id} />
                <label className="f t">
                  Tên công việc
                  <input type="text" name="title" required maxLength={160} defaultValue={t.title} />
                </label>
                <label className="f">
                  Hạn chót
                  <input type="date" name="due" defaultValue={t.due ?? ""} />
                </label>
                <label className="f">
                  Ưu tiên
                  <select name="priority" defaultValue={t.priority}>
                    <option value="normal">Bình thường</option>
                    <option value="high">Gấp</option>
                    <option value="low">Thấp</option>
                  </select>
                </label>
                <label className="f full">
                  Mô tả
                  <textarea name="description" rows={2} defaultValue={t.description} />
                </label>
                <div className="row end full">
                  <button className="btn primary" type="submit">
                    Lưu
                  </button>
                </div>
              </ActionForm>
            </Disclosure>
          )}

          {canDelete && (
            <Confirm label="Xoá công việc" question="Xoá hẳn việc này cùng toàn bộ việc con và nhật ký?">
              <ActionForm action={deleteTask} inline>
                <input type="hidden" name="id" value={t.id} />
                <button className="btn danger" type="submit">
                  Xoá
                </button>
              </ActionForm>
            </Confirm>
          )}
        </>
      )}

      {tab === "viec-con" && (
        <>
          {subs.length ? (
            <div className="list">
              {subs.map((s) => (
                <Link key={s.id} className="task sub" href={`/viec/${t.id}/con/${s.id}`}>
                  <span className={`dot ${s.status === "done" ? "approved" : s.status === "doing" ? "doing" : "todo"}`} />
                  <span className="t">{s.title}</span>
                  <span className={`pill ${s.status === "done" ? "approved" : s.status === "doing" ? "doing" : ""}`}>
                    {SUB_STATUS[s.status]}
                  </span>
                  <span className="meta">
                    {s.assignee_id && <span>Phụ trách: {name(s.assignee_id)}</span>}
                    {s.due && <span className="mono">Hạn {fmtDue(s.due)}</span>}
                    <Remain due={s.due} done={s.status === "done"} />
                    {pendingEdit.has(s.id) && <span className="pend">Chờ duyệt sửa</span>}
                  </span>
                </Link>
              ))}
            </div>
          ) : (
            <div className="empty">Chưa có việc con. Chia công việc thành các bước nhỏ ở form bên dưới.</div>
          )}

          <ActionForm action={addSubtask} className="box" resetOnOk>
            <h3>Thêm việc con</h3>
            <input type="hidden" name="task_id" value={t.id} />
            <label className="f">
              Tên việc con
              <input type="text" name="title" required maxLength={160} placeholder="Ví dụ: Xin báo giá giấy từ 3 nhà cung cấp" />
            </label>
            <div className="grid2">
              <label className="f">
                Người giao việc
                <MemberSelect name="assigner_id" members={activeMembers} defaultValue={me.id} />
              </label>
              <label className="f">
                Người phụ trách
                <MemberSelect name="assignee_id" members={activeMembers} defaultValue="" />
              </label>
              <label className="f">
                Hạn chót
                <input type="datetime-local" name="due" />
              </label>
            </div>
            <label className="f">
              Ghi chú
              <textarea name="description" rows={2} />
            </label>
            <div className="row end">
              <button className="btn primary" type="submit">
                Thêm việc con
              </button>
            </div>
          </ActionForm>
        </>
      )}

      {tab === "tai-lieu" && (
        <div className="box">
          <h3>Tài liệu</h3>
          <p className="muted small" style={{ margin: 0 }}>
            Tải file lên, Claude sẽ đọc rồi tóm tắt, nêu ý chính và gợi ý việc nên làm tiếp. Gợi ý việc con có thể thêm ngay bằng một
            nút bấm.
          </p>
          <FileUpload taskId={t.id} />
          <FileCards
            files={files}
            me={me}
            name={name}
            taskId={t.id}
            subtaskTitles={subs.map((s) => s.title)}
            subtaskNames={new Map(subs.map((s) => [s.id, s.title]))}
          />
        </div>
      )}

      {tab === "lich-su" && (
        <div className="box">
          <h3>Lịch sử công việc</h3>
          <ul className="timeline">
            {logs
              .slice()
              .reverse()
              .map((l) => (
                <li key={l.id}>
                  <span className="when mono">
                    {fmtTime(l.created_at)}
                    <br />
                    {fmtDate(l.created_at).slice(0, 5)}
                  </span>
                  <div className="what">
                    <span className={`k ${KIND_CLS[l.kind] ?? ""}`}>{LOG_KIND[l.kind] ?? l.kind}</span>
                    <b>{name(l.author_id)}</b>
                    {l.hours ? <span className="mono muted"> · {Number(l.hours)} giờ</span> : null}
                    {l.body && <div className="note">{l.body}</div>}
                  </div>
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}
