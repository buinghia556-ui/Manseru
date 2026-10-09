"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavTabs({ pending, isAdmin }: { pending: number; isAdmin: boolean }) {
  const path = usePathname();
  const tabs = [
    { href: "/", label: "Công việc", on: path === "/" || path.startsWith("/viec") },
    { href: "/dashboard", label: "Dashboard", on: path.startsWith("/dashboard") },
    { href: "/cho-duyet", label: "Chờ duyệt", badge: pending, on: path.startsWith("/cho-duyet") },
    { href: "/nhat-ky", label: "Nhật ký", on: path.startsWith("/nhat-ky") },
    { href: "/thanh-vien", label: isAdmin ? "Thành viên" : "Tài khoản", on: path.startsWith("/thanh-vien") },
  ];
  return (
    <nav className="tabs">
      {tabs.map((t) => (
        <Link key={t.href} href={t.href} aria-current={t.on ? "page" : undefined}>
          {t.label}
          {!!t.badge && <span className="badge">{t.badge}</span>}
        </Link>
      ))}
    </nav>
  );
}
