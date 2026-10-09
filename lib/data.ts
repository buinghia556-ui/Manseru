import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "./supabase/server";
import type { Profile, Task } from "./types";

export const getSupabase = cache(createClient);

/** Người đang đăng nhập; chuyển về trang đăng nhập hoặc trang chờ nếu chưa đủ quyền. */
export const requireMe = cache(async (): Promise<Profile> => {
  const supabase = await getSupabase();
  const { data } = await supabase.auth.getClaims();
  const uid = data?.claims?.sub;
  if (!uid) redirect("/dang-nhap");
  const { data: me } = await supabase.from("profiles").select("*").eq("id", uid).maybeSingle<Profile>();
  if (!me || !me.active) redirect("/cho-kich-hoat");
  return me;
});

export const getProfiles = cache(async (): Promise<Profile[]> => {
  const supabase = await getSupabase();
  const { data } = await supabase.from("profiles").select("*").order("full_name");
  return (data ?? []) as Profile[];
});

export async function getNames() {
  const me = await requireMe();
  const list = await getProfiles();
  const map = new Map(list.map((p) => [p.id, p.full_name || p.email]));
  return (id: string | null | undefined) => {
    if (!id) return "—";
    if (id === me.id) return "Bạn";
    return map.get(id) ?? "Thành viên cũ";
  };
}

export const getTasks = cache(async (): Promise<Task[]> => {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from("tasks").select("*").order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
});

export const countPendingEdits = cache(async (): Promise<number> => {
  const supabase = await getSupabase();
  const { count } = await supabase
    .from("subtask_edit_requests")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  return count ?? 0;
});
