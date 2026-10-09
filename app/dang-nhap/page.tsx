import { redirect } from "next/navigation";
import { signIn, signUp } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { createClient } from "@/lib/supabase/server";

export default async function LoginPage({ searchParams }: PageProps<"/dang-nhap">) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims) redirect("/");
  const signup = (await searchParams).dang === "ky";

  return (
    <div className="auth">
      <div className="brand">
        <h1>Sổ Công Việc</h1>
        <p className="muted">Thêm việc, ghi nhật ký và gửi sếp duyệt.</p>
      </div>

      {signup ? (
        <ActionForm action={signUp} className="box">
          <h3>Tạo tài khoản</h3>
          <label className="f">
            Họ tên
            <input type="text" name="full_name" required autoComplete="name" />
          </label>
          <label className="f">
            Email
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label className="f">
            Mật khẩu (ít nhất 8 ký tự)
            <input type="password" name="password" required minLength={8} autoComplete="new-password" />
          </label>
          <button className="btn primary" type="submit">
            Đăng ký
          </button>
          <p className="muted" style={{ margin: 0, fontSize: 13 }}>
            Người đăng ký đầu tiên là quản trị. Người sau cần quản trị kích hoạt mới vào được.
          </p>
        </ActionForm>
      ) : (
        <ActionForm action={signIn} className="box">
          <h3>Đăng nhập</h3>
          <label className="f">
            Email
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label className="f">
            Mật khẩu
            <input type="password" name="password" required autoComplete="current-password" />
          </label>
          <button className="btn primary" type="submit">
            Đăng nhập
          </button>
        </ActionForm>
      )}

      <p className="muted" style={{ textAlign: "center", margin: 0 }}>
        {signup ? (
          <a href="/dang-nhap">Đã có tài khoản? Đăng nhập</a>
        ) : (
          <a href="/dang-nhap?dang=ky">Chưa có tài khoản? Đăng ký</a>
        )}
      </p>
    </div>
  );
}
