import type { TrainingDocNode } from "@/types/database";

// Tiện ích dùng chung cho module đào tạo — chạy được cả server lẫn client.

// Ảnh bài học nằm trong bucket public equipment-images, thư mục training/
// (upload qua actions/training.ts). Chỉ nhận đúng URL này để tài liệu
// không nhúng được ảnh/tracker lạ.
export const TRAINING_IMAGE_PATH_MARKER = "/storage/v1/object/public/equipment-images/training/";

// Nhận mọi dạng link YouTube người dùng hay dán (watch?v=, youtu.be/,
// shorts/, embed/) → URL nhúng. youtube-nocookie để không thả cookie
// quảng cáo lên máy nhân viên. null = không phải link YouTube hợp lệ.
export function youtubeEmbedUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const match = url
    .trim()
    .match(
      /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?:[?&#/].*)?$/,
    );
  return match ? `https://www.youtube-nocookie.com/embed/${match[1]}` : null;
}

// Node/mark TipTap được phép trong bài học — khớp StarterKit + Image của
// lesson-editor.tsx và bộ render lesson-content.tsx. Gì ngoài danh sách
// này bị từ chối lúc lưu nên không bao giờ tới được màn hình người học.
const ALLOWED_NODES = new Set([
  "doc",
  "paragraph",
  "heading",
  "text",
  "bulletList",
  "orderedList",
  "listItem",
  "blockquote",
  "codeBlock",
  "hardBreak",
  "horizontalRule",
  "image",
]);
const ALLOWED_MARKS = new Set(["bold", "italic", "underline", "strike", "code", "link"]);

export function isSafeLinkHref(href: unknown): href is string {
  return typeof href === "string" && /^https?:\/\//i.test(href);
}

// Trả thông báo lỗi, hoặc null nếu tài liệu hợp lệ.
export function validateTrainingDoc(doc: unknown): string | null {
  if (!doc || typeof doc !== "object" || (doc as TrainingDocNode).type !== "doc") {
    return "Nội dung bài học không hợp lệ.";
  }
  let nodeCount = 0;
  const walk = (node: TrainingDocNode, depth: number): string | null => {
    if (++nodeCount > 5000 || depth > 12) return "Nội dung bài học quá dài hoặc lồng quá sâu.";
    if (!node || typeof node !== "object" || !ALLOWED_NODES.has(node.type)) {
      return `Nội dung có thành phần không hỗ trợ (${String(node?.type)}).`;
    }
    if (node.type === "image") {
      const src = node.attrs?.src;
      if (typeof src !== "string" || !src.startsWith("https://") || !src.includes(TRAINING_IMAGE_PATH_MARKER)) {
        return "Ảnh trong bài phải được tải lên bằng nút chèn ảnh, không dán link ngoài.";
      }
    }
    for (const mark of node.marks ?? []) {
      if (!ALLOWED_MARKS.has(mark.type)) return `Định dạng không hỗ trợ (${mark.type}).`;
      if (mark.type === "link" && !isSafeLinkHref(mark.attrs?.href)) {
        return "Liên kết trong bài phải bắt đầu bằng http:// hoặc https://.";
      }
    }
    if (node.content !== undefined && !Array.isArray(node.content)) return "Nội dung bài học không hợp lệ.";
    for (const child of node.content ?? []) {
      const err = walk(child, depth + 1);
      if (err) return err;
    }
    return null;
  };
  return walk(doc as TrainingDocNode, 0);
}

// "12:05" — đồng hồ đếm ngược bài thi.
export function formatCountdown(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return `${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
}
