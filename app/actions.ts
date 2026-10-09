"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { cookies, headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { localInputToIso, todayKey } from "@/lib/time";

export type ActionState = { ok?: string; error?: string; at?: number };

const str = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string) => {
  const v = parseFloat(str(fd, k).replace(",", "."));
  return Number.isFinite(v) && v > 0 ? v : null;
};
const orNull = (v: string) => (v === "" ? null : v);

function friendly(message: string): string {
  if (/JWT|not authenticated|permission denied for function/i.test(message)) {
    return "Phiên đăng nhập đã hết hạn. Hãy tải lại trang và đăng nhập lại.";
  }
  if (/fetch failed|network/i.test(message)) return "Chưa kết nối được máy chủ, thử lại sau ít giây.";
  return message;
}

async function rpc(fn: string, args: Record<string, unknown>, ok: string): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, args);
  if (error) return { error: friendly(error.message), at: Date.now() };
  revalidatePath("/", "layout");
  return { ok, at: Date.now() };
}

// ---------- Đăng nhập ----------

export async function signIn(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email: str(fd, "email"), password: str(fd, "password") });
  if (error) {
    return {
      error: /confirm/i.test(error.message)
        ? "Email chưa được xác nhận. Mở hộp thư và bấm link xác nhận trước."
        : "Sai email hoặc mật khẩu.",
      at: Date.now(),
    };
  }
  redirect("/");
}

export async function signUp(_: ActionState, fd: FormData): Promise<ActionState> {
  const name = str(fd, "full_name");
  const password = str(fd, "password");
  if (!name) return { error: "Nhập họ tên để mọi người biết bạn là ai.", at: Date.now() };
  if (password.length < 8) return { error: "Mật khẩu cần ít nhất 8 ký tự.", at: Date.now() };
  const origin = (await headers()).get("origin");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: str(fd, "email"),
    password,
    options: { data: { full_name: name }, emailRedirectTo: origin ? `${origin}/auth/callback` : undefined },
  });
  if (error) return { error: friendly(error.message), at: Date.now() };
  if (!data.session) {
    return { ok: "Đã tạo tài khoản. Mở email và bấm link xác nhận, rồi quay lại đăng nhập.", at: Date.now() };
  }
  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/dang-nhap");
}

// ---------- Công việc ----------

export async function createTask(_: ActionState, fd: FormData) {
  return rpc(
    "create_task",
    {
      p_title: str(fd, "title"),
      p_description: str(fd, "description"),
      p_priority: str(fd, "priority") || "normal",
      p_work_day: str(fd, "work_day") || todayKey(),
      p_due: orNull(str(fd, "due")),
    },
    "Đã thêm việc",
  );
}

export async function editTask(_: ActionState, fd: FormData) {
  return rpc(
    "edit_task",
    {
      p_id: str(fd, "id"),
      p_title: str(fd, "title"),
      p_description: str(fd, "description"),
      p_priority: str(fd, "priority") || "normal",
      p_due: orNull(str(fd, "due")),
    },
    "Đã lưu thay đổi",
  );
}

export async function moveToToday(_: ActionState, fd: FormData) {
  return rpc("set_task_day", { p_id: str(fd, "id"), p_day: todayKey() }, "Đã đưa vào việc hôm nay");
}

// Một form "Bước tiếp theo" với nhiều nút; nút được bấm quyết định thao tác.
export async function taskStep(_: ActionState, fd: FormData) {
  const id = str(fd, "id");
  const note = str(fd, "note");
  switch (str(fd, "step")) {
    case "start":
      return rpc("start_task", { p_id: id }, "Đã chuyển sang Đang làm");
    case "submit":
      return rpc("submit_task", { p_id: id, p_note: note }, "Đã gửi sếp duyệt");
    case "recall":
      return rpc("recall_task", { p_id: id }, "Đã rút lại");
    case "approve":
      return rpc("review_task", { p_id: id, p_approve: true, p_note: note }, "Đã duyệt");
    case "reject":
      return rpc("review_task", { p_id: id, p_approve: false, p_note: note }, "Đã trả về cho nhân viên");
    case "reopen":
      return rpc("reopen_task", { p_id: id }, "Đã mở lại");
    case "today":
      return rpc("set_task_day", { p_id: id, p_day: todayKey() }, "Đã đưa vào việc hôm nay");
    default:
      return { error: "Thao tác không hợp lệ.", at: Date.now() };
  }
}

export async function addTaskLog(_: ActionState, fd: FormData) {
  return rpc("add_task_log", { p_id: str(fd, "id"), p_body: str(fd, "body"), p_hours: num(fd, "hours") }, "Đã ghi nhật ký");
}

export async function deleteTask(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await rpc("delete_task", { p_id: str(fd, "id") }, "Đã xoá");
  if (res.error) return res;
  redirect("/");
}

export async function setBacklogSort(sort: string) {
  const store = await cookies();
  store.set("scv-sort", sort, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
}

// ---------- Việc con ----------

export async function addSubtask(_: ActionState, fd: FormData) {
  return rpc(
    "add_subtask",
    {
      p_task: str(fd, "task_id"),
      p_title: str(fd, "title"),
      p_description: str(fd, "description"),
      p_due: orNull(localInputToIso(str(fd, "due"))),
      p_assigner: orNull(str(fd, "assigner_id")),
      p_assignee: orNull(str(fd, "assignee_id")),
    },
    "Đã thêm việc con",
  );
}

export async function setSubtaskStatus(_: ActionState, fd: FormData) {
  return rpc("set_subtask_status", { p_id: str(fd, "id"), p_status: str(fd, "status") }, "Đã đổi trạng thái");
}

export async function addSubtaskLog(_: ActionState, fd: FormData) {
  return rpc(
    "add_subtask_log",
    { p_id: str(fd, "id"), p_body: str(fd, "body"), p_hours: num(fd, "hours") },
    "Đã ghi lịch sử làm việc",
  );
}

export async function addSubtaskLink(_: ActionState, fd: FormData) {
  let url = str(fd, "url");
  if (url && !/^https?:\/\//i.test(url)) url = "https://" + url;
  return rpc("add_subtask_link", { p_id: str(fd, "id"), p_url: url, p_label: str(fd, "label") }, "Đã thêm link");
}

export async function addSubtaskImage(id: string, path: string, name: string) {
  return rpc("add_subtask_image", { p_id: id, p_path: path, p_name: name }, "Đã thêm hình");
}

export async function requestSubtaskEdit(_: ActionState, fd: FormData): Promise<ActionState> {
  const changes = {
    title: str(fd, "title"),
    description: str(fd, "description"),
    due: localInputToIso(str(fd, "due")),
    assigner_id: str(fd, "assigner_id"),
    assignee_id: str(fd, "assignee_id"),
  };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("request_subtask_edit", { p_id: str(fd, "id"), p_changes: changes });
  if (error) return { error: friendly(error.message), at: Date.now() };
  revalidatePath("/", "layout");
  return { ok: data === "applied" ? "Đã sửa" : "Đã gửi sếp duyệt nội dung sửa", at: Date.now() };
}

export async function decideSubtaskEdit(_: ActionState, fd: FormData) {
  const approve = str(fd, "decision") === "approve";
  return rpc(
    "decide_subtask_edit",
    { p_request: str(fd, "request_id"), p_approve: approve, p_note: str(fd, "note") },
    approve ? "Đã duyệt nội dung sửa" : "Đã từ chối sửa",
  );
}

export async function cancelSubtaskEdit(_: ActionState, fd: FormData) {
  return rpc("cancel_subtask_edit", { p_request: str(fd, "request_id") }, "Đã rút đề xuất sửa");
}

export async function deleteSubtask(_: ActionState, fd: FormData): Promise<ActionState> {
  const res = await rpc("delete_subtask", { p_id: str(fd, "id") }, "Đã xoá việc con");
  if (res.error) return res;
  redirect(`/viec/${str(fd, "task_id")}?tab=viec-con`);
}

// ---------- Tài liệu ----------

export async function addTaskFile(
  taskId: string,
  subtaskId: string | null,
  path: string,
  name: string,
  mime: string,
  size: number,
): Promise<ActionState & { id?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("add_task_file", {
    p_task: taskId,
    p_subtask: subtaskId,
    p_path: path,
    p_name: name,
    p_mime: mime,
    p_size: size,
  });
  if (error) return { error: friendly(error.message), at: Date.now() };
  revalidatePath("/", "layout");
  return { ok: "Đã lưu tài liệu", id: data as string, at: Date.now() };
}

export async function deleteTaskFile(_: ActionState, fd: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const { data: path, error } = await supabase.rpc("delete_task_file", { p_id: str(fd, "id") });
  if (error) return { error: friendly(error.message), at: Date.now() };
  // Bản ghi đã xoá nên kho cho phép xoá file; lỗi ở bước này chỉ để lại file thừa, không ảnh hưởng người dùng.
  if (path) await supabase.storage.from("attachments").remove([path as string]);
  revalidatePath("/", "layout");
  return { ok: "Đã xoá tài liệu", at: Date.now() };
}

// ---------- Thành viên ----------

export async function updateMyName(_: ActionState, fd: FormData) {
  return rpc("update_my_name", { p_name: str(fd, "full_name") }, "Đã đổi tên");
}

export async function setMember(_: ActionState, fd: FormData) {
  return rpc(
    "set_member",
    { p_user: str(fd, "id"), p_role: str(fd, "role"), p_active: str(fd, "active") === "1" },
    "Đã cập nhật quyền",
  );
}
