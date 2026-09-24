"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentEmployee, requireRole } from "@/lib/dal";
import { ALL_ROLES, TRAINING_MANAGE_ROLES } from "@/lib/roles";
import { validateTrainingDoc, youtubeEmbedUrl } from "@/lib/training";
import type { TrainingDocNode, TrainingOption, UserRole } from "@/types/database";

// Module đào tạo nội bộ (CEO 2026-09-18) — bảng training_*. Soạn khoá chỉ
// TRAINING_MANAGE_ROLES (RLS gác thật, requireRole là lớp chặn sớm). Phần
// thi KHÔNG ghi thẳng bảng: mở bài/nộp bài/chấm đi qua RPC SECURITY DEFINER
// (migration 20260920000000) để người học không tự sửa điểm qua REST.

export type ActionState = { error: string } | { success: true; id?: string } | undefined;

// Cả cây /training (danh sách, chi tiết, soạn, tiến độ) cùng đọc chung dữ
// liệu — làm mới nguyên cụm cho khỏi sót trang.
function revalidateTraining() {
  revalidatePath("/training", "layout");
}

// =========================== SOẠN KHOÁ HỌC ===========================

const optionalInt = (min: number, max: number) =>
  z.union([z.literal("").transform(() => null), z.coerce.number().int().min(min).max(max)]);

const CourseSchema = z.object({
  title: z.string().trim().min(1, { message: "Tên khoá học không được trống." }).max(200),
  description: z.string().trim().max(1000).optional(),
  required_roles: z.array(z.enum(ALL_ROLES as [UserRole, ...UserRole[]])),
  pass_percent: z.coerce.number().int().min(1, { message: "Điểm đạt từ 1 đến 100%." }).max(100),
  questions_per_attempt: z.coerce.number().int().min(1, { message: "Mỗi lần thi tối thiểu 1 câu." }).max(100),
  // Trống = không giới hạn.
  time_limit_minutes: optionalInt(1, 600),
  max_attempts: optionalInt(1, 100),
  sort_order: z.coerce.number().int().min(0).default(0),
});

export async function upsertTrainingCourse(
  id: string | null,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const employee = await requireRole([...TRAINING_MANAGE_ROLES]);

  const parsed = CourseSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description") || undefined,
    required_roles: formData.getAll("required_roles"),
    pass_percent: formData.get("pass_percent") ?? 80,
    questions_per_attempt: formData.get("questions_per_attempt") ?? 10,
    time_limit_minutes: formData.get("time_limit_minutes") ?? "",
    max_attempts: formData.get("max_attempts") ?? "",
    sort_order: formData.get("sort_order") || 0,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const values = {
    title: parsed.data.title,
    description: parsed.data.description ?? null,
    required_roles: parsed.data.required_roles,
    pass_percent: parsed.data.pass_percent,
    questions_per_attempt: parsed.data.questions_per_attempt,
    time_limit_minutes: parsed.data.time_limit_minutes,
    max_attempts: parsed.data.max_attempts,
    sort_order: parsed.data.sort_order,
  };

  const supabase = await createClient();
  if (id) {
    const { error } = await supabase.from("training_courses").update(values).eq("id", id);
    if (error) return { error: "Không lưu được khoá học: " + error.message };
    revalidateTraining();
    return { success: true, id };
  }

  const { data, error } = await supabase
    .from("training_courses")
    .insert({ ...values, created_by: employee.id })
    .select("id")
    .single();
  if (error || !data) return { error: "Không tạo được khoá học: " + (error?.message ?? "") };
  revalidateTraining();
  return { success: true, id: data.id };
}

export async function toggleTrainingCoursePublished(id: string): Promise<ActionState> {
  await requireRole([...TRAINING_MANAGE_ROLES]);
  const supabase = await createClient();
  const { data: course } = await supabase
    .from("training_courses")
    .select("is_published")
    .eq("id", id)
    .maybeSingle();
  if (!course) return { error: "Không tìm thấy khoá học." };

  // Mở cho nhân viên học thì phải thi được — chặn publish khoá chưa có câu hỏi.
  if (!course.is_published) {
    const { count } = await supabase
      .from("training_questions")
      .select("id", { count: "exact", head: true })
      .eq("course_id", id);
    if (!count) return { error: "Khoá học chưa có câu hỏi thi — thêm ít nhất 1 câu rồi mới mở." };
  }

  const { error } = await supabase
    .from("training_courses")
    .update({ is_published: !course.is_published })
    .eq("id", id);
  if (error) return { error: "Không đổi được trạng thái: " + error.message };
  revalidateTraining();
  return { success: true };
}

// Trả void + throw khi lỗi — khớp chữ ký ConfirmDeleteButton.
export async function deleteTrainingCourse(id: string): Promise<void> {
  await requireRole([...TRAINING_MANAGE_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("training_courses").delete().eq("id", id);
  if (error) throw new Error("Không xoá được khoá học: " + error.message);
  revalidateTraining();
}

// ============================== BÀI HỌC ==============================

const LessonSchema = z.object({
  title: z.string().trim().min(1, { message: "Tên bài học không được trống." }).max(200),
  video_url: z.string().trim().max(500).optional(),
  sort_order: z.coerce.number().int().min(0).default(0),
  // JSON string từ LessonEditor (TipTap getJSON) — soát node/mark/ảnh/link
  // bằng validateTrainingDoc trước khi lưu.
  content_json: z
    .string()
    .max(500_000, { message: "Nội dung bài học quá dài." })
    .transform((s, ctx) => {
      try {
        const doc = JSON.parse(s) as unknown;
        const problem = validateTrainingDoc(doc);
        if (problem) {
          ctx.addIssue({ code: "custom", message: problem });
          return z.NEVER;
        }
        return doc as TrainingDocNode;
      } catch {
        ctx.addIssue({ code: "custom", message: "Nội dung bài học không hợp lệ." });
        return z.NEVER;
      }
    }),
});

export async function upsertTrainingLesson(
  courseId: string,
  lessonId: string | null,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...TRAINING_MANAGE_ROLES]);

  const parsed = LessonSchema.safeParse({
    title: formData.get("title"),
    video_url: formData.get("video_url") || undefined,
    sort_order: formData.get("sort_order") || 0,
    content_json: formData.get("content_json") || '{"type":"doc","content":[]}',
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }
  if (parsed.data.video_url && !youtubeEmbedUrl(parsed.data.video_url)) {
    return { error: "Link video phải là link YouTube (youtube.com/watch?v=... hoặc youtu.be/...)." };
  }

  const values = {
    title: parsed.data.title,
    video_url: parsed.data.video_url ?? null,
    sort_order: parsed.data.sort_order,
    content_json: parsed.data.content_json,
  };
  const supabase = await createClient();
  const { error } = lessonId
    ? await supabase.from("training_lessons").update(values).eq("id", lessonId)
    : await supabase.from("training_lessons").insert({ ...values, course_id: courseId });
  if (error) return { error: "Không lưu được bài học: " + error.message };

  revalidateTraining();
  return { success: true };
}

export async function deleteTrainingLesson(id: string): Promise<void> {
  await requireRole([...TRAINING_MANAGE_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("training_lessons").delete().eq("id", id);
  if (error) throw new Error("Không xoá được bài học: " + error.message);
  revalidateTraining();
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

// Upload 1 ảnh chèn vào bài học — trả URL cho LessonEditor. Dùng ADMIN
// client cho storage cùng lý do với uploadWebsiteProductImage: policy bucket
// cũ không gồm Giám đốc, requireRole ở đây mới là lớp gác thật.
export async function uploadTrainingImage(
  formData: FormData,
): Promise<{ url: string } | { error: string }> {
  await requireRole([...TRAINING_MANAGE_ROLES]);

  const file = formData.get("image");
  if (!(file instanceof File) || file.size === 0) return { error: "Chưa chọn ảnh." };
  if (file.size > MAX_IMAGE_BYTES) return { error: "Ảnh không được vượt quá 5MB." };
  if (!file.type.startsWith("image/")) return { error: "File không phải ảnh." };

  const rawExt = (file.name.includes(".") ? file.name.split(".").pop() : "jpg") ?? "jpg";
  const ext = /^[a-z0-9]{1,5}$/i.test(rawExt) ? rawExt.toLowerCase() : "jpg";
  const path = `training/${crypto.randomUUID()}.${ext}`;
  const admin = createAdminClient();
  const { error } = await admin.storage
    .from("equipment-images")
    .upload(path, file, { contentType: file.type || undefined });
  if (error) return { error: "Không tải được ảnh lên: " + error.message };

  return { url: admin.storage.from("equipment-images").getPublicUrl(path).data.publicUrl };
}

// ============================ CÂU HỎI THI ============================

const QuestionSchema = z.object({
  question_text: z.string().trim().min(1, { message: "Câu hỏi không được trống." }).max(2000),
  explanation: z.string().trim().max(2000).optional(),
  // JSON string từ QuestionDialog: [{ text, correct }] — id đáp án do server
  // cấp lại (a, b, c...) nên client không chèn được id trùng/lạ.
  options_json: z.string().transform((s, ctx) => {
    try {
      const arr = JSON.parse(s) as unknown;
      if (!Array.isArray(arr)) throw new Error();
      const options: TrainingOption[] = arr
        .map((o) => ({
          text: typeof o?.text === "string" ? o.text.trim() : "",
          correct: o?.correct === true,
        }))
        .filter((o) => o.text)
        .map((o, i) => ({ id: String.fromCharCode(97 + i), ...o }));
      if (options.length < 2 || options.length > 6) {
        ctx.addIssue({ code: "custom", message: "Mỗi câu cần từ 2 đến 6 đáp án." });
        return z.NEVER;
      }
      if (options.some((o) => o.text.length > 500)) {
        ctx.addIssue({ code: "custom", message: "Đáp án tối đa 500 ký tự." });
        return z.NEVER;
      }
      if (!options.some((o) => o.correct)) {
        ctx.addIssue({ code: "custom", message: "Chưa đánh dấu đáp án đúng." });
        return z.NEVER;
      }
      return options;
    } catch {
      ctx.addIssue({ code: "custom", message: "Danh sách đáp án không hợp lệ." });
      return z.NEVER;
    }
  }),
});

export async function upsertTrainingQuestion(
  courseId: string,
  questionId: string | null,
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  await requireRole([...TRAINING_MANAGE_ROLES]);

  const parsed = QuestionSchema.safeParse({
    question_text: formData.get("question_text"),
    explanation: formData.get("explanation") || undefined,
    options_json: formData.get("options_json") ?? "[]",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ." };
  }

  const values = {
    question_text: parsed.data.question_text,
    explanation: parsed.data.explanation ?? null,
    options: parsed.data.options_json,
  };
  const supabase = await createClient();
  const { error } = questionId
    ? await supabase.from("training_questions").update(values).eq("id", questionId)
    : await supabase.from("training_questions").insert({ ...values, course_id: courseId });
  if (error) return { error: "Không lưu được câu hỏi: " + error.message };

  revalidateTraining();
  return { success: true };
}

export async function deleteTrainingQuestion(id: string): Promise<void> {
  await requireRole([...TRAINING_MANAGE_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("training_questions").delete().eq("id", id);
  if (error) throw new Error("Không xoá được câu hỏi: " + error.message);
  revalidateTraining();
}

// Xoá 1 lần thi — trả lại lượt cho nhân viên khi khoá giới hạn số lần thi.
export async function deleteTrainingAttempt(id: string): Promise<void> {
  await requireRole([...TRAINING_MANAGE_ROLES]);
  const supabase = await createClient();
  const { error } = await supabase.from("training_attempts").delete().eq("id", id);
  if (error) throw new Error("Không xoá được lần thi: " + error.message);
  revalidateTraining();
}

// ============================ HỌC VÀ THI =============================

// Đánh dấu đã học xong 1 bài (của chính mình — RLS chặn ghi hộ người khác).
export async function completeTrainingLesson(lessonId: string): Promise<ActionState> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "Phiên đăng nhập đã hết — tải lại trang." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("training_lesson_completions")
    .upsert(
      { employee_id: employee.id, lesson_id: lessonId },
      { onConflict: "employee_id,lesson_id", ignoreDuplicates: true },
    );
  if (error) return { error: "Không đánh dấu được: " + error.message };
  revalidateTraining();
  return { success: true };
}

// Mã lỗi raise từ các RPC training_* → câu tiếng Việt cho người học.
const ATTEMPT_ERRORS: Record<string, string> = {
  not_employee: "Tài khoản chưa gắn với nhân viên.",
  course_not_found: "Không tìm thấy khoá học.",
  lessons_incomplete: "Bạn cần học xong tất cả bài học trước khi thi.",
  max_attempts_reached: "Bạn đã hết lượt thi khoá này — liên hệ quản lý để được mở lại.",
  no_questions: "Khoá học chưa có câu hỏi thi.",
  attempt_not_found: "Không tìm thấy bài thi.",
  already_submitted: "Bài thi này đã nộp rồi.",
  answers_too_large: "Dữ liệu bài làm không hợp lệ.",
};

function attemptErrorMessage(message: string): string {
  const code = Object.keys(ATTEMPT_ERRORS).find((k) => message.includes(k));
  return code ? ATTEMPT_ERRORS[code] : "Có lỗi xảy ra: " + message;
}

// Mở bài thi (hoặc quay lại bài đang làm dở) rồi chuyển sang trang làm bài.
export async function startTrainingAttempt(courseId: string): Promise<ActionState> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "Phiên đăng nhập đã hết — tải lại trang." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("training_start_attempt", { p_course_id: courseId });
  if (error) return { error: attemptErrorMessage(error.message) };

  revalidateTraining();
  redirect(`/training/${courseId}/quiz`);
}

const AnswersSchema = z.record(z.string().max(64), z.array(z.string().max(8)).max(6));

export async function submitTrainingAttempt(
  courseId: string,
  attemptId: string,
  answers: Record<string, string[]>,
): Promise<ActionState> {
  const employee = await getCurrentEmployee();
  if (!employee) return { error: "Phiên đăng nhập đã hết — tải lại trang." };

  const parsed = AnswersSchema.safeParse(answers);
  if (!parsed.success || Object.keys(parsed.data).length > 100) {
    return { error: "Dữ liệu bài làm không hợp lệ." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("training_submit_attempt", {
    p_attempt_id: attemptId,
    p_answers: parsed.data,
  });
  // Nộp trùng (bấm đúp / tự nộp khi hết giờ chạy song song) → vẫn đưa về
  // trang kết quả thay vì báo lỗi.
  if (error && !error.message.includes("already_submitted")) {
    return { error: attemptErrorMessage(error.message) };
  }

  revalidateTraining();
  redirect(`/training/${courseId}/attempts/${attemptId}`);
}
