import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { analyzeDocument, hasApiKey } from "@/lib/ai";
import { extractFile, FriendlyError } from "@/lib/extract";
import type { FileAnalysis, TaskFile } from "@/lib/types";

// File lớn có thể mất một lúc để Claude đọc xong.
export const maxDuration = 300;

const reply = (status: number, body: { ok?: string; error?: string }) => Response.json(body, { status });

/** Cho Claude đọc một tài liệu đã tải lên, rồi lưu tóm tắt và gợi ý vào tài liệu đó. */
export async function POST(_req: Request, ctx: RouteContext<"/api/tai-lieu/[id]/doc">) {
  const { id } = await ctx.params;
  const supabase = await createClient();

  const { data: started, error: startErr } = await supabase.rpc("start_file_analysis", { p_id: id });
  if (startErr) return reply(400, { error: startErr.message });
  if (!started) return reply(409, { error: "Tài liệu này đang được đọc, chờ một lát rồi tải lại trang." });

  const fail = async (message: string) => {
    await supabase.rpc("save_file_analysis", { p_id: id, p_ok: false, p_error: message });
    revalidatePath("/", "layout");
    return reply(200, { error: message });
  };

  try {
    if (!hasApiKey()) {
      return await fail("Chưa cài khoá ANTHROPIC_API_KEY trên máy chủ nên chưa tóm tắt được. File vẫn được lưu bình thường.");
    }
    const { data: f } = await supabase.from("task_files").select("*").eq("id", id).single<TaskFile>();
    if (!f) return await fail("Không tìm thấy tài liệu.");
    const [taskRes, subsRes, blob] = await Promise.all([
      supabase.from("tasks").select("title, description").eq("id", f.task_id).single<{ title: string; description: string }>(),
      supabase.from("subtasks").select("id, title").eq("task_id", f.task_id),
      supabase.storage.from("attachments").download(f.storage_path),
    ]);
    if (blob.error || !blob.data) return await fail("Không tải được file từ kho lưu trữ.");
    const subs = (subsRes.data ?? []) as { id: string; title: string }[];

    const doc = extractFile(f.name, f.mime, new Uint8Array(await blob.data.arrayBuffer()));
    const result: FileAnalysis = await analyzeDocument(doc, {
      fileName: f.name,
      taskTitle: taskRes.data?.title ?? "",
      taskDescription: taskRes.data?.description ?? "",
      subtaskTitle: subs.find((s) => s.id === f.subtask_id)?.title,
      existingSubtasks: subs.map((s) => s.title),
    });

    const { error } = await supabase.rpc("save_file_analysis", {
      p_id: id,
      p_ok: true,
      p_summary: result.summary,
      p_points: result.points,
      p_next_steps: result.next_steps,
      p_subtasks: result.subtasks,
    });
    if (error) return reply(400, { error: error.message });
    revalidatePath("/", "layout");
    return reply(200, { ok: "Đã đọc xong tài liệu" });
  } catch (e) {
    if (e instanceof FriendlyError) return await fail(e.message);
    console.error("Đọc tài liệu lỗi", e);
    return await fail("Đọc tài liệu bị lỗi, thử lại sau.");
  }
}
