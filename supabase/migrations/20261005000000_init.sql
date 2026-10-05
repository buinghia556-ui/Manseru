-- Sổ Công Việc: bảng, phân quyền và các thao tác.
--
-- Nguyên tắc: người dùng chỉ ĐỌC bảng trực tiếp (qua RLS). Mọi thao tác ghi
-- đi qua các hàm RPC bên dưới; mỗi hàm tự kiểm tra vai trò (sếp / nhân viên)
-- và ghi lịch sử. Vì vậy dù ai đó gọi thẳng API của Supabase cũng không
-- tự duyệt việc hay sửa việc con mà không qua sếp được.

-- ---------------------------------------------------------------------------
-- Thành viên
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  email text not null default '',
  role text not null default 'employee' check (role in ('employee', 'boss')),
  is_admin boolean not null default false,
  active boolean not null default false,
  created_at timestamptz not null default now()
);

-- Người đăng ký đầu tiên là quản trị và được kích hoạt ngay.
-- Những người sau phải chờ quản trị kích hoạt mới xem được dữ liệu.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_first boolean;
begin
  perform pg_advisory_xact_lock(727001);
  select not exists (select 1 from public.profiles) into v_first;
  insert into public.profiles (id, full_name, email, is_admin, active)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''), split_part(coalesce(new.email, ''), '@', 1)),
    coalesce(new.email, ''),
    v_first,
    v_first
  );
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create function public.is_boss() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'boss');
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and is_admin);
$$;

-- ---------------------------------------------------------------------------
-- Công việc
-- ---------------------------------------------------------------------------

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  priority text not null default 'normal' check (priority in ('high', 'normal', 'low')),
  status text not null default 'todo' check (status in ('todo', 'doing', 'pending', 'returned', 'approved')),
  work_day date not null default ((now() at time zone 'Asia/Ho_Chi_Minh')::date),
  due date,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  review_by uuid references public.profiles (id),
  review_at timestamptz,
  review_note text,
  review_result text check (review_result in ('approved', 'returned'))
);
create index tasks_status_idx on public.tasks (status);
create index tasks_work_day_idx on public.tasks (work_day);

create table public.task_logs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('create', 'log', 'comment', 'status', 'edit', 'submit', 'recall', 'approve', 'reject', 'subtask')),
  body text not null default '',
  hours numeric(5, 2) check (hours > 0 and hours <= 24),
  created_at timestamptz not null default now()
);
create index task_logs_task_idx on public.task_logs (task_id, created_at);
create index task_logs_created_idx on public.task_logs (created_at desc);

-- ---------------------------------------------------------------------------
-- Việc con
-- ---------------------------------------------------------------------------

create table public.subtasks (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  status text not null default 'todo' check (status in ('todo', 'doing', 'done')),
  due timestamptz,
  assigner_id uuid references public.profiles (id),
  assignee_id uuid references public.profiles (id),
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index subtasks_task_idx on public.subtasks (task_id);

create table public.subtask_history (
  id uuid primary key default gen_random_uuid(),
  subtask_id uuid not null references public.subtasks (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  kind text not null check (kind in ('create', 'status', 'log', 'attach', 'editreq', 'editok', 'editno', 'edit')),
  body text not null default '',
  hours numeric(5, 2) check (hours > 0 and hours <= 24),
  created_at timestamptz not null default now()
);
create index subtask_history_idx on public.subtask_history (subtask_id, created_at);

create table public.subtask_attachments (
  id uuid primary key default gen_random_uuid(),
  subtask_id uuid not null references public.subtasks (id) on delete cascade,
  kind text not null check (kind in ('link', 'image')),
  url text,
  storage_path text,
  label text not null default '',
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  check ((kind = 'link' and url is not null) or (kind = 'image' and storage_path is not null))
);
create index subtask_attachments_idx on public.subtask_attachments (subtask_id);

create table public.subtask_edit_requests (
  id uuid primary key default gen_random_uuid(),
  subtask_id uuid not null references public.subtasks (id) on delete cascade,
  requested_by uuid not null references public.profiles (id),
  changes jsonb not null,
  old_values jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  note text not null default '',
  created_at timestamptz not null default now()
);
-- Mỗi việc con chỉ có tối đa một đề xuất sửa đang chờ.
create unique index subtask_edit_requests_one_pending
  on public.subtask_edit_requests (subtask_id) where status = 'pending';

-- ---------------------------------------------------------------------------
-- Quyền đọc: thành viên đã kích hoạt xem được toàn bộ sổ.
-- Không có chính sách ghi nào, nên ghi trực tiếp vào bảng luôn bị chặn.
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.tasks enable row level security;
alter table public.task_logs enable row level security;
alter table public.subtasks enable row level security;
alter table public.subtask_history enable row level security;
alter table public.subtask_attachments enable row level security;
alter table public.subtask_edit_requests enable row level security;

create policy profiles_read on public.profiles for select to authenticated
  using (public.is_member() or id = auth.uid());
create policy tasks_read on public.tasks for select to authenticated using (public.is_member());
create policy task_logs_read on public.task_logs for select to authenticated using (public.is_member());
create policy subtasks_read on public.subtasks for select to authenticated using (public.is_member());
create policy subtask_history_read on public.subtask_history for select to authenticated using (public.is_member());
create policy subtask_attachments_read on public.subtask_attachments for select to authenticated using (public.is_member());
create policy subtask_edit_requests_read on public.subtask_edit_requests for select to authenticated using (public.is_member());

revoke insert, update, delete, truncate on
  public.profiles, public.tasks, public.task_logs, public.subtasks,
  public.subtask_history, public.subtask_attachments, public.subtask_edit_requests
  from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Hàm hỗ trợ
-- ---------------------------------------------------------------------------

create function public._me() returns uuid
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_member() then
    raise exception 'Tài khoản của bạn chưa được kích hoạt.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;

create function public._task_for_update(p_id uuid) returns public.tasks
language plpgsql security definer set search_path = public as $$
declare
  v public.tasks;
begin
  select * into v from public.tasks where id = p_id for update;
  if not found then
    raise exception 'Không tìm thấy công việc.' using errcode = 'P0002';
  end if;
  return v;
end $$;

create function public._subtask_for_update(p_id uuid) returns public.subtasks
language plpgsql security definer set search_path = public as $$
declare
  v public.subtasks;
begin
  select * into v from public.subtasks where id = p_id for update;
  if not found then
    raise exception 'Không tìm thấy việc con.' using errcode = 'P0002';
  end if;
  return v;
end $$;

create function public._log(p_task uuid, p_kind text, p_body text, p_hours numeric default null) returns void
language sql security definer set search_path = public as $$
  insert into public.task_logs (task_id, author_id, kind, body, hours)
  values (p_task, auth.uid(), p_kind, coalesce(p_body, ''), nullif(p_hours, 0));
  update public.tasks set updated_at = now() where id = p_task;
$$;

create function public._sublog(p_sub uuid, p_kind text, p_body text, p_hours numeric default null) returns void
language sql security definer set search_path = public as $$
  insert into public.subtask_history (subtask_id, author_id, kind, body, hours)
  values (p_sub, auth.uid(), p_kind, coalesce(p_body, ''), nullif(p_hours, 0));
  update public.subtasks set updated_at = now() where id = p_sub;
  update public.tasks set updated_at = now() where id = (select task_id from public.subtasks where id = p_sub);
$$;

create function public._clean_title(p text) returns text
language plpgsql immutable as $$
begin
  if p is null or char_length(trim(p)) = 0 then
    raise exception 'Tên không được để trống.' using errcode = '22023';
  end if;
  if char_length(trim(p)) > 160 then
    raise exception 'Tên dài quá 160 ký tự.' using errcode = '22023';
  end if;
  return trim(p);
end $$;

-- ---------------------------------------------------------------------------
-- Thao tác trên công việc
-- ---------------------------------------------------------------------------

create function public.create_task(
  p_title text, p_description text default '', p_priority text default 'normal',
  p_work_day date default null, p_due date default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  v_id uuid;
begin
  insert into public.tasks (title, description, priority, work_day, due, created_by)
  values (
    public._clean_title(p_title), coalesce(trim(p_description), ''), coalesce(p_priority, 'normal'),
    coalesce(p_work_day, (now() at time zone 'Asia/Ho_Chi_Minh')::date), p_due, v_me
  )
  returning id into v_id;
  perform public._log(v_id, 'create', '');
  return v_id;
end $$;

create function public.edit_task(
  p_id uuid, p_title text, p_description text, p_priority text, p_due date
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if not public.is_boss() and not (t.created_by = v_me and t.status in ('todo', 'doing', 'returned')) then
    raise exception 'Chỉ người tạo (khi việc chưa gửi duyệt) hoặc sếp mới sửa được công việc này.' using errcode = '42501';
  end if;
  update public.tasks
     set title = public._clean_title(p_title), description = coalesce(trim(p_description), ''),
         priority = coalesce(p_priority, priority), due = p_due
   where id = p_id;
  perform public._log(p_id, 'edit', 'Sửa thông tin công việc');
end $$;

create function public.set_task_day(p_id uuid, p_day date) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if t.created_by <> v_me and not public.is_boss() then
    raise exception 'Chỉ người tạo hoặc sếp mới đổi được ngày làm.' using errcode = '42501';
  end if;
  if t.status = 'approved' then
    raise exception 'Việc đã duyệt thì không đổi ngày làm.' using errcode = '22023';
  end if;
  update public.tasks set work_day = p_day where id = p_id;
  perform public._log(p_id, 'status', 'Chuyển sang ngày làm ' || to_char(p_day, 'DD/MM/YYYY'));
end $$;

create function public.start_task(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if t.created_by <> v_me then
    raise exception 'Chỉ người tạo mới bắt đầu được công việc này.' using errcode = '42501';
  end if;
  if t.status not in ('todo', 'returned') then
    raise exception 'Công việc không ở trạng thái Cần làm hoặc Cần sửa.' using errcode = '22023';
  end if;
  update public.tasks set status = 'doing' where id = p_id;
  perform public._log(p_id, 'status', 'Bắt đầu làm');
end $$;

create function public.submit_task(p_id uuid, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if t.created_by <> v_me then
    raise exception 'Chỉ người tạo mới gửi duyệt được công việc này.' using errcode = '42501';
  end if;
  if t.status not in ('todo', 'doing', 'returned') then
    raise exception 'Công việc này đang chờ duyệt hoặc đã được duyệt.' using errcode = '22023';
  end if;
  update public.tasks set status = 'pending', submitted_at = now() where id = p_id;
  perform public._log(p_id, 'submit', p_note);
end $$;

create function public.recall_task(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if t.created_by <> v_me then
    raise exception 'Chỉ người gửi mới rút lại được.' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'Công việc không còn ở trạng thái Chờ duyệt.' using errcode = '22023';
  end if;
  update public.tasks set status = 'doing', submitted_at = null where id = p_id;
  perform public._log(p_id, 'recall', 'Rút lại để sửa tiếp');
end $$;

create function public.review_task(p_id uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if not public.is_boss() then
    raise exception 'Chỉ sếp mới duyệt được công việc.' using errcode = '42501';
  end if;
  if t.status <> 'pending' then
    raise exception 'Công việc không ở trạng thái Chờ duyệt.' using errcode = '22023';
  end if;
  if not p_approve and coalesce(trim(p_note), '') = '' then
    raise exception 'Ghi lý do trả về để nhân viên biết cần sửa gì.' using errcode = '22023';
  end if;
  update public.tasks
     set status = case when p_approve then 'approved' else 'returned' end,
         review_by = v_me, review_at = now(), review_note = coalesce(trim(p_note), ''),
         review_result = case when p_approve then 'approved' else 'returned' end
   where id = p_id;
  perform public._log(p_id, case when p_approve then 'approve' else 'reject' end, p_note);
end $$;

create function public.reopen_task(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if t.created_by <> v_me and not public.is_boss() then
    raise exception 'Chỉ người tạo hoặc sếp mới mở lại được.' using errcode = '42501';
  end if;
  if t.status <> 'approved' then
    raise exception 'Chỉ mở lại được việc đã duyệt.' using errcode = '22023';
  end if;
  update public.tasks set status = 'doing' where id = p_id;
  perform public._log(p_id, 'status', 'Mở lại công việc');
end $$;

create function public.add_task_log(p_id uuid, p_body text, p_hours numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Nhập nội dung nhật ký.' using errcode = '22023';
  end if;
  if t.created_by = v_me then
    if t.status = 'todo' then
      update public.tasks set status = 'doing' where id = p_id;
    end if;
    perform public._log(p_id, 'log', trim(p_body), p_hours);
  else
    -- Người khác (thường là sếp) ghi vào việc của mình: tính là nhận xét.
    perform public._log(p_id, 'comment', trim(p_body), p_hours);
  end if;
end $$;

create function public.delete_task(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_id);
begin
  if not public.is_boss() and not (t.created_by = v_me and t.status <> 'approved') then
    raise exception 'Chỉ người tạo (khi việc chưa duyệt) hoặc sếp mới xoá được.' using errcode = '42501';
  end if;
  delete from public.tasks where id = p_id;
end $$;

-- ---------------------------------------------------------------------------
-- Thao tác trên việc con
-- ---------------------------------------------------------------------------

create function public._check_member_id(p uuid) returns void
language plpgsql stable security definer set search_path = public as $$
begin
  if p is not null and not exists (select 1 from public.profiles where id = p and active) then
    raise exception 'Người được chọn không phải thành viên.' using errcode = '22023';
  end if;
end $$;

create function public.add_subtask(
  p_task uuid, p_title text, p_description text default '', p_due timestamptz default null,
  p_assigner uuid default null, p_assignee uuid default null
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_task);
  v_id uuid;
begin
  perform public._check_member_id(p_assigner);
  perform public._check_member_id(p_assignee);
  insert into public.subtasks (task_id, title, description, due, assigner_id, assignee_id, created_by)
  values (t.id, public._clean_title(p_title), coalesce(trim(p_description), ''), p_due, p_assigner, p_assignee, v_me)
  returning id into v_id;
  perform public._sublog(v_id, 'create', '');
  perform public._log(t.id, 'subtask', 'Thêm việc con: ' || trim(p_title));
  return v_id;
end $$;

create function public.set_subtask_status(p_id uuid, p_status text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  s public.subtasks := public._subtask_for_update(p_id);
begin
  if p_status not in ('todo', 'doing', 'done') then
    raise exception 'Trạng thái không hợp lệ.' using errcode = '22023';
  end if;
  if s.status = p_status then
    return;
  end if;
  update public.subtasks set status = p_status where id = p_id;
  perform public._sublog(p_id, 'status',
    case p_status when 'todo' then 'Chưa làm' when 'doing' then 'Đang làm' else 'Xong' end);
end $$;

create function public.add_subtask_log(p_id uuid, p_body text, p_hours numeric default null) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  s public.subtasks := public._subtask_for_update(p_id);
begin
  if coalesce(trim(p_body), '') = '' then
    raise exception 'Nhập nội dung đã làm.' using errcode = '22023';
  end if;
  perform public._sublog(p_id, 'log', trim(p_body), p_hours);
end $$;

create function public.add_subtask_link(p_id uuid, p_url text, p_label text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  s public.subtasks := public._subtask_for_update(p_id);
begin
  if p_url is null or p_url !~* '^https?://[^\s]+$' then
    raise exception 'Link chưa đúng, ví dụ: https://drive.google.com/...' using errcode = '22023';
  end if;
  insert into public.subtask_attachments (subtask_id, kind, url, label, author_id)
  values (p_id, 'link', p_url, coalesce(trim(p_label), ''), v_me);
  perform public._sublog(p_id, 'attach', 'Thêm link: ' || coalesce(nullif(trim(p_label), ''), p_url));
end $$;

create function public.add_subtask_image(p_id uuid, p_path text, p_name text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  s public.subtasks := public._subtask_for_update(p_id);
begin
  if p_path is null or p_path not like p_id::text || '/%' then
    raise exception 'Đường dẫn hình không hợp lệ.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'attachments' and name = p_path) then
    raise exception 'Không tìm thấy hình đã tải lên.' using errcode = '22023';
  end if;
  insert into public.subtask_attachments (subtask_id, kind, storage_path, label, author_id)
  values (p_id, 'image', p_path, coalesce(trim(p_name), ''), v_me);
  perform public._sublog(p_id, 'attach', 'Thêm hình: ' || coalesce(nullif(trim(p_name), ''), 'ảnh'));
end $$;

-- Ghi các thay đổi đã duyệt vào việc con.
create function public._apply_subtask_changes(p_id uuid, c jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.subtasks set
    title       = case when c ? 'title' then public._clean_title(c ->> 'title') else title end,
    description = case when c ? 'description' then coalesce(c ->> 'description', '') else description end,
    due         = case when c ? 'due' then nullif(c ->> 'due', '')::timestamptz else due end,
    assigner_id = case when c ? 'assigner_id' then nullif(c ->> 'assigner_id', '')::uuid else assigner_id end,
    assignee_id = case when c ? 'assignee_id' then nullif(c ->> 'assignee_id', '')::uuid else assignee_id end
  where id = p_id;
end $$;

create function public._field_labels(c jsonb) returns text
language sql immutable as $$
  select string_agg(case k
      when 'title' then 'Tên việc' when 'description' then 'Ghi chú' when 'due' then 'Hạn chót'
      when 'assigner_id' then 'Người giao' when 'assignee_id' then 'Người phụ trách' else k end, ', ' order by k)
  from jsonb_object_keys(c) as k;
$$;

-- Nhân viên: tạo đề xuất sửa, chờ sếp duyệt. Sếp: áp dụng ngay.
-- Trả về 'applied' hoặc 'requested'.
create function public.request_subtask_edit(p_id uuid, p_changes jsonb) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  s public.subtasks := public._subtask_for_update(p_id);
  cur jsonb;
  k text;
  v_changes jsonb := '{}'::jsonb;
  v_old jsonb := '{}'::jsonb;
begin
  if p_changes is null or jsonb_typeof(p_changes) <> 'object' then
    raise exception 'Nội dung sửa không hợp lệ.' using errcode = '22023';
  end if;
  cur := jsonb_build_object(
    'title', s.title, 'description', s.description,
    'due', coalesce(to_char(s.due at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'), ''),
    'assigner_id', coalesce(s.assigner_id::text, ''), 'assignee_id', coalesce(s.assignee_id::text, ''));
  for k in select jsonb_object_keys(p_changes) loop
    if not cur ? k then
      raise exception 'Không sửa được trường %.', k using errcode = '22023';
    end if;
    if k = 'due' then
      -- So sánh theo thời điểm, không theo chuỗi.
      if (nullif(p_changes ->> k, '')::timestamptz) is not distinct from s.due then
        continue;
      end if;
    elsif coalesce(p_changes ->> k, '') = cur ->> k then
      continue;
    end if;
    if k in ('assigner_id', 'assignee_id') then
      perform public._check_member_id(nullif(p_changes ->> k, '')::uuid);
    end if;
    if k = 'title' then
      perform public._clean_title(p_changes ->> k);
    end if;
    v_changes := v_changes || jsonb_build_object(k, coalesce(p_changes ->> k, ''));
    v_old := v_old || jsonb_build_object(k, cur ->> k);
  end loop;

  if v_changes = '{}'::jsonb then
    raise exception 'Không có gì thay đổi.' using errcode = '22023';
  end if;

  if public.is_boss() then
    perform public._apply_subtask_changes(p_id, v_changes);
    perform public._sublog(p_id, 'edit', 'Sếp sửa: ' || public._field_labels(v_changes));
    return 'applied';
  end if;

  if exists (select 1 from public.subtask_edit_requests where subtask_id = p_id and status = 'pending') then
    raise exception 'Việc con này đã có một đề xuất sửa đang chờ sếp duyệt.' using errcode = '22023';
  end if;
  insert into public.subtask_edit_requests (subtask_id, requested_by, changes, old_values)
  values (p_id, v_me, v_changes, v_old);
  perform public._sublog(p_id, 'editreq', 'Xin sửa: ' || public._field_labels(v_changes));
  return 'requested';
end $$;

create function public.decide_subtask_edit(p_request uuid, p_approve boolean, p_note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  r public.subtask_edit_requests;
  v_name text;
begin
  if not public.is_boss() then
    raise exception 'Chỉ sếp mới duyệt được đề xuất sửa.' using errcode = '42501';
  end if;
  select * into r from public.subtask_edit_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'Đề xuất sửa không còn chờ duyệt.' using errcode = '22023';
  end if;
  perform public._subtask_for_update(r.subtask_id);
  select full_name into v_name from public.profiles where id = r.requested_by;
  update public.subtask_edit_requests
     set status = case when p_approve then 'approved' else 'rejected' end,
         decided_by = v_me, decided_at = now(), note = coalesce(trim(p_note), '')
   where id = p_request;
  if p_approve then
    perform public._apply_subtask_changes(r.subtask_id, r.changes);
    perform public._sublog(r.subtask_id, 'editok', 'Áp dụng thay đổi của ' || coalesce(v_name, 'nhân viên'));
  else
    perform public._sublog(r.subtask_id, 'editno', coalesce(trim(p_note), ''));
  end if;
end $$;

create function public.cancel_subtask_edit(p_request uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  r public.subtask_edit_requests;
begin
  select * into r from public.subtask_edit_requests where id = p_request for update;
  if not found or r.status <> 'pending' then
    raise exception 'Đề xuất sửa không còn chờ duyệt.' using errcode = '22023';
  end if;
  if r.requested_by <> v_me then
    raise exception 'Chỉ người đề xuất mới rút lại được.' using errcode = '42501';
  end if;
  update public.subtask_edit_requests set status = 'cancelled', decided_at = now() where id = p_request;
  perform public._sublog(r.subtask_id, 'editno', 'Người đề xuất rút lại');
end $$;

create function public.delete_subtask(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  s public.subtasks := public._subtask_for_update(p_id);
begin
  if s.created_by <> v_me and not public.is_boss() then
    raise exception 'Chỉ người tạo việc con hoặc sếp mới xoá được.' using errcode = '42501';
  end if;
  delete from public.subtasks where id = p_id;
  perform public._log(s.task_id, 'subtask', 'Xoá việc con: ' || s.title);
end $$;

-- ---------------------------------------------------------------------------
-- Thành viên
-- ---------------------------------------------------------------------------

create function public.update_my_name(p_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Bạn chưa đăng nhập.' using errcode = '42501';
  end if;
  update public.profiles set full_name = public._clean_title(p_name) where id = auth.uid();
end $$;

create function public.set_member(p_user uuid, p_role text, p_active boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_admin() then
    raise exception 'Chỉ quản trị mới phân quyền được.' using errcode = '42501';
  end if;
  if p_role not in ('employee', 'boss') then
    raise exception 'Vai trò không hợp lệ.' using errcode = '22023';
  end if;
  if p_user = auth.uid() and not p_active then
    raise exception 'Bạn không thể tự khoá tài khoản của mình.' using errcode = '22023';
  end if;
  update public.profiles set role = p_role, active = p_active where id = p_user;
  if not found then
    raise exception 'Không tìm thấy thành viên.' using errcode = 'P0002';
  end if;
end $$;

-- Các hàm nội bộ (bắt đầu bằng _) và hàm trigger không gọi được từ API.
revoke execute on function
  public.handle_new_user(), public._me(), public._task_for_update(uuid), public._subtask_for_update(uuid),
  public._log(uuid, text, text, numeric), public._sublog(uuid, text, text, numeric), public._clean_title(text),
  public._check_member_id(uuid), public._apply_subtask_changes(uuid, jsonb), public._field_labels(jsonb)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kho hình đính kèm (riêng tư, chỉ thành viên xem và tải lên)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('attachments', 'attachments', false, 10485760, array['image/*'])
on conflict (id) do nothing;

create policy attachments_read on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_member());
create policy attachments_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.is_member());
