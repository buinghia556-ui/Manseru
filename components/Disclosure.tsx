"use client";

import { useState, type ReactNode } from "react";

/** Khối mở/đóng giữ nguyên trạng thái người dùng chọn khi trang tải lại dữ liệu. */
export function Disclosure({ summary, initialOpen = false, children }: { summary: string; initialOpen?: boolean; children: ReactNode }) {
  const [open] = useState(initialOpen);
  return (
    <details className="box" open={open}>
      <summary style={{ cursor: "pointer", fontWeight: 600 }}>{summary}</summary>
      {children}
    </details>
  );
}
