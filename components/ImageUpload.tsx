"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addSubtaskImage } from "@/app/actions";
import { showToast } from "./ActionForm";

const MAX = 10 * 1024 * 1024;

/** Tải hình thẳng từ trình duyệt lên Supabase Storage, rồi ghi vào việc con. */
export function ImageUpload({ subtaskId }: { subtaskId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; at: number; error?: boolean } | null>(null);

  async function onFile(input: HTMLInputElement) {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) return setMsg({ text: "Chỉ nhận file hình.", at: Date.now(), error: true });
    if (file.size > MAX) return setMsg({ text: "Hình lớn hơn 10 MB, hãy chọn hình nhỏ hơn.", at: Date.now(), error: true });
    setBusy(true);
    try {
      const safe = file.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80) || "hinh";
      const path = `${subtaskId}/${crypto.randomUUID()}-${safe}`;
      const { error } = await createClient().storage.from("attachments").upload(path, file, { contentType: file.type });
      if (error) throw new Error("Chưa tải được hình lên. Thử lại hoặc chọn hình khác.");
      const res = await addSubtaskImage(subtaskId, path, file.name);
      if (res.error) throw new Error(res.error);
      setMsg(null);
      showToast(res.ok ?? "Đã thêm hình");
    } catch (e) {
      setMsg({ text: (e as Error).message, at: Date.now(), error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <label className={`btn filebtn${busy ? " busy" : ""}`}>
        {busy ? "Đang tải hình…" : "Thêm hình"}
        <input type="file" accept="image/*" disabled={busy} onChange={(e) => onFile(e.currentTarget)} />
      </label>
      {msg?.error && (
        <p className="form-err" role="alert">
          {msg.text}
        </p>
      )}
    </>
  );
}
