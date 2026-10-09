import { redirect } from "next/navigation";
import { signOut } from "@/app/actions";
import { createClient } from "@/lib/supabase/server";

export default async function WaitingPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/dang-nhap");
  const { data: me } = await supabase.from("profiles").select("full_name, active").eq("id", data.claims.sub).maybeSingle();
  if (me?.active) redirect("/");

  return (
    <div className="auth">
      <div className="brand">
        <h1>Sổ Công Việc</h1>
      </div>
      <div className="box">
        <h3>Đang chờ kích hoạt</h3>
        <p style={{ margin: 0 }}>
          Chào {me?.full_name || "bạn"}. Tài khoản đã được tạo nhưng cần quản trị kích hoạt và chọn vai trò (sếp hoặc
          nhân viên). Hãy nhắn quản trị, rồi tải lại trang này.
        </p>
        <form action={signOut}>
          <button className="btn ghost" type="submit">
            Đăng xuất
          </button>
        </form>
      </div>
    </div>
  );
}
