export type Role = "employee" | "boss";
export type TaskStatus = "todo" | "doing" | "pending" | "returned" | "approved";
export type SubStatus = "todo" | "doing" | "done";
export type Priority = "high" | "normal" | "low";

export type Profile = {
  id: string;
  full_name: string;
  email: string;
  role: Role;
  is_admin: boolean;
  active: boolean;
  created_at: string;
};

export type Task = {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TaskStatus;
  work_day: string;
  due: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  review_by: string | null;
  review_at: string | null;
  review_note: string | null;
  review_result: "approved" | "returned" | null;
};

export type TaskLog = {
  id: string;
  task_id: string;
  author_id: string;
  kind: string;
  body: string;
  hours: number | null;
  created_at: string;
};

export type Subtask = {
  id: string;
  task_id: string;
  title: string;
  description: string;
  status: SubStatus;
  due: string | null;
  assigner_id: string | null;
  assignee_id: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};

export type SubHistory = TaskLog & { subtask_id: string };

export type Attachment = {
  id: string;
  subtask_id: string;
  kind: "link" | "image";
  url: string | null;
  storage_path: string | null;
  label: string;
  author_id: string;
  created_at: string;
};

export type EditRequest = {
  id: string;
  subtask_id: string;
  requested_by: string;
  changes: Record<string, string>;
  old_values: Record<string, string>;
  status: "pending" | "approved" | "rejected" | "cancelled";
  created_at: string;
};

export const TASK_STATUS: Record<TaskStatus, string> = {
  todo: "Cần làm",
  doing: "Đang làm",
  pending: "Chờ duyệt",
  returned: "Cần sửa",
  approved: "Đã duyệt",
};
export const STATUS_ORDER: TaskStatus[] = ["todo", "doing", "pending", "returned", "approved"];
export const SUB_STATUS: Record<SubStatus, string> = { todo: "Chưa làm", doing: "Đang làm", done: "Xong" };
export const PRIORITY: Record<Priority, string> = { high: "Gấp", normal: "Bình thường", low: "Thấp" };
export const LOG_KIND: Record<string, string> = {
  create: "Tạo việc",
  log: "Nhật ký",
  comment: "Nhận xét",
  status: "Trạng thái",
  edit: "Sửa",
  submit: "Gửi duyệt",
  recall: "Rút lại",
  approve: "Đã duyệt",
  reject: "Trả về",
  subtask: "Việc con",
  file: "Tài liệu",
};
export const SUB_KIND: Record<string, string> = {
  create: "Tạo",
  status: "Trạng thái",
  log: "Làm việc",
  attach: "Đính kèm",
  editreq: "Đề xuất sửa",
  editok: "Sếp duyệt sửa",
  editno: "Không áp dụng",
  edit: "Sếp sửa",
};
export const EDIT_FIELDS: Record<string, string> = {
  title: "Tên việc",
  due: "Hạn chót",
  assigner_id: "Người giao",
  assignee_id: "Người phụ trách",
  description: "Ghi chú",
};

// Cách sắp xếp việc tồn đọng; mỗi người tự chọn, lưu trong cookie trên máy họ.
export const SORTS = {
  prio: "Quan trọng trước",
  due: "Sắp đến hạn trước",
  old: "Tồn lâu nhất trước",
} as const;
export type SortKey = keyof typeof SORTS;

export type SuggestedSubtask = { title: string; note: string };

export type FileAnalysis = {
  summary: string;
  points: string[];
  next_steps: string[];
  subtasks: SuggestedSubtask[];
};

export type TaskFile = {
  id: string;
  task_id: string;
  subtask_id: string | null;
  storage_path: string;
  name: string;
  mime: string;
  size: number;
  author_id: string;
  created_at: string;
  ai_status: "pending" | "running" | "done" | "failed";
  ai_summary: string;
  ai_points: string[];
  ai_next_steps: string[];
  ai_subtasks: SuggestedSubtask[];
  ai_error: string;
  ai_at: string | null;
};
