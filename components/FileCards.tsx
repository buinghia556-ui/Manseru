import { addSubtask, deleteTaskFile } from "@/app/actions";
import { ActionForm } from "./ActionForm";
import { Confirm } from "./Confirm";
import { AnalyzeButton } from "./FileUpload";
import { getSupabase } from "@/lib/data";
import { fmtDateTime } from "@/lib/time";
import type { Profile, TaskFile } from "@/lib/types";

const STALE_MS = 5 * 60 * 1000;

/** Chưa đọc, hoặc "đang đọc" quá lâu (người tải lên đã rời trang): cho bấm đọc lại. */
function isStale(f: TaskFile) {
  return f.ai_status === "pending" || (f.ai_status === "running" && (!f.ai_at || Date.now() - Date.parse(f.ai_at) > STALE_MS));
}

function fmtSize(n: number) {
  if (n >= 1024 * 1024) return `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;
  return `${Math.max(1, Math.round(n / 1024))} KB`;
}

/** Danh sách tài liệu kèm tóm tắt, ý chính và gợi ý của Claude. */
export async function FileCards({
  files,
  me,
  name,
  taskId,
  subtaskTitles,
  subtaskNames,
}: {
  files: TaskFile[];
  me: Profile;
  name: (id: string | null | undefined) => string;
  taskId: string;
  /** Tên các việc con đang có, để gợi ý đã thêm thì không hiện nút Thêm nữa. */
  subtaskTitles: string[];
  /** Tên việc con theo id, để ghi file thuộc việc con nào (chỉ dùng ở trang công việc). */
  subtaskNames?: Map<string, string>;
}) {
  if (!files.length) {
    return (
      <p className="muted" style={{ margin: 0 }}>
        Chưa có tài liệu nào. Tải lên PDF, Word, Excel, PowerPoint hay hình, Claude sẽ đọc và tóm tắt giúp bạn.
      </p>
    );
  }
  const supabase = await getSupabase();
  const signed =
    (await supabase.storage.from("attachments").createSignedUrls(files.map((f) => f.storage_path), 3600, { download: true })).data ?? [];
  const urlOf = new Map(signed.map((x) => [x.path, x.signedUrl]));
  const have = new Set(subtaskTitles.map((t) => t.trim().toLowerCase()));
  const boss = me.role === "boss";

  return (
    <div className="files">
      {files.map((f) => {
        const mine = f.author_id === me.id || boss;
        const stale = isStale(f);
        const url = urlOf.get(f.storage_path);
        const sub = f.subtask_id ? subtaskNames?.get(f.subtask_id) : undefined;
        return (
          <article key={f.id} className="filecard">
            <header>
              {url ? (
                <a className="fname" href={url}>
                  {f.name}
                </a>
              ) : (
                <span className="fname">{f.name}</span>
              )}
              <span className="muted small">
                {fmtSize(f.size)} · {name(f.author_id)} · <span className="mono">{fmtDateTime(f.created_at)}</span>
                {sub && <> · Việc con: {sub}</>}
              </span>
            </header>

            {f.ai_status === "running" && !stale && <p className="muted ai-wait">Claude đang đọc file này…</p>}

            {f.ai_status === "failed" && (
              <p className="form-err" style={{ margin: 0 }}>
                {f.ai_error || "Chưa đọc được file này."}
              </p>
            )}

            {f.ai_summary && (
              <div className="ai">
                <span className="k ai-tag">Claude tóm tắt</span>
                <p className="desc">{f.ai_summary}</p>
                {f.ai_points.length > 0 && (
                  <>
                    <h4>Ý chính</h4>
                    <ul>
                      {f.ai_points.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </>
                )}
                {f.ai_next_steps.length > 0 && (
                  <>
                    <h4>Nên làm tiếp</h4>
                    <ul>
                      {f.ai_next_steps.map((p, i) => (
                        <li key={i}>{p}</li>
                      ))}
                    </ul>
                  </>
                )}
                {f.ai_subtasks.length > 0 && (
                  <>
                    <h4>Gợi ý việc con</h4>
                    <ul className="suggest">
                      {f.ai_subtasks.map((s, i) => (
                        <li key={i}>
                          <div>
                            <b>{s.title}</b>
                            {s.note && <div className="muted small">{s.note}</div>}
                          </div>
                          {have.has(s.title.trim().toLowerCase()) ? (
                            <span className="muted small">Đã thêm</span>
                          ) : (
                            <ActionForm action={addSubtask} inline>
                              <input type="hidden" name="task_id" value={taskId} />
                              <input type="hidden" name="title" value={s.title} />
                              <input type="hidden" name="description" value={s.note} />
                              <input type="hidden" name="assigner_id" value={me.id} />
                              <button className="btn" type="submit">
                                + Thêm
                              </button>
                            </ActionForm>
                          )}
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}

            {mine && (
              <div className="row end">
                {(stale || f.ai_status === "failed" || f.ai_status === "done") && (
                  <AnalyzeButton fileId={f.id} label={f.ai_status === "done" ? "Đọc lại" : "Cho Claude đọc"} />
                )}
                <Confirm label="Xoá" question={`Xoá tài liệu "${f.name}"?`}>
                  <ActionForm action={deleteTaskFile} inline>
                    <input type="hidden" name="id" value={f.id} />
                    <button className="btn danger" type="submit">
                      Xoá
                    </button>
                  </ActionForm>
                </Confirm>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
