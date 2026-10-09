"use client";

import { useEffect, useState } from "react";
import { remaining } from "@/lib/time";

/** Thời gian còn lại đến hạn, tự cập nhật mỗi 30 giây. */
export function Remain({ due, done }: { due: string | null; done: boolean }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  const r = remaining(due, done, now);
  return (
    <span className={`rem ${r.cls}`} suppressHydrationWarning>
      {r.text}
    </span>
  );
}
