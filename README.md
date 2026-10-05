# Sổ Công Việc

App quản lý công việc cho sếp và nhân viên: thêm việc, ghi nhật ký, chia việc con, gửi sếp duyệt.
Đây là bản app thật của bản mẫu "Sổ Công Việc" trên Claude, có đăng nhập, cơ sở dữ liệu và phân quyền.

## Có gì trong app

- **Công việc:** việc hôm nay, việc tồn đọng (việc ngày trước chưa xong tự chuyển vào, sắp xếp theo mức quan trọng, hạn chót hoặc tồn lâu nhất), việc chờ duyệt và việc các ngày tới.
- **Dashboard:** hạn chót, trạng thái, thời gian còn lại, tiến độ việc con và người phụ trách của mọi công việc.
- **Chi tiết công việc:** 3 tab Tổng quan, Việc con, Lịch sử. Ghi nhật ký kèm số giờ, gửi sếp duyệt, rút lại, mở lại.
- **Việc con:** người giao, người phụ trách, hạn chót, hình, link, lịch sử làm việc, giờ tạo và giờ sửa.
- **Duyệt:** sếp Duyệt (đóng dấu đỏ) hoặc Trả về sửa (bắt buộc ghi lý do). Nhân viên sửa việc con thì phải chờ sếp duyệt mới áp dụng; sếp sửa thì áp dụng ngay.
- **Nhật ký:** mọi hoạt động theo ngày, cộng tổng giờ.
- **Thành viên:** người đăng ký đầu tiên là quản trị. Người sau phải được quản trị kích hoạt và chọn vai trò (Sếp hoặc Nhân viên).

Luật phân quyền nằm trong cơ sở dữ liệu (Supabase), không chỉ ở giao diện: người dùng chỉ được đọc bảng, mọi thao tác ghi đi qua các hàm có kiểm tra vai trò. Nhân viên không thể tự duyệt việc hay sửa thẳng việc con dù gọi trực tiếp API.

## Đưa app lên mạng (miễn phí)

Cần 2 tài khoản: **Supabase** (lưu dữ liệu, đăng nhập, hình) và **Vercel** (chạy web). Cả hai đăng nhập bằng GitHub được.

### 1. Supabase

1. Vào <https://supabase.com>, đăng nhập, bấm **New project**. Đặt tên, tạo mật khẩu database (lưu lại), chọn vùng **Southeast Asia (Singapore)**.
2. Khi dự án tạo xong, mở **SQL Editor**, bấm **New query**, dán toàn bộ nội dung file
   [`supabase/migrations/20261005000000_init.sql`](supabase/migrations/20261005000000_init.sql) rồi bấm **Run**.
3. Mở **Authentication → Sign In / Providers → Email**. Nếu không muốn mọi người phải bấm link xác nhận trong email, tắt **Confirm email**.
4. Bấm nút **Connect** ở đầu trang dự án (hoặc **Project Settings → API Keys**), chép 2 giá trị:
   - Project URL (dạng `https://xxxx.supabase.co`)
   - Publishable key (dạng `sb_publishable_...`; dự án cũ thì dùng `anon` key)

### 2. Vercel

1. Vào <https://vercel.com>, đăng nhập bằng GitHub, bấm **Add New → Project**, chọn repo `manseru`, bấm **Import**.
2. Ở mục **Environment Variables**, thêm:
   - `NEXT_PUBLIC_SUPABASE_URL` = Project URL ở trên
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` = Publishable key ở trên
3. Bấm **Deploy**. Xong sẽ có link dạng `https://manseru.vercel.app`.
4. Quay lại Supabase, **Authentication → URL Configuration**: đặt **Site URL** là link Vercel, và thêm vào **Redirect URLs** dòng `https://manseru.vercel.app/**` (thay bằng link của bạn).

### 3. Bắt đầu dùng

1. Mở link app, bấm **Đăng ký**. Người đầu tiên là quản trị.
2. Gửi link cho sếp và đồng nghiệp để họ đăng ký. Họ sẽ thấy màn hình "Đang chờ kích hoạt".
3. Vào tab **Thành viên**, chọn vai trò **Sếp** cho sếp (Nhân viên cho người còn lại), đặt **Được dùng**, bấm **Lưu**.

Mỗi lần có code mới trên nhánh `main`, Vercel tự cập nhật app. Nếu có file mới trong `supabase/migrations/`, chạy thêm file đó trong SQL Editor.

## Chạy trên máy (cho lập trình viên)

```bash
cp .env.example .env.local   # điền URL và key của Supabase
npm install
npm run dev                  # http://localhost:3000
```

Kiểm tra: `npm run lint`, `npm run typecheck`, `npm run build`.
Kiểm tra luật phân quyền trên Postgres cục bộ: `npm run test:db` (cần `psql`, `createdb`; chạy với người dùng Postgres có quyền tạo database).

Cấu trúc chính:

- `supabase/migrations/` bảng, RLS và các hàm thao tác (tạo việc, gửi duyệt, duyệt, đề xuất sửa…)
- `supabase/tests/rules_test.sql` kiểm tra ai được làm gì
- `app/(app)/` các trang: Công việc, Dashboard, Chờ duyệt, Nhật ký, Thành viên, chi tiết việc và việc con
- `app/actions.ts` các thao tác phía máy chủ, gọi hàm trong Supabase
- `lib/time.ts` ngày giờ luôn tính theo giờ Việt Nam
