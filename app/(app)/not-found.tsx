import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty">
      Không tìm thấy mục này. Có thể nó đã bị xoá. <Link href="/">Về danh sách công việc</Link>
    </div>
  );
}
