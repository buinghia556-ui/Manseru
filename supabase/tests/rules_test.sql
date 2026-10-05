-- Kiểm tra luật phân quyền. Chạy qua scripts/test-db.sh.
-- A: người đăng ký đầu tiên (quản trị), B: sếp, C: nhân viên, D: người lạ chưa kích hoạt.

create schema tests;
grant usage on schema tests to authenticated;

create function tests.expect_error(p_sql text, p_needle text) returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    if position(p_needle in sqlerrm) = 0 then
      raise exception 'Sai lỗi cho [%]: mong "%" nhưng nhận "%"', p_sql, p_needle, sqlerrm;
    end if;
    return;
  end;
  raise exception 'Lẽ ra phải lỗi nhưng không: %', p_sql;
end $$;

create function tests.ok(p boolean, p_msg text) returns void language plpgsql as $$
begin
  if p is distinct from true then
    raise exception 'Kiểm tra thất bại: %', p_msg;
  end if;
end $$;
grant execute on all functions in schema tests to authenticated;

insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'a@vd.vn', '{"full_name":"Anh A"}'),
  ('00000000-0000-0000-0000-00000000000b', 'b@vd.vn', '{"full_name":"Sếp B"}'),
  ('00000000-0000-0000-0000-00000000000c', 'c@vd.vn', '{}'),
  ('00000000-0000-0000-0000-00000000000d', 'd@vd.vn', '{}');

select tests.ok((select is_admin and active from public.profiles where email = 'a@vd.vn'), 'người đầu tiên là quản trị');
select tests.ok((select not is_admin and not active from public.profiles where email = 'b@vd.vn'), 'người sau chờ kích hoạt');
select tests.ok((select full_name = 'c' from public.profiles where email = 'c@vd.vn'), 'tên mặc định lấy từ email');

set role authenticated;

-- Người lạ chưa kích hoạt: không thấy gì, không làm được gì.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000d';
select tests.expect_error($$select public.create_task('x')$$, 'chưa được kích hoạt');
select tests.expect_error($$select public.set_member('00000000-0000-0000-0000-00000000000d', 'boss', true)$$, 'Chỉ quản trị');
select tests.ok((select count(*) = 1 from public.profiles), 'người chưa kích hoạt chỉ thấy hồ sơ của mình');
select tests.expect_error($$select public._me()$$, 'permission denied');

-- Quản trị kích hoạt B làm sếp, C làm nhân viên.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.set_member('00000000-0000-0000-0000-00000000000b', 'boss', true);
select public.set_member('00000000-0000-0000-0000-00000000000c', 'employee', true);
select tests.expect_error($$select public.set_member('00000000-0000-0000-0000-00000000000a', 'employee', false)$$, 'tự khoá');

-- Ghi thẳng vào bảng bị chặn, kể cả với sếp.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select tests.expect_error($$insert into public.tasks (title, created_by) values ('x', auth.uid())$$, 'permission denied');
select tests.expect_error($$update public.profiles set role = 'boss'$$, 'permission denied');

-- Nhân viên C tạo việc, ghi nhật ký, gửi duyệt.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select tests.expect_error($$update public.profiles set role = 'boss' where id = auth.uid()$$, 'permission denied');
select tests.expect_error($$update public.tasks set status = 'approved'$$, 'permission denied');
select tests.expect_error($$select public.create_task('   ')$$, 'không được để trống');
create temp table ids (k text primary key, v uuid);
grant all on ids to authenticated;
insert into ids select 't1', public.create_task('Báo giá Minh Phát', 'in 2 màu', 'high', null, '2026-10-10');
select public.add_task_log((select v from ids where k = 't1'), 'Gọi khách', 1.5);
select tests.ok((select status = 'doing' from public.tasks where id = (select v from ids where k = 't1')), 'ghi nhật ký chuyển Cần làm sang Đang làm');
select tests.expect_error($$select public.review_task((select v from ids where k = 't1'), true, '')$$, 'Chỉ sếp');
select public.submit_task((select v from ids where k = 't1'), 'Nhờ sếp xem');
select tests.expect_error($$select public.review_task((select v from ids where k = 't1'), true, '')$$, 'Chỉ sếp');
select tests.expect_error($$select public.edit_task((select v from ids where k = 't1'), 'Đổi tên', '', 'high', null)$$, 'Chỉ người tạo');

-- Sếp B: trả về phải có lý do, rồi duyệt.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select tests.expect_error($$select public.submit_task((select v from ids where k = 't1'))$$, 'Chỉ người tạo');
select tests.expect_error($$select public.review_task((select v from ids where k = 't1'), false, '  ')$$, 'Ghi lý do');
select public.review_task((select v from ids where k = 't1'), false, 'Thiếu phí khuôn bế');
select tests.ok((select status = 'returned' and review_note = 'Thiếu phí khuôn bế' from public.tasks where id = (select v from ids where k = 't1')), 'trả về lưu lý do');
select public.add_task_log((select v from ids where k = 't1'), 'Nhớ cộng phí khuôn');
select tests.ok((select kind = 'comment' from public.task_logs where body = 'Nhớ cộng phí khuôn'), 'sếp ghi vào việc người khác là nhận xét');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select public.submit_task((select v from ids where k = 't1'), 'Đã thêm phí');
select public.recall_task((select v from ids where k = 't1'));
select public.submit_task((select v from ids where k = 't1'), 'Gửi lại');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.review_task((select v from ids where k = 't1'), true, 'Ổn');
select tests.ok((select status = 'approved' and review_by = auth.uid() from public.tasks where id = (select v from ids where k = 't1')), 'sếp duyệt');
select tests.expect_error($$select public.review_task((select v from ids where k = 't1'), true, '')$$, 'không ở trạng thái Chờ duyệt');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select tests.expect_error($$select public.delete_task((select v from ids where k = 't1'))$$, 'Chỉ người tạo');
select tests.expect_error($$select public.set_task_day((select v from ids where k = 't1'), '2026-10-06')$$, 'đã duyệt');
select tests.ok((select array_agg(kind order by created_at, kind) @> array['create','log','submit','reject','approve','recall'] from public.task_logs where task_id = (select v from ids where k = 't1')), 'lịch sử đủ các bước');

-- Việc con: sửa của nhân viên phải chờ sếp duyệt.
insert into ids select 't2', public.create_task('Tồn kho tháng 10');
insert into ids select 's1', public.add_subtask((select v from ids where k = 't2'), 'Đếm kho A', '', '2026-10-07T10:00:00+07', '00000000-0000-0000-0000-00000000000b', '00000000-0000-0000-0000-00000000000c');
select tests.expect_error($$select public.add_subtask((select v from ids where k = 't2'), 'x', '', null, null, '00000000-0000-0000-0000-00000000000d')$$, 'không phải thành viên');
select public.set_subtask_status((select v from ids where k = 's1'), 'doing');
select public.add_subtask_log((select v from ids where k = 's1'), 'Đếm xong kệ 1', 2);
select public.add_subtask_link((select v from ids where k = 's1'), 'https://docs.google.com/x', 'Bảng đếm');
select tests.expect_error($$select public.add_subtask_link((select v from ids where k = 's1'), 'javascript:alert(1)', '')$$, 'Link chưa đúng');
select tests.expect_error($$select public.add_subtask_image((select v from ids where k = 's1'), 'khac/anh.png', '')$$, 'không hợp lệ');
select tests.expect_error($$select public.add_subtask_image((select v from ids where k = 's1'), (select v from ids where k = 's1')::text || '/anh.png', '')$$, 'Không tìm thấy hình');
insert into storage.objects (bucket_id, name) values ('attachments', (select v from ids where k = 's1')::text || '/anh.png');
select public.add_subtask_image((select v from ids where k = 's1'), (select v from ids where k = 's1')::text || '/anh.png', 'anh.png');

select tests.expect_error($$select public.request_subtask_edit((select v from ids where k = 's1'), '{"title":"Đếm kho A"}')$$, 'Không có gì thay đổi');
select tests.expect_error($$select public.request_subtask_edit((select v from ids where k = 's1'), '{"created_by":"x"}')$$, 'Không sửa được');
select tests.expect_error($$select public.request_subtask_edit((select v from ids where k = 's1'), '{"due":"2026-10-07T03:00:00Z"}')$$, 'Không có gì thay đổi');
select tests.ok(public.request_subtask_edit((select v from ids where k = 's1'), '{"title":"Đếm kho A và B","due":"2026-10-08T10:00:00+07"}') = 'requested', 'nhân viên tạo đề xuất');
select tests.ok((select title = 'Đếm kho A' from public.subtasks where id = (select v from ids where k = 's1')), 'nội dung cũ giữ nguyên khi chờ duyệt');
select tests.expect_error($$select public.request_subtask_edit((select v from ids where k = 's1'), '{"description":"x"}')$$, 'đang chờ sếp duyệt');
select tests.expect_error($$select public.decide_subtask_edit((select id from public.subtask_edit_requests where status = 'pending'), true, '')$$, 'Chỉ sếp');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select tests.expect_error($$select public.cancel_subtask_edit((select id from public.subtask_edit_requests where status = 'pending'))$$, 'Chỉ người đề xuất');
select public.decide_subtask_edit((select id from public.subtask_edit_requests where status = 'pending'), true, '');
select tests.ok((select title = 'Đếm kho A và B' and due = '2026-10-08T10:00:00+07' from public.subtasks where id = (select v from ids where k = 's1')), 'duyệt thì áp dụng thay đổi');
select tests.ok(public.request_subtask_edit((select v from ids where k = 's1'), '{"assignee_id":""}') = 'applied', 'sếp sửa áp dụng ngay');
select tests.ok((select assignee_id is null from public.subtasks where id = (select v from ids where k = 's1')), 'sếp bỏ người phụ trách');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select public.request_subtask_edit((select v from ids where k = 's1'), '{"description":"Nhờ thêm người"}');
select public.cancel_subtask_edit((select id from public.subtask_edit_requests where status = 'pending'));
select public.request_subtask_edit((select v from ids where k = 's1'), '{"description":"Nhờ thêm người"}');

set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000b';
select public.decide_subtask_edit((select id from public.subtask_edit_requests where status = 'pending'), false, 'Tự làm nhé');
select tests.ok((select description = '' from public.subtasks where id = (select v from ids where k = 's1')), 'từ chối thì không đổi');
select tests.ok((select array_agg(kind order by created_at, kind) @> array['create','status','log','attach','editreq','editok','edit','editno'] from public.subtask_history where subtask_id = (select v from ids where k = 's1')), 'lịch sử việc con đủ các bước');

-- Xoá việc con: chỉ người tạo hoặc sếp.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select tests.expect_error($$select public.delete_subtask((select v from ids where k = 's1'))$$, 'Chỉ người tạo');
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select public.delete_subtask((select v from ids where k = 's1'));
select tests.ok((select count(*) = 0 from public.subtask_attachments), 'xoá việc con xoá luôn đính kèm');

-- Người bị khoá mất quyền ngay.
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
select public.set_member('00000000-0000-0000-0000-00000000000c', 'employee', false);
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000c';
select tests.ok((select count(*) = 0 from public.tasks), 'người bị khoá không thấy việc');
select tests.expect_error($$select public.create_task('x')$$, 'chưa được kích hoạt');

reset role;
