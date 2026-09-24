"use client";

import { useRef, useState, useTransition } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { toast } from "sonner";
import {
  Bold,
  Heading2,
  Heading3,
  ImagePlus,
  Italic,
  List,
  ListOrdered,
  Quote,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadTrainingImage } from "@/lib/actions/training";
import type { TrainingDocNode } from "@/types/database";

// Server Action của Next giới hạn body 1MB (mặc định) — ảnh chụp điện thoại
// 3-8MB sẽ bị từ chối. Thu nhỏ ngay trên trình duyệt (cạnh dài ≤1600px,
// JPEG) trước khi gửi: vừa lọt giới hạn vừa nhẹ cho người học xem trên 4G.
const UPLOAD_TARGET_BYTES = 850 * 1024;

async function shrinkImage(file: File): Promise<File> {
  if (file.size <= UPLOAD_TARGET_BYTES || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  // Nền trắng cho PNG trong suốt (JPEG không có alpha → mặc định ra đen).
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  for (const quality of [0.85, 0.7, 0.55]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= UPLOAD_TARGET_BYTES) {
      return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
    }
  }
  return file;
}

// Soạn nội dung bài học — anh em với rich-text-editor.tsx (mô tả web) nhưng
// khác 2 điểm: chèn được ẢNH (upload lên storage, không nhận base64/link
// ngoài) và xuất JSON TipTap thay vì HTML — phía xem render JSON bằng React
// (lesson-content.tsx) nên không cần dangerouslySetInnerHTML.
export function LessonEditor({
  name,
  defaultValue,
}: {
  name: string;
  defaultValue?: TrainingDocNode;
}) {
  const [json, setJson] = useState(() => JSON.stringify(defaultValue ?? { type: "doc", content: [] }));
  const [, setSelectionTick] = useState(0);
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), Image],
    content: defaultValue ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => setJson(JSON.stringify(e.getJSON())),
    onSelectionUpdate: () => setSelectionTick((t) => t + 1),
    editorProps: {
      attributes: {
        class:
          "prose-editor prose-lesson min-h-64 rounded-b-md border border-t-0 px-3 py-2 text-sm outline-none focus:border-ring",
      },
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editor) return;
    startUpload(async () => {
      try {
        const formData = new FormData();
        formData.set("image", await shrinkImage(file));
        const result = await uploadTrainingImage(formData);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        editor.chain().focus().setImage({ src: result.url, alt: file.name }).run();
      } catch {
        toast.error("Không tải được ảnh lên — thử ảnh nhỏ hơn.");
      }
    });
  }

  const toolBtn = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-md border bg-muted/40 px-1 py-0.5">
        {editor && (
          <>
            {toolBtn(
              editor.isActive("heading", { level: 2 }),
              () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              <Heading2 className="size-4" />,
              "Tiêu đề lớn",
            )}
            {toolBtn(
              editor.isActive("heading", { level: 3 }),
              () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
              <Heading3 className="size-4" />,
              "Tiêu đề nhỏ",
            )}
            {toolBtn(
              editor.isActive("bold"),
              () => editor.chain().focus().toggleBold().run(),
              <Bold className="size-4" />,
              "Chữ đậm",
            )}
            {toolBtn(
              editor.isActive("italic"),
              () => editor.chain().focus().toggleItalic().run(),
              <Italic className="size-4" />,
              "Chữ nghiêng",
            )}
            {toolBtn(
              editor.isActive("bulletList"),
              () => editor.chain().focus().toggleBulletList().run(),
              <List className="size-4" />,
              "Gạch đầu dòng",
            )}
            {toolBtn(
              editor.isActive("orderedList"),
              () => editor.chain().focus().toggleOrderedList().run(),
              <ListOrdered className="size-4" />,
              "Danh sách đánh số (các bước)",
            )}
            {toolBtn(
              editor.isActive("blockquote"),
              () => editor.chain().focus().toggleBlockquote().run(),
              <Quote className="size-4" />,
              "Khung lưu ý",
            )}
            {/* Không đi qua toolBtn: ref chỉ được đọc trong event handler thật */}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              title="Chèn ảnh (ảnh lớn tự thu nhỏ)"
            >
              <ImagePlus className="size-4" />
              <span className="sr-only">Chèn ảnh</span>
            </Button>
            {toolBtn(false, () => editor.chain().focus().undo().run(), <Undo2 className="size-4" />, "Hoàn tác")}
          </>
        )}
        {uploading && <span className="ml-auto pr-2 text-xs text-muted-foreground">Đang tải ảnh...</span>}
      </div>
      <EditorContent editor={editor} />
      <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />
      {/* JSON kết quả đi vào form qua hidden input */}
      <input type="hidden" name={name} value={json} />
    </div>
  );
}
