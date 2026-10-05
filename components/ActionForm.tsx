"use client";

import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import type { ActionState } from "@/app/actions";

type Action = (state: ActionState, fd: FormData) => Promise<ActionState>;

const TOAST_EVENT = "scv-toast";
export function showToast(text: string) {
  window.dispatchEvent(new CustomEvent(TOAST_EVENT, { detail: text }));
}

/**
 * Form gọi server action, hiện lỗi ngay dưới form và thông báo ngắn khi thành công.
 * Không tự xoá nội dung khi lỗi, để người dùng sửa rồi gửi lại.
 */
export function ActionForm({
  action,
  children,
  className,
  resetOnOk = false,
  inline = false,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnOk?: boolean;
  inline?: boolean;
}) {
  const [state, setState] = useState<ActionState>({});
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const form = e.currentTarget;
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(form, submitter);
        start(async () => {
          const res = (await action(state, fd)) ?? {};
          setState(res);
          if (res.ok) {
            // Thông báo hiện ở Toaster chung, nên vẫn thấy dù form này biến mất sau khi trang cập nhật.
            showToast(res.ok);
            if (resetOnOk) form.reset();
          }
        });
      }}
    >
      <fieldset disabled={pending} className={inline ? "fs inline" : "fs"}>
        {children}
      </fieldset>
      {state.error && (
        <p className="form-err" role="alert" key={state.at}>
          {state.error}
        </p>
      )}
    </form>
  );
}

/** Đặt một lần ở layout gốc. */
export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const on = (e: Event) => {
      setMsg({ text: (e as CustomEvent<string>).detail, id: Date.now() });
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(null), 2600);
    };
    window.addEventListener(TOAST_EVENT, on);
    return () => {
      window.removeEventListener(TOAST_EVENT, on);
      clearTimeout(timer);
    };
  }, []);
  return msg ? (
    <div className="toast" role="status" key={msg.id}>
      {msg.text}
    </div>
  ) : null;
}
