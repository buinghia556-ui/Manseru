import Link from "next/link";
import { cookies } from "next/headers";
import { createTask, moveToToday } from "@/app/actions";
import { ActionForm } from "@/components/ActionForm";
import { Disclosure } from "@/components/Disclosure";
import { SortSelect } from "@/components/SortSelect";
import { Section, TaskRow } from "@/components/TaskRow";
import { getNames, getTasks } from "@/lib/data";
import { SORTS, TASK_STATUS, type SortKey, type Task, type TaskStatus } from "@/lib/types";
import { todayKey } from "@/lib/time";

const PRANK = { high: 0, normal: 1, low: 2 } as const;
const byDue = (a: Task, b: Task) => (a.due ?? "9999").localeCompare(b.due ?? "9999");
const byPrio = (a: Task, b: Task) => PRANK[a.priority] - PRANK[b.priority];
const byDay = (a: Task, b: Task) => a.work_day.localeCompare(b.work_day);
const SORT_FN: Record<SortKey, (a: Task, b: Task) => number> = {
  prio: (a, b) => byPrio(a, b) || byDue(a, b) || byDay(a, b),
  due: (a, b) => byDue(a, b) || byPrio(a, b),
  old: (a, b) => byDay(a, b) || byPrio(a, b),
};

export default async function TasksPage({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const [tasks, name] = await Promise.all([getTasks(), getNames()]);
  const loc = typeof sp.loc === "string" && sp.loc in TASK_STATUS ? (sp.loc as TaskStatus) : null;

  if (loc) {
    const list = tasks.filter((t) => t.status === loc);
    return (
      <Section
        title={`Đang lọc: ${TASK_STATUS[loc]}`}
        count={list.length}
        extra={
          <Link className="btn ghost" href="/">
            Bỏ lọc
          </Link>
        }
        empty="Không có việc nào ở mục này."
      >
        {list.map((t) => (
          <TaskRow key={t.id} t={t} name={name} />
        ))}
      </Section>
    );
  }

  const store = await cookies();
  const sortCookie = store.get("scv-sort")?.value;
  const sort: SortKey = sortCookie && sortCookie in SORTS ? (sortCookie as SortKey) : "prio";

  const today = todayKey();
  const isToday = (t: Task) => t.work_day === today || (t.status !== "approved" && t.due === today);
  const todayList = tasks
    .filter(isToday)
    .sort((a, b) => Number(a.status === "approved") - Number(b.status === "approved") || byPrio(a, b) || byDue(a, b));
  const backlog = tasks
    .filter((t) => !isToday(t) && t.status !== "approved" && t.status !== "pending" && t.work_day < today)
    .sort(SORT_FN[sort]);
  const waiting = tasks.filter((t) => !isToday(t) && t.status === "pending");
  const later = tasks
    .filter((t) => !isToday(t) && t.status !== "approved" && t.status !== "pending" && t.work_day > today)
    .sort(byDay);
  const doneToday = todayList.filter((t) => t.status === "approved").length;

  return (
    <>
      <Disclosure summary="+ Thêm việc" initialOpen={tasks.length === 0}>
        <ActionForm action={createTask} className="add" resetOnOk>
          <label className="f t">
            Tên công việc
            <input type="text" name="title" required maxLength={160} placeholder="Ví dụ: Báo giá cho khách hàng Minh Phát" />
          </label>
          <label className="f">
            Ngày làm
            <input type="date" name="work_day" defaultValue={today} />
          </label>
          <label className="f">
            Hạn chót
            <input type="date" name="due" />
          </label>
          <label className="f">
            Ưu tiên
            <select name="priority" defaultValue="normal">
              <option value="normal">Bình thường</option>
              <option value="high">Gấp</option>
              <option value="low">Thấp</option>
            </select>
          </label>
          <label className="f full">
            Mô tả (không bắt buộc)
            <textarea name="description" rows={2} placeholder="Cần làm gì, kết quả mong đợi" />
          </label>
          <div className="row end full">
            <button className="btn primary" type="submit">
              Thêm công việc
            </button>
          </div>
        </ActionForm>
      </Disclosure>

      <Section
        title="Việc hôm nay"
        count={doneToday ? `${doneToday}/${todayList.length} đã duyệt` : todayList.length}
        empty="Hôm nay chưa có việc nào. Bấm “+ Thêm việc”, hoặc bấm “Làm hôm nay” ở một việc tồn đọng."
      >
        {todayList.map((t) => (
          <TaskRow key={t.id} t={t} name={name} />
        ))}
      </Section>

      <Section
        title="Công việc tồn đọng"
        count={backlog.length}
        extra={<SortSelect value={sort} />}
        empty="Không có việc tồn đọng. Việc của những ngày trước chưa xong sẽ tự chuyển vào đây."
      >
        {backlog.map((t) => (
          <div className="bl-row" key={t.id}>
            <TaskRow t={t} name={name} />
            <ActionForm action={moveToToday} inline>
              <input type="hidden" name="id" value={t.id} />
              <button className="btn" type="submit" title="Chuyển việc này sang danh sách hôm nay">
                Làm hôm nay
              </button>
            </ActionForm>
          </div>
        ))}
      </Section>

      {waiting.length > 0 && (
        <Section title="Đang chờ sếp duyệt" count={waiting.length}>
          {waiting.map((t) => (
            <TaskRow key={t.id} t={t} name={name} />
          ))}
        </Section>
      )}
      {later.length > 0 && (
        <Section title="Việc các ngày tới" count={later.length}>
          {later.map((t) => (
            <TaskRow key={t.id} t={t} name={name} />
          ))}
        </Section>
      )}
    </>
  );
}
