"use client";

import { useState, type ReactNode } from "react";

/** Nút nguy hiểm cần bấm xác nhận lần hai. */
export function Confirm({ label, question, children }: { label: string; question: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <div className="row end">
        <button type="button" className="btn ghost" onClick={() => setOpen(true)}>
          {label}
        </button>
      </div>
    );
  }
  return (
    <div className="confirm">
      <span>{question}</span>
      <div className="row">
        <button type="button" className="btn ghost" onClick={() => setOpen(false)}>
          Giữ lại
        </button>
        {children}
      </div>
    </div>
  );
}
