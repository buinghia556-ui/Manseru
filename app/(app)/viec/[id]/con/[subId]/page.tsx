import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addSubtaskLink,
  addSubtaskLog,
  cancelSubtaskEdit,
  decideSubtaskEdit,
  deleteSubtask,
  requestSubtaskEdit,
  setSubtaskStatus,
} from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Disclosure } from "@/components/Disclosure";
import { Confirm } from "@/components/Confirm";
import { ImageUpload } from "@/components/ImageUpload";
import { MemberSelect } from "@/components/MemberSelect";
import { Remain } from "@/components/Remain";
import { getNames, getProfiles, getSupabase, requireMe } from "@/lib/data";
import {
  EDIT_FIELDS,
  SUB_KIND,
  SUB_STATUS,
  type Attachment,
  type EditRequest,
  type SubHistory,
  type Subtask,
  type SubStatus,
} from "@/lib/types";
import { fmtDate, fmtDateTime, fmtDue, fmtTime, isoToLocalInput } from "@/lib/time";

const KIND_CLS: Record<string, string> = { editok: "approve", editno: "reject", editreq: "submit", log: "log" };

export default async function SubtaskPage({ params }: PageProps<"/viec/[id]/con/[subId]">) {
  const { id, subId } = await params;
  const supabase = await getSupabase();
  const [me, name, members, subRes, taskRes, histRes, attRes, reqRes] = await Promise.all([
    requireMe(),
    getNames(),
    getProfiles(),
    supabase.from("subtasks").select("*").eq("id", subId).eq("task_id", id).maybeSingle<Subtask>(),
    supabase.from("tasks").select("id, title").eq("id", id).maybeSingle<{ id: string; title: string }>(),
    supabase.from("subtask_history").select("*").eq("subtask_id", subId).order("created_at", { ascending: false }),
    supabase.from("subtask_attachments").select("*").eq("subtask_id", subId).order("created_at"),
    supabase.from("subtask_edit_requests").select("*").eq("subtask_id", subId).eq("status", "pending").maybeSingle<EditRequest>(),
  ]);
  const s = subRes.data;
  const task = taskRes.data;
  if (!s || !task) notFound();
  const history = (histRes.data ?? []) as SubHistory[];
  const atts = (attRes.data ?? []) as Attachment[];
  const pe = reqRes.data;
  const boss = me.role === "boss";
  const activeMembers = members.filter((m) => m.active);

  const images = atts.filter((a) => a.kind === "image" && a.storage_path);
  const links = atts.filter((a) => a.kind === "link" && a.url);
  const signed = images.length
    ? ((await supabase.storage.from("attachments").createSignedUrls(images.map((a) => a.storage_path!), 3600)).data ?? [])
    : [];
  const urlOf = new Map(signed.map((x) => [x.path, x.signedUrl]));

  const show = (k: string, v: string) => {
    if (!v) return "(trống)";
    if (k === "due") return fmtDue(v);
    if (k === "assigner_id" || k === "assignee_id") return name(v);
    return v;
  };
  const lastAt = s.updated_at > s.created_at ? s.updated_at : s.created_at;

  return (
    <div className="detail">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <Link className="back" href={`/viec/${task.id}?tab=viec-con`}>
          ‹ {task.title}
        </Link>
      </div>
      <h2>{s.title}</h2>
      <div className="row">
        <ActionForm action={setSubtaskStatus} inline>
          <input type="hidden" name="id" value={s.id} />
          <div className="seg" role="group" aria-label="Trạng thái">
            {(Object.keys(SUB_STATUS) as SubStatus[]).map((k) => (
              <button key={k} type="submit" name="status" value={k} aria-pressed={s.status === k}>
                {SUB_STATUS[k]}
              </button>
            ))}
          </div>
        </ActionForm>
        <Remain due={s.due} done={s.status === "done"} />
      </div>
      {s.description && <p className="desc">{s.description}</p>}
      <dl className="kv">
        <dt>Người giao việc</dt>
        <dd>{name(s.assigner_id)}</dd>
        <dt>Người phụ trách</dt>
        <dd>{name(s.assignee_id)}</dd>
        <dt>Hạn chót</dt>
        <dd className="mono">{fmtDue(s.due)}</dd>
        <dt>Tạo lúc</dt>
        <dd>
          <span className="mono">{fmtDateTime(s.created_at)}</span> · {name(s.created_by)}
        </dd>
        <dt>Sửa lần cuối</dt>
        <dd className="mono">{fmtDateTime(lastAt)}</dd>
      </dl>

      {pe && (
        <div className="box pendbox">
          <h3>Đề xuất sửa đang chờ sếp duyệt</h3>
          <p className="muted" style={{ margin: 0 }}>
            {name(pe.requested_by)} đề xuất lúc {fmtDateTime(pe.created_at)}
          </p>
          <dl className="kv diff">
            {Object.keys(pe.changes).map((k) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>{EDIT_FIELDS[k] ?? k}</dt>
                <dd>
                  <s className="muted">{show(k, pe.old_values[k] ?? "")}</s> → <b>{show(k, pe.changes[k] ?? "")}</b>
                </dd>
              </div>
            ))}
          </dl>
          {boss ? (
            <ActionForm action={decideSubtaskEdit} className="row">
              <input type="hidden" name="request_id" value={pe.id} />
              <label className="f" style={{ flex: "1 1 200px" }}>
                Lý do nếu từ chối
                <input type="text" name="note" />
              </label>
              <button className="btn danger" style={{ alignSelf: "flex-end" }} type="submit" name="decision" value="reject">
                Từ chối
              </button>
              <button className="btn seal" style={{ alignSelf: "flex-end" }} type="submit" name="decision" value="approve">
                Duyệt sửa
              </button>
            </ActionForm>
          ) : pe.requested_by === me.id ? (
            <ActionForm action={cancelSubtaskEdit} className="row end">
              <input type="hidden" name="request_id" value={pe.id} />
              <button className="btn ghost" type="submit">
                Rút đề xuất
              </button>
            </ActionForm>
          ) : null}
        </div>
      )}

      {!pe && (
        <Disclosure summary={boss ? "Sửa" : "Sửa (cần sếp duyệt)"}>
          <ActionForm action={requestSubtaskEdit} className="list">
            <input type="hidden" name="id" value={s.id} />
            <label className="f">
              Tên việc con
              <input type="text" name="title" required maxLength={160} defaultValue={s.title} />
            </label>
            <div className="grid2">
              <label className="f">
                Người giao việc
                <MemberSelect name="assigner_id" members={activeMembers} defaultValue={s.assigner_id ?? ""} />
              </label>
              <label className="f">
                Người phụ trách
                <MemberSelect name="assignee_id" members={activeMembers} defaultValue={s.assignee_id ?? ""} />
              </label>
              <label className="f">
                Hạn chót
                <input type="datetime-local" name="due" defaultValue={isoToLocalInput(s.due)} />
              </label>
            </div>
            <label className="f">
              Ghi chú
              <textarea name="description" rows={2} defaultValue={s.description} />
            </label>
            <div className="row end">
              <button className="btn primary" type="submit">
                {boss ? "Lưu" : "Gửi sếp duyệt"}
              </button>
            </div>
          </ActionForm>
        </Disclosure>
      )}

      <div className="box">
        <h3>Hình và link</h3>
        {images.length > 0 && (
          <div className="thumbs">
            {images.map((im) => {
              const url = urlOf.get(im.storage_path!);
              return url ? (
                <a key={im.id} href={url} target="_blank" rel="noopener" title={im.label || "Hình"}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={url} alt={im.label || "Hình đính kèm"} loading="lazy" />
                </a>
              ) : null;
            })}
          </div>
        )}
        {links.length > 0 && (
          <ul className="links">
            {links.map((l) => (
              <li key={l.id}>
                <a href={l.url!} target="_blank" rel="noopener noreferrer">
                  {l.label || l.url}
                </a>
                <span className="muted mono"> · {fmtDate(l.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
        {!images.length && !links.length && (
          <p className="muted" style={{ margin: 0 }}>
            Chưa có hình hay link nào.
          </p>
        )}
        <ActionForm action={addSubtaskLink} className="row" resetOnOk>
          <input type="hidden" name="id" value={s.id} />
          <input type="text" name="url" required placeholder="Dán link (Drive, Sheets, web…)" style={{ flex: "2 1 200px" }} />
          <input type="text" name="label" placeholder="Tên link (không bắt buộc)" style={{ flex: "1 1 140px" }} />
          <button className="btn" type="submit">
            Thêm link
          </button>
        </ActionForm>
        <ImageUpload subtaskId={s.id} />
      </div>

      <ActionForm action={addSubtaskLog} className="box" resetOnOk>
        <h3>Ghi lịch sử làm việc</h3>
        <input type="hidden" name="id" value={s.id} />
        <textarea name="body" rows={2} required placeholder="Đã làm gì cho việc con này" />
        <div className="row">
          <input type="number" name="hours" min="0" max="24" step="0.25" placeholder="Số giờ" style={{ width: 110 }} />
          <div style={{ flex: 1 }} />
          <button className="btn" type="submit">
            Lưu
          </button>
        </div>
      </ActionForm>

      <div className="box">
        <h3>Lịch sử việc con</h3>
        <ul className="timeline">
          {history.map((l) => (
            <li key={l.id}>
              <span className="when mono">
                {fmtTime(l.created_at)}
                <br />
                {fmtDate(l.created_at).slice(0, 5)}
              </span>
              <div className="what">
                <span className={`k ${KIND_CLS[l.kind] ?? ""}`}>{SUB_KIND[l.kind] ?? l.kind}</span>
                <b>{name(l.author_id)}</b>
                {l.hours ? <span className="mono muted"> · {Number(l.hours)} giờ</span> : null}
                {l.body && <div className="note">{l.body}</div>}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {(boss || s.created_by === me.id) && (
        <Confirm label="Xoá việc con" question="Xoá việc con này?">
          <ActionForm action={deleteSubtask} inline>
            <input type="hidden" name="id" value={s.id} />
            <input type="hidden" name="task_id" value={task.id} />
            <button className="btn danger" type="submit">
              Xoá
            </button>
          </ActionForm>
        </Confirm>
      )}
    </div>
  );
}
