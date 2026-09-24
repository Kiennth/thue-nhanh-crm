-- ---------------------------------------------------------------------
-- Module ĐÀO TẠO NỘI BỘ (CEO 2026-09-18) — kiểu ASTO (Apple Sales
-- Training Online): nhân viên học bài trong CRM rồi thi trắc nghiệm.
--
--   1. Khoá học → nhiều bài học (chữ + ảnh + video YouTube) + ngân hàng
--      câu hỏi. Mỗi lần thi rút NGẪU NHIÊN N câu, đảo thứ tự đáp án.
--   2. Quy tắc thi là CÀI ĐẶT THEO KHOÁ: điểm đạt (mặc định 80%), số câu
--      mỗi lần thi, giới hạn thời gian / số lần thi (trống = không giới
--      hạn), role nào bắt buộc học.
--   3. CHỐNG GIAN LẬN ở tầng DB — đây là module đầu tiên mà nhân viên
--      thường tự GHI dữ liệu của mình, nên:
--        - training_questions (có cờ đáp án đúng) CHỈ Giám đốc/Admin đọc
--          được. Người học chỉ nhận đề qua RPC đã bóc cờ đúng/sai.
--        - training_attempts KHÔNG có policy insert/update cho ai cả:
--          mở bài thi + nộp bài + chấm điểm đều đi qua 3 RPC SECURITY
--          DEFINER bên dưới (tự INSERT "đã đạt" qua REST là không thể).
--        - Bài đang làm dở người học cũng không SELECT được (snapshot có
--          cờ đáp án) — chỉ thấy lại sau khi đã nộp, để xem lại câu sai.
--        - Hết giờ tính theo đồng hồ DB (expires_at), không tin client.
--   4. Bài thi lưu SNAPSHOT đề + điểm đạt tại thời điểm thi — sửa/xoá
--      câu hỏi về sau không làm đổi lịch sử.
--
-- Soạn khoá + xem tiến độ: giam_doc/admin (TRAINING_MANAGE_ROLES bên
-- src/lib/roles.ts). Không gắn log_activity — nội dung bài học nặng,
-- không phải dữ liệu tài chính.
-- ---------------------------------------------------------------------

-- =============================== BẢNG ================================

create table if not exists public.training_courses (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  cover_image_url text,
  -- Role BẮT BUỘC học khoá này (rỗng = tự nguyện). Ai cũng học được mọi
  -- khoá đã publish; cờ này chỉ để đánh dấu "Bắt buộc" + bảng tiến độ.
  required_roles public.user_role[] not null default '{}',
  pass_percent integer not null default 80 check (pass_percent between 1 and 100),
  -- Ngân hàng ít câu hơn số này thì thi hết cả ngân hàng.
  questions_per_attempt integer not null default 10 check (questions_per_attempt between 1 and 100),
  -- null = không giới hạn.
  time_limit_minutes integer check (time_limit_minutes between 1 and 600),
  max_attempts integer check (max_attempts between 1 and 100),
  is_published boolean not null default false,
  sort_order integer not null default 0,
  created_by uuid references public.employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger training_courses_set_updated_at
  before update on public.training_courses
  for each row execute function public.set_updated_at();

create table if not exists public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  title text not null,
  -- Tài liệu TipTap dạng JSON (không lưu HTML): CRM render bằng React
  -- theo danh sách node cho phép nên không cần dangerouslySetInnerHTML.
  content_json jsonb not null default '{"type":"doc","content":[]}'::jsonb,
  -- Link YouTube (nên để chế độ "Không công khai") — nhúng đầu bài học.
  video_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger training_lessons_set_updated_at
  before update on public.training_lessons
  for each row execute function public.set_updated_at();

create index if not exists training_lessons_course_idx
  on public.training_lessons (course_id, sort_order);

create table if not exists public.training_questions (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  question_text text not null,
  -- Mảng [{ "id": "a", "text": "...", "correct": true|false }] — 2..6 đáp
  -- án, ≥1 đúng. Nhiều hơn 1 đáp án đúng = câu "chọn tất cả đáp án đúng"
  -- (phải chọn ĐÚNG VÀ ĐỦ mới tính điểm). Validate ở actions/training.ts.
  options jsonb not null,
  -- Giải thích hiện khi xem lại bài đã nộp.
  explanation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger training_questions_set_updated_at
  before update on public.training_questions
  for each row execute function public.set_updated_at();

create index if not exists training_questions_course_idx
  on public.training_questions (course_id);

-- Đánh dấu "đã học xong" từng bài — phải xong hết bài mới được mở thi.
create table if not exists public.training_lesson_completions (
  employee_id uuid not null references public.employees(id) on delete cascade,
  lesson_id uuid not null references public.training_lessons(id) on delete cascade,
  completed_at timestamptz not null default now(),
  primary key (employee_id, lesson_id)
);

create table if not exists public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  course_id uuid not null references public.training_courses(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  started_at timestamptz not null default now(),
  -- null = không giới hạn giờ.
  expires_at timestamptz,
  submitted_at timestamptz,
  -- Đề của RIÊNG lần thi này, đã rút ngẫu nhiên + đảo đáp án, CÒN cờ
  -- correct: [{id, text, explanation, options:[{id,text,correct}]}].
  snapshot jsonb not null,
  -- { "<question_id>": ["<option_id>", ...] }
  answers jsonb,
  total_count integer not null,
  correct_count integer,
  score_percent integer,
  -- Điểm đạt chụp lại lúc mở bài — đổi cài đặt khoá không đổi kết quả cũ.
  pass_percent integer not null,
  passed boolean
);

create index if not exists training_attempts_employee_idx
  on public.training_attempts (employee_id, course_id);
-- Mỗi người mỗi khoá chỉ 1 bài đang làm dở (chặn bấm đúp mở 2 bài).
create unique index if not exists training_attempts_one_open_idx
  on public.training_attempts (course_id, employee_id) where submitted_at is null;

-- ================================ RLS ================================
-- Helper bọc (select ...) để thành InitPlan — xem 20260801020000.

alter table public.training_courses enable row level security;
alter table public.training_lessons enable row level security;
alter table public.training_questions enable row level security;
alter table public.training_lesson_completions enable row level security;
alter table public.training_attempts enable row level security;

create policy "training_courses_select" on public.training_courses
  for select to authenticated using (
    (is_published and (select public.is_employee()))
    or (select public.auth_role()) in ('giam_doc', 'admin')
  );
create policy "training_courses_insert_manage" on public.training_courses
  for insert to authenticated with check ((select public.auth_role()) in ('giam_doc', 'admin'));
create policy "training_courses_update_manage" on public.training_courses
  for update to authenticated
  using ((select public.auth_role()) in ('giam_doc', 'admin'))
  with check ((select public.auth_role()) in ('giam_doc', 'admin'));
create policy "training_courses_delete_manage" on public.training_courses
  for delete to authenticated using ((select public.auth_role()) in ('giam_doc', 'admin'));

-- Bài học: thấy khi khoá đã publish (subquery chạy dưới RLS của
-- training_courses nên tự khớp điều kiện trên).
create policy "training_lessons_select" on public.training_lessons
  for select to authenticated using (
    exists (select 1 from public.training_courses c where c.id = training_lessons.course_id)
  );
create policy "training_lessons_insert_manage" on public.training_lessons
  for insert to authenticated with check ((select public.auth_role()) in ('giam_doc', 'admin'));
create policy "training_lessons_update_manage" on public.training_lessons
  for update to authenticated
  using ((select public.auth_role()) in ('giam_doc', 'admin'))
  with check ((select public.auth_role()) in ('giam_doc', 'admin'));
create policy "training_lessons_delete_manage" on public.training_lessons
  for delete to authenticated using ((select public.auth_role()) in ('giam_doc', 'admin'));

-- Câu hỏi: CHỈ người soạn — có cờ đáp án đúng.
create policy "training_questions_all_manage" on public.training_questions
  for all to authenticated
  using ((select public.auth_role()) in ('giam_doc', 'admin'))
  with check ((select public.auth_role()) in ('giam_doc', 'admin'));

-- Đánh dấu đã học: tự ghi/xoá dòng của chính mình; người soạn xem tất cả.
create policy "training_lesson_completions_select" on public.training_lesson_completions
  for select to authenticated using (
    employee_id = (select public.auth_employee_id())
    or (select public.auth_role()) in ('giam_doc', 'admin')
  );
create policy "training_lesson_completions_insert_own" on public.training_lesson_completions
  for insert to authenticated with check (employee_id = (select public.auth_employee_id()));
create policy "training_lesson_completions_delete_own" on public.training_lesson_completions
  for delete to authenticated using (employee_id = (select public.auth_employee_id()));

-- Bài thi: người học chỉ thấy bài ĐÃ NỘP của mình; KHÔNG có policy
-- insert/update — chỉ RPC ghi. Người soạn xem tất cả + xoá (trả lại lượt
-- thi khi khoá có giới hạn số lần).
create policy "training_attempts_select" on public.training_attempts
  for select to authenticated using (
    (employee_id = (select public.auth_employee_id()) and submitted_at is not null)
    or (select public.auth_role()) in ('giam_doc', 'admin')
  );
create policy "training_attempts_delete_manage" on public.training_attempts
  for delete to authenticated using ((select public.auth_role()) in ('giam_doc', 'admin'));

-- ================================ RPC ================================

-- Chấm 1 bài theo snapshot. p_answers null/không hợp lệ = bỏ trống hết.
create or replace function public.training_grade_attempt(
  p_attempt_id uuid,
  p_answers jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.training_attempts%rowtype;
  v_answers jsonb := case when jsonb_typeof(p_answers) = 'object' then p_answers else '{}'::jsonb end;
  v_q jsonb;
  v_picked jsonb;
  v_correct_ids text[];
  v_selected_ids text[];
  v_correct integer := 0;
  v_percent integer;
begin
  select * into v_attempt from public.training_attempts where id = p_attempt_id for update;

  for v_q in select * from jsonb_array_elements(v_attempt.snapshot) loop
    v_picked := v_answers -> (v_q ->> 'id');
    select coalesce(array_agg(o ->> 'id' order by o ->> 'id'), '{}') into v_correct_ids
      from jsonb_array_elements(v_q -> 'options') o
      where (o ->> 'correct')::boolean;
    if jsonb_typeof(v_picked) = 'array' then
      select coalesce(array_agg(distinct x order by x), '{}') into v_selected_ids
        from jsonb_array_elements_text(v_picked) x;
    else
      v_selected_ids := '{}';
    end if;
    -- Câu nhiều đáp án đúng: phải chọn đúng VÀ đủ.
    if v_selected_ids = v_correct_ids then
      v_correct := v_correct + 1;
    end if;
  end loop;

  v_percent := floor(v_correct * 100.0 / greatest(v_attempt.total_count, 1));
  update public.training_attempts
    set submitted_at = now(),
        answers = v_answers,
        correct_count = v_correct,
        score_percent = v_percent,
        -- So bằng phép nhân để 8/10 với điểm đạt 80% không trượt vì làm tròn.
        passed = (v_correct * 100 >= v_attempt.pass_percent * v_attempt.total_count)
    where id = p_attempt_id;
end;
$$;

-- Mở bài thi (hoặc trả lại bài đang làm dở). Trả id bài thi.
create or replace function public.training_start_attempt(p_course_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_emp uuid := public.auth_employee_id();
  v_course public.training_courses%rowtype;
  v_attempt_id uuid;
  v_expired uuid;
  v_lessons integer;
  v_done integer;
  v_used integer;
  v_snapshot jsonb;
begin
  if v_emp is null then
    raise exception 'not_employee';
  end if;

  select * into v_course from public.training_courses where id = p_course_id;
  if not found or (not v_course.is_published and public.auth_role() not in ('giam_doc', 'admin')) then
    raise exception 'course_not_found';
  end if;

  -- Bài cũ bỏ dở quá giờ → chấm 0 điểm (tính 1 lượt) rồi mới mở bài mới.
  for v_expired in
    select id from public.training_attempts
    where course_id = p_course_id and employee_id = v_emp
      and submitted_at is null and expires_at is not null and expires_at < now()
  loop
    perform public.training_grade_attempt(v_expired, null);
  end loop;

  select id into v_attempt_id from public.training_attempts
    where course_id = p_course_id and employee_id = v_emp and submitted_at is null;
  if found then
    return v_attempt_id;
  end if;

  select count(*) into v_lessons from public.training_lessons where course_id = p_course_id;
  select count(*) into v_done
    from public.training_lesson_completions lc
    join public.training_lessons l on l.id = lc.lesson_id
    where l.course_id = p_course_id and lc.employee_id = v_emp;
  if v_done < v_lessons then
    raise exception 'lessons_incomplete';
  end if;

  if v_course.max_attempts is not null then
    select count(*) into v_used from public.training_attempts
      where course_id = p_course_id and employee_id = v_emp;
    if v_used >= v_course.max_attempts then
      raise exception 'max_attempts_reached';
    end if;
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'id', q.id,
      'text', q.question_text,
      'explanation', q.explanation,
      'options', (select jsonb_agg(o order by random()) from jsonb_array_elements(q.options) o)
    )
  ) into v_snapshot
  from (
    select * from public.training_questions
    where course_id = p_course_id
    order by random()
    limit v_course.questions_per_attempt
  ) q;
  if v_snapshot is null then
    raise exception 'no_questions';
  end if;

  insert into public.training_attempts
    (course_id, employee_id, expires_at, snapshot, total_count, pass_percent)
  values (
    p_course_id,
    v_emp,
    case when v_course.time_limit_minutes is not null
      then now() + make_interval(mins => v_course.time_limit_minutes) end,
    v_snapshot,
    jsonb_array_length(v_snapshot),
    v_course.pass_percent
  )
  returning id into v_attempt_id;
  return v_attempt_id;
end;
$$;

-- Đề của bài đang làm dở, ĐÃ BÓC cờ correct + giải thích. null = không
-- có bài nào đang mở. seconds_left tính theo đồng hồ DB.
create or replace function public.training_active_attempt(p_course_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', a.id,
    'total_count', a.total_count,
    'pass_percent', a.pass_percent,
    'seconds_left', case when a.expires_at is not null
      then greatest(0, floor(extract(epoch from a.expires_at - now())))::integer end,
    'questions', (
      select jsonb_agg(
        jsonb_build_object(
          'id', q ->> 'id',
          'text', q ->> 'text',
          'multi', (select count(*) from jsonb_array_elements(q -> 'options') o where (o ->> 'correct')::boolean) > 1,
          'options', (
            select jsonb_agg(jsonb_build_object('id', o ->> 'id', 'text', o ->> 'text') order by ord)
            from jsonb_array_elements(q -> 'options') with ordinality as t(o, ord)
          )
        ) order by qord
      )
      from jsonb_array_elements(a.snapshot) with ordinality as s(q, qord)
    )
  )
  from public.training_attempts a
  where a.course_id = p_course_id
    and a.employee_id = public.auth_employee_id()
    and a.submitted_at is null
  limit 1;
$$;

-- Nộp bài. Quá giờ hơn 60 giây (ân hạn cho mạng chậm lúc tự nộp khi hết
-- giờ) thì coi như bỏ trống hết — client sửa đồng hồ cũng vô ích.
create or replace function public.training_submit_attempt(
  p_attempt_id uuid,
  p_answers jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_attempt public.training_attempts%rowtype;
begin
  select * into v_attempt from public.training_attempts
    where id = p_attempt_id and employee_id = public.auth_employee_id();
  if not found then
    raise exception 'attempt_not_found';
  end if;
  if v_attempt.submitted_at is not null then
    raise exception 'already_submitted';
  end if;
  if pg_column_size(p_answers) > 100000 then
    raise exception 'answers_too_large';
  end if;

  if v_attempt.expires_at is not null and now() > v_attempt.expires_at + interval '60 seconds' then
    perform public.training_grade_attempt(p_attempt_id, null);
  else
    perform public.training_grade_attempt(p_attempt_id, p_answers);
  end if;
end;
$$;

-- Hàm chấm là nội bộ (nhận id bất kỳ) — không ai được gọi thẳng.
revoke all on function public.training_grade_attempt(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.training_start_attempt(uuid) from public, anon;
revoke all on function public.training_active_attempt(uuid) from public, anon;
revoke all on function public.training_submit_attempt(uuid, jsonb) from public, anon;
grant execute on function public.training_start_attempt(uuid) to authenticated;
grant execute on function public.training_active_attempt(uuid) to authenticated;
grant execute on function public.training_submit_attempt(uuid, jsonb) to authenticated;

-- ============================== STORAGE ==============================
-- Ảnh bài học dùng chung bucket public equipment-images, thư mục
-- training/ — upload qua admin client trong actions/training.ts (cùng
-- cách với ảnh website), không cần policy storage mới.
