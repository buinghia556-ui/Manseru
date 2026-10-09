"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { addTaskFile } from "@/app/actions";
import { showToast } from "./ActionForm";

const MAX = 20 * 1024 * 1024;
export const FILE_ACCEPT =
  ".pdf,.docx,.xlsx,.pptx,.txt,.csv,.md,.json,.png,.jpg,.jpeg,.gif,.webp,application/pdf,image/png,image/jpeg,image/gif,image/webp";
const GUESS: Record<string, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  txt: "text/plain",
  csv: "text/csv",
  md: "text/markdown",
  json: "application/json",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};

/** Gọi máy chủ cho Claude đọc tài liệu. Trả về câu báo kết quả. */
export async function requestAnalysis(fileId: string): Promise<{ ok?: string; error?: string }> {
  try {
    const res = await fetch(`/api/tai-lieu/${fileId}/doc`, { method: "POST" });
    return await res.json();
  } catch {
    return { error: "Mất kết nối khi đang đọc file. Tải lại trang để xem kết quả." };
  }
}

/** Tải tài liệu lên kho, ghi vào công việc (hoặc việc con), rồi cho Claude đọc và tóm tắt. */
export function FileUpload({ taskId, subtaskId }: { taskId: string; subtaskId?: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<"" | "upload" | "read">("");
  const [err, setErr] = useState("");

  async function onFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1].toLowerCase() ?? "";
    const type = GUESS[ext];
    if (!type) return setErr("Chỉ nhận PDF, Word (.docx), Excel (.xlsx), PowerPoint (.pptx), hình hoặc file chữ (.txt, .csv).");
    if (file.size > MAX) return setErr("File lớn hơn 20 MB, hãy chọn file nhỏ hơn hoặc chia nhỏ ra.");
    setErr("");
    setPhase("upload");
    try {
      const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80) || "tai-lieu";
      const path = `${taskId}/files/${crypto.randomUUID()}-${safe}`;
      const up = await createClient().storage.from("attachments").upload(path, file, { contentType: type });
      if (up.error) throw new Error("Chưa tải được file lên. Thử lại hoặc chọn file khác.");
      const res = await addTaskFile(taskId, subtaskId ?? null, path, file.name, type, file.size);
      if (res.error || !res.id) throw new Error(res.error ?? "Chưa lưu được tài liệu.");
      router.refresh();
      setPhase("read");
      const r = await requestAnalysis(res.id);
      router.refresh();
      if (r.error) setErr(r.error);
      else showToast("Đã đọc xong, xem tóm tắt bên dưới");
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setPhase("");
    }
  }

  return (
    <>
      <label className={`btn primary filebtn${phase ? " busy" : ""}`}>
        {phase === "upload" ? "Đang tải file lên…" : phase === "read" ? "Claude đang đọc file…" : "Tải tài liệu lên"}
        <input type="file" accept={FILE_ACCEPT} disabled={!!phase} onChange={(e) => onFile(e.currentTarget)} />
      </label>
      {phase === "read" && <p className="muted small">File dài có thể mất khoảng một phút. Bạn cứ ở lại trang này.</p>}
      {err && (
        <p className="form-err" role="alert">
          {err}
        </p>
      )}
    </>
  );
}

/** Nút cho Claude đọc lại một tài liệu (khi lần trước lỗi hoặc chưa đọc). */
export function AnalyzeButton({ fileId, label }: { fileId: string; label: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <>
      <button
        type="button"
        className="btn ghost"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setErr("");
          const r = await requestAnalysis(fileId);
          router.refresh();
          setBusy(false);
          if (r.error) setErr(r.error);
          else showToast(r.ok ?? "Đã đọc xong");
        }}
      >
        {busy ? "Claude đang đọc…" : label}
      </button>
      {err && (
        <p className="form-err" role="alert">
          {err}
        </p>
      )}
    </>
  );
}
