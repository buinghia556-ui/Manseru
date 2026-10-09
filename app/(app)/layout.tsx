import Link from "next/link";
import { signOut } from "@/app/actions";
import { NavTabs } from "@/components/NavTabs";
import { countPendingEdits, getTasks, requireMe } from "@/lib/data";
import { STATUS_ORDER, TASK_STATUS } from "@/lib/types";
import { fmtDate, todayKey, weekday } from "@/lib/time";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await requireMe();
  const [tasks, pendingEdits] = await Promise.all([getTasks(), countPendingEdits()]);
  const count = Object.fromEntries(STATUS_ORDER.map((s) => [s, tasks.filter((t) => t.status === s).length]));
  const pending = count.pending + pendingEdits;
  const today = todayKey();
  const boss = me.role === "boss";

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <h1>
            <Link href="/" style={{ textDecoration: "none" }}>
              Sổ Công Việc
            </Link>
          </h1>
          <p>
            {weekday(today)}, {fmtDate(today)}
          </p>
        </div>
        <div className="who">
          <span className="name">{me.full_name}</span>
          <span className={`role${boss ? " boss" : ""}`}>{boss ? "Sếp" : "Nhân viên"}</span>
          <form action={signOut}>
            <button className="btn ghost" type="submit">
              Đăng xuất
            </button>
          </form>
        </div>
      </header>

      <div className="tally">
        {STATUS_ORDER.map((s) => (
          <Link key={s} href={`/?loc=${s}`}>
            <span className="n">{count[s]}</span>
            <span className="l">
              <span className={`dot ${s}`} />
              {TASK_STATUS[s]}
            </span>
          </Link>
        ))}
      </div>

      <NavTabs pending={pending} isAdmin={me.is_admin} />

      <main className="detail">{children}</main>
    </div>
  );
}
