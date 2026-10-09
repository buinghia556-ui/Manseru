-- Tài liệu đính kèm (PDF, Word, Excel, PowerPoint, hình, văn bản) cho công việc
-- và việc con. Máy chủ gửi file cho Claude đọc, rồi lưu bản tóm tắt và gợi ý.
--
-- Chạy file này trong SQL Editor của Supabase SAU file 20261005000000_init.sql.

create table public.task_files (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  subtask_id uuid references public.subtasks (id) on delete cascade,
  storage_path text not null unique,
  name text not null default '',
  mime text not null default '',
  size bigint not null default 0,
  author_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  -- Kết quả đọc file: pending (chưa đọc) → running (đang đọc) → done / failed.
  ai_status text not null default 'pending' check (ai_status in ('pending', 'running', 'done', 'failed')),
  ai_summary text not null default '',
  ai_points jsonb not null default '[]',
  ai_next_steps jsonb not null default '[]',
  ai_subtasks jsonb not null default '[]',
  ai_error text not null default '',
  ai_at timestamptz
);
create index task_files_task_idx on public.task_files (task_id, created_at);
create index task_files_subtask_idx on public.task_files (subtask_id);

alter table public.task_files enable row level security;
create policy task_files_read on public.task_files for select to authenticated using (public.is_member());
revoke insert, update, delete, truncate on public.task_files from anon, authenticated;

alter table public.task_logs drop constraint task_logs_kind_check;
alter table public.task_logs add constraint task_logs_kind_check
  check (kind in ('create', 'log', 'comment', 'status', 'edit', 'submit', 'recall', 'approve', 'reject', 'subtask', 'file'));

create function public._file_for_update(p_id uuid) returns public.task_files
language plpgsql security definer set search_path = public as $$
declare
  v public.task_files;
begin
  select * into v from public.task_files where id = p_id for update;
  if not found then
    raise exception 'Không tìm thấy tài liệu.' using errcode = 'P0002';
  end if;
  return v;
end $$;

-- Ghi nhận file đã tải lên kho. Đường dẫn phải nằm trong thư mục của công việc.
create function public.add_task_file(
  p_task uuid, p_subtask uuid, p_path text, p_name text, p_mime text default '', p_size bigint default 0
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  t public.tasks := public._task_for_update(p_task);
  v_name text := coalesce(nullif(trim(p_name), ''), 'tài liệu');
  v_id uuid;
begin
  if p_subtask is not null and not exists (select 1 from public.subtasks where id = p_subtask and task_id = t.id) then
    raise exception 'Việc con không thuộc công việc này.' using errcode = '22023';
  end if;
  if p_path is null or p_path not like t.id::text || '/files/%' then
    raise exception 'Đường dẫn tài liệu không hợp lệ.' using errcode = '22023';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'attachments' and name = p_path) then
    raise exception 'Không tìm thấy file đã tải lên.' using errcode = '22023';
  end if;
  insert into public.task_files (task_id, subtask_id, storage_path, name, mime, size, author_id)
  values (t.id, p_subtask, p_path, left(v_name, 200), coalesce(p_mime, ''), greatest(coalesce(p_size, 0), 0), v_me)
  returning id into v_id;
  if p_subtask is not null then
    perform public._sublog(p_subtask, 'attach', 'Thêm tài liệu: ' || v_name);
  else
    perform public._log(t.id, 'file', 'Thêm tài liệu: ' || v_name);
  end if;
  return v_id;
end $$;

-- Người tải file lên hoặc sếp mới cho Claude đọc (lại) file.
-- Trả về false nếu file đang được đọc, để không gọi Claude hai lần cùng lúc.
create function public.start_file_analysis(p_id uuid) returns boolean
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  f public.task_files := public._file_for_update(p_id);
begin
  if f.author_id <> v_me and not public.is_boss() then
    raise exception 'Chỉ người tải file lên hoặc sếp mới cho đọc lại được.' using errcode = '42501';
  end if;
  if f.ai_status = 'running' and f.ai_at > now() - interval '5 minutes' then
    return false;
  end if;
  update public.task_files set ai_status = 'running', ai_error = '', ai_at = now() where id = p_id;
  return true;
end $$;

create function public.save_file_analysis(
  p_id uuid, p_ok boolean, p_summary text default '', p_points jsonb default '[]',
  p_next_steps jsonb default '[]', p_subtasks jsonb default '[]', p_error text default ''
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  f public.task_files := public._file_for_update(p_id);
begin
  if f.author_id <> v_me and not public.is_boss() then
    raise exception 'Chỉ người tải file lên hoặc sếp mới cho đọc lại được.' using errcode = '42501';
  end if;
  if f.ai_status <> 'running' then
    raise exception 'Tài liệu không ở trạng thái đang đọc.' using errcode = '22023';
  end if;
  if p_ok then
    if jsonb_typeof(coalesce(p_points, '[]')) <> 'array' or jsonb_typeof(coalesce(p_next_steps, '[]')) <> 'array'
       or jsonb_typeof(coalesce(p_subtasks, '[]')) <> 'array' then
      raise exception 'Kết quả đọc file không hợp lệ.' using errcode = '22023';
    end if;
    update public.task_files
       set ai_status = 'done', ai_summary = coalesce(p_summary, ''), ai_points = coalesce(p_points, '[]'),
           ai_next_steps = coalesce(p_next_steps, '[]'), ai_subtasks = coalesce(p_subtasks, '[]'),
           ai_error = '', ai_at = now()
     where id = p_id;
  else
    update public.task_files set ai_status = 'failed', ai_error = coalesce(p_error, ''), ai_at = now() where id = p_id;
  end if;
end $$;

-- Xoá bản ghi tài liệu; trả về đường dẫn để máy chủ xoá file trong kho.
create function public.delete_task_file(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_me uuid := public._me();
  f public.task_files := public._file_for_update(p_id);
begin
  if f.author_id <> v_me and not public.is_boss() then
    raise exception 'Chỉ người tải file lên hoặc sếp mới xoá được.' using errcode = '42501';
  end if;
  delete from public.task_files where id = p_id;
  if f.subtask_id is not null and exists (select 1 from public.subtasks where id = f.subtask_id) then
    perform public._sublog(f.subtask_id, 'attach', 'Xoá tài liệu: ' || f.name);
  else
    perform public._log(f.task_id, 'file', 'Xoá tài liệu: ' || f.name);
  end if;
  return f.storage_path;
end $$;

revoke execute on function public._file_for_update(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Kho file: nhận thêm tài liệu văn phòng, tối đa 20 MB mỗi file.
-- ---------------------------------------------------------------------------

update storage.buckets
   set file_size_limit = 20971520,
       allowed_mime_types = array[
         'image/*',
         'application/pdf',
         'text/plain', 'text/csv', 'text/markdown', 'application/json',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
         'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
         'application/vnd.openxmlformats-officedocument.presentationml.presentation',
         'application/vnd.ms-excel'
       ]
 where id = 'attachments';

-- Chỉ xoá được file không còn bản ghi nào trỏ tới (tức là sau khi đã xoá qua app).
create policy attachments_delete_orphan on storage.objects for delete to authenticated
  using (
    bucket_id = 'attachments' and public.is_member()
    and not exists (select 1 from public.task_files f where f.storage_path = objects.name)
    and not exists (select 1 from public.subtask_attachments a where a.storage_path = objects.name)
  );
