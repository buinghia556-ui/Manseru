import Link from "next/link";
import { TASK_STATUS, type Task } from "@/lib/types";
import { fmtDate, fmtDateTime, todayKey } from "@/lib/time";

export function TaskRow({ t, name, href }: { t: Task; name: (id: string) => string; href?: string }) {
  const today = todayKey();
  const over = !!t.due && t.status !== "approved" && t.due < today;
  return (
    <Link className="task" href={href ?? `/viec/${t.id}`}>
      <span className={`dot ${t.status}`} />
      <span className="t">{t.title}</span>
      <span className={`pill ${t.status}`}>{TASK_STATUS[t.status]}</span>
      <span className="meta">
        {t.priority === "high" && <span className="prio-high">Gấp</span>}
        {t.status !== "approved" && t.work_day < today && <span>Tồn từ {fmtDate(t.work_day)}</span>}
        {t.due && (
          <span className={over ? "overdue" : ""}>
            {over ? "Quá hạn " : "Hạn "}
            {fmtDate(t.due)}
          </span>
        )}
        <span>Tạo bởi {name(t.created_by)}</span>
        <span className="mono">Cập nhật {fmtDateTime(t.updated_at)}</span>
      </span>
    </Link>
  );
}

export function Section({
  title,
  count,
  extra,
  empty,
  children,
}: {
  title: string;
  count: string | number;
  extra?: React.ReactNode;
  empty?: string;
  children: React.ReactNode[];
}) {
  return (
    <section className="sec">
      <div className="sec-h">
        <h2>
          {title} <span className="cnt mono">{count}</span>
        </h2>
        {extra}
      </div>
      {children.length ? <div className="list">{children}</div> : <div className="empty">{empty}</div>}
    </section>
  );
}
