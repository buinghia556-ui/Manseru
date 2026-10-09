import { unzipSync, strFromU8 } from "fflate";

/** Nội dung file đã chuẩn bị để gửi cho Claude. */
export type Extracted =
  | { kind: "pdf"; data: string }
  | { kind: "image"; media: "image/png" | "image/jpeg" | "image/gif" | "image/webp"; data: string }
  | { kind: "text"; text: string; truncated: boolean };

/** Giới hạn chữ gửi đi (~100 nghìn token) để một file rất dài không tốn quá nhiều. */
const MAX_CHARS = 300_000;

const IMAGE_TYPES: Record<string, "image/png" | "image/jpeg" | "image/gif" | "image/webp"> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
};
const TEXT_EXT = new Set(["txt", "csv", "tsv", "md", "json", "log"]);

/** Lỗi có câu báo tiếng Việt, hiện thẳng cho người dùng. */
export class FriendlyError extends Error {}

export function extOf(name: string) {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : "";
}

function cap(text: string): Extracted {
  const clean = text.replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (!clean) throw new FriendlyError("File không có chữ nào để đọc.");
  return clean.length > MAX_CHARS
    ? { kind: "text", text: clean.slice(0, MAX_CHARS), truncated: true }
    : { kind: "text", text: clean, truncated: false };
}

function decodeXml(s: string) {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Lấy chữ từ XML của Word/PowerPoint: xuống dòng ở cuối đoạn, bỏ các thẻ. */
function xmlText(xml: string, para: string) {
  return decodeXml(
    xml
      .replace(/<w:(delText|instrText)\b[^>]*>[\s\S]*?<\/w:\1>/g, "")
      .replace(/<w:tab\/>/g, "\t")
      .replace(/<(w:br|a:br)\b[^>]*\/>/g, "\n")
      .replace(new RegExp(`</${para}>`, "g"), "\n")
      .replace(/<[^>]+>/g, ""),
  );
}

function docx(files: Record<string, Uint8Array>) {
  const doc = files["word/document.xml"];
  if (!doc) throw new FriendlyError("File Word bị hỏng hoặc không đúng định dạng .docx.");
  // Bảng: các ô trên cùng một dòng cách nhau bằng tab.
  const xml = strFromU8(doc).replace(/<\/w:p>\s*<\/w:tc>/g, "\t</w:tc>").replace(/<\/w:tr>/g, "\n</w:tr>");
  return xmlText(xml, "w:p");
}

function pptx(files: Record<string, Uint8Array>) {
  const slides = Object.keys(files)
    .map((k) => /^ppt\/slides\/slide(\d+)\.xml$/.exec(k))
    .filter((m): m is RegExpExecArray => !!m)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  if (!slides.length) throw new FriendlyError("File PowerPoint không có trang chiếu nào.");
  return slides.map((m, i) => `--- Trang chiếu ${i + 1} ---\n${xmlText(strFromU8(files[m[0]]), "a:p")}`).join("\n");
}

function colIndex(ref: string) {
  let n = 0;
  for (const ch of ref.replace(/\d+$/, "")) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel → mỗi trang tính thành bảng, các ô cách nhau bằng dấu tab. */
function xlsx(files: Record<string, Uint8Array>) {
  const str = (k: string) => (files[k] ? strFromU8(files[k]) : "");
  const shared = [...str("xl/sharedStrings.xml").matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map((m) =>
    decodeXml([...m[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")),
  );
  const rels = new Map(
    [...str("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b[^>]*>/g)].map((m) => [
      /Id="([^"]+)"/.exec(m[0])?.[1] ?? "",
      (/Target="([^"]+)"/.exec(m[0])?.[1] ?? "").replace(/^\/?(xl\/)?/, "xl/"),
    ]),
  );
  const sheets = [...str("xl/workbook.xml").matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    name: decodeXml(/name="([^"]*)"/.exec(m[0])?.[1] ?? ""),
    path: rels.get(/r:id="([^"]+)"/.exec(m[0])?.[1] ?? "") ?? "",
  }));
  if (!sheets.length) throw new FriendlyError("File Excel bị hỏng hoặc không đúng định dạng .xlsx.");

  const out: string[] = [];
  for (const sh of sheets) {
    const xml = str(sh.path);
    const rows: string[] = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
      const cells: string[] = [];
      for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const attrs = c[1];
        const body = c[2] ?? "";
        const ref = /r="([A-Z]+\d+)"/.exec(attrs)?.[1];
        const type = /t="(\w+)"/.exec(attrs)?.[1];
        let v = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
        if (type === "s") v = shared[Number(v)] ?? "";
        else if (type === "inlineStr") v = [...body.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("");
        else if (type === "b") v = v === "1" ? "TRUE" : "FALSE";
        v = decodeXml(v).replace(/[\t\n]+/g, " ");
        const i = ref ? colIndex(ref) : cells.length;
        while (cells.length < i) cells.push("");
        cells[i] = v;
      }
      if (cells.some((x) => x !== "")) rows.push(cells.join("\t"));
    }
    out.push(`--- Trang tính: ${sh.name} (${rows.length} dòng) ---\n${rows.join("\n")}`);
  }
  return out.join("\n\n");
}

export function extractFile(name: string, mime: string, bytes: Uint8Array): Extracted {
  const ext = extOf(name);
  if (mime === "application/pdf" || ext === "pdf") {
    return { kind: "pdf", data: Buffer.from(bytes).toString("base64") };
  }
  if (IMAGE_TYPES[ext]) return { kind: "image", media: IMAGE_TYPES[ext], data: Buffer.from(bytes).toString("base64") };
  if (["doc", "xls", "ppt"].includes(ext)) {
    throw new FriendlyError(`Chưa đọc được file .${ext} đời cũ. Hãy mở file và lưu lại dạng .${ext}x hoặc PDF rồi tải lên lại.`);
  }
  if (["docx", "xlsx", "pptx"].includes(ext)) {
    let files: Record<string, Uint8Array>;
    try {
      files = unzipSync(bytes);
    } catch {
      throw new FriendlyError("File bị hỏng hoặc có mật khẩu nên chưa mở được.");
    }
    return cap(ext === "docx" ? docx(files) : ext === "xlsx" ? xlsx(files) : pptx(files));
  }
  if (TEXT_EXT.has(ext) || mime.startsWith("text/")) return cap(new TextDecoder("utf-8").decode(bytes));
  throw new FriendlyError("Loại file này chưa đọc được. Hãy dùng PDF, Word, Excel, PowerPoint, hình hoặc file chữ.");
}
