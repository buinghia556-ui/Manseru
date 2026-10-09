import Anthropic from "@anthropic-ai/sdk";
import { FriendlyError, type Extracted } from "./extract";
import type { FileAnalysis } from "./types";

const MODEL = "claude-opus-5-5";

const SYSTEM = `Bạn là trợ lý trong app quản lý công việc "Sổ Công Việc" của một công ty Việt Nam.
Người dùng đính kèm một tài liệu vào một công việc. Hãy đọc kỹ tài liệu rồi trả lời bằng tiếng Việt, ngắn gọn, dễ hiểu với nhân viên văn phòng:
- summary: tóm tắt tài liệu nói về gì, trong 2 đến 5 câu.
- key_points: tối đa 8 ý chính, mỗi ý một câu; giữ nguyên các con số, ngày tháng, số tiền, tên người, tên công ty quan trọng.
- next_steps: tối đa 5 gợi ý nên làm gì tiếp theo với tài liệu này để hoàn thành công việc.
- subtasks: tối đa 5 việc con cụ thể có thể giao cho người khác làm (title ngắn dưới 100 ký tự, bắt đầu bằng động từ; note ghi thêm chi tiết nếu cần, có thể để trống). Không lặp lại việc con đã có.
Chỉ dựa vào nội dung tài liệu và thông tin công việc. Nếu tài liệu không liên quan đến công việc thì vẫn tóm tắt và nói rõ điều đó trong summary.`;

const SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    key_points: { type: "array", items: { type: "string" } },
    next_steps: { type: "array", items: { type: "string" } },
    subtasks: {
      type: "array",
      items: {
        type: "object",
        properties: { title: { type: "string" }, note: { type: "string" } },
        required: ["title", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["summary", "key_points", "next_steps", "subtasks"],
  additionalProperties: false,
};

export const hasApiKey = () => !!process.env.ANTHROPIC_API_KEY;

export type AnalyzeContext = {
  fileName: string;
  taskTitle: string;
  taskDescription: string;
  subtaskTitle?: string;
  existingSubtasks: string[];
};

/** Gửi tài liệu cho Claude, nhận lại tóm tắt và gợi ý. Lỗi ném ra có câu báo tiếng Việt. */
export async function analyzeDocument(doc: Extracted, ctx: AnalyzeContext): Promise<FileAnalysis> {
  const client = new Anthropic();

  const fileBlock: Anthropic.Beta.BetaContentBlockParam =
    doc.kind === "pdf"
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: doc.data }, title: ctx.fileName }
      : doc.kind === "image"
        ? { type: "image", source: { type: "base64", media_type: doc.media, data: doc.data } }
        : { type: "document", source: { type: "text", media_type: "text/plain", data: doc.text }, title: ctx.fileName };

  const info = [
    `Tên file: ${ctx.fileName}`,
    `Công việc: ${ctx.taskTitle}`,
    ctx.taskDescription && `Mô tả công việc: ${ctx.taskDescription}`,
    ctx.subtaskTitle && `File được đính kèm vào việc con: ${ctx.subtaskTitle}`,
    ctx.existingSubtasks.length ? `Việc con đã có: ${ctx.existingSubtasks.join("; ")}` : "Chưa có việc con nào.",
    doc.kind === "text" && doc.truncated && "Lưu ý: file rất dài, đây chỉ là phần đầu. Hãy nói rõ điều này trong summary.",
  ]
    .filter(Boolean)
    .join("\n");

  let message: Anthropic.Beta.BetaMessage;
  try {
    message = await client.beta.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "medium", format: { type: "json_schema", schema: SCHEMA } },
        system: SYSTEM,
        messages: [{ role: "user", content: [fileBlock, { type: "text", text: info }] }],
      })
      .finalMessage();
  } catch (e) {
    if (e instanceof Anthropic.AuthenticationError) throw new FriendlyError("Khoá ANTHROPIC_API_KEY không đúng hoặc đã bị thu hồi.");
    if (e instanceof Anthropic.PermissionDeniedError) throw new FriendlyError("Khoá ANTHROPIC_API_KEY không có quyền dùng Claude.");
    if (e instanceof Anthropic.RateLimitError) throw new FriendlyError("Claude đang bận hoặc tài khoản đã hết hạn mức. Thử lại sau ít phút.");
    if (e instanceof Anthropic.BadRequestError) {
      if (/credit|billing|balance/i.test(e.message)) throw new FriendlyError("Tài khoản Claude đã hết tiền. Nạp thêm ở console.anthropic.com.");
      throw new FriendlyError("Claude không đọc được file này (file quá lớn, có mật khẩu hoặc bị hỏng).");
    }
    if (e instanceof Anthropic.APIError) throw new FriendlyError("Máy chủ Claude đang lỗi, thử lại sau ít phút.");
    throw new FriendlyError("Chưa kết nối được Claude, thử lại sau.");
  }

  if (message.stop_reason === "refusal") throw new FriendlyError("Claude từ chối đọc tài liệu này.");
  if (message.stop_reason === "max_tokens") throw new FriendlyError("Kết quả quá dài nên bị cắt, hãy bấm Đọc lại.");
  const text = message.content.find((b) => b.type === "text")?.text ?? "";
  let raw: Partial<FileAnalysis> & { key_points?: unknown };
  try {
    raw = JSON.parse(text);
  } catch {
    throw new FriendlyError("Kết quả đọc file không hợp lệ, hãy bấm Đọc lại.");
  }
  const strings = (v: unknown, n: number) =>
    (Array.isArray(v) ? v : []).filter((x): x is string => typeof x === "string" && x.trim() !== "").slice(0, n);
  return {
    summary: String(raw.summary ?? "").trim(),
    points: strings(raw.key_points, 8),
    next_steps: strings(raw.next_steps, 5),
    subtasks: (Array.isArray(raw.subtasks) ? raw.subtasks : [])
      .filter((s) => s && typeof s.title === "string" && s.title.trim())
      .slice(0, 5)
      .map((s) => ({ title: s.title.trim().slice(0, 160), note: String(s.note ?? "").trim() })),
  };
}
