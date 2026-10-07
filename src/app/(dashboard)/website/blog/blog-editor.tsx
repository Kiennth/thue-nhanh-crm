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
  Link2,
  List,
  ListOrdered,
  Quote,
  Undo2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { uploadBlogImage } from "@/lib/actions/blog";

// Ảnh chụp điện thoại 3–8MB vượt giới hạn 1MB của Server Action → thu nhỏ
// trên trình duyệt trước khi gửi (giống lesson-editor của module Đào tạo).
const UPLOAD_TARGET_BYTES = 850 * 1024;

export async function shrinkImage(file: File): Promise<File> {
  if (file.size <= UPLOAD_TARGET_BYTES || file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
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

// Soạn bài blog — xuất HTML vào hidden input. H2 của bài thành mục lục tự
// động trên web, nên chia bài bằng "Tiêu đề lớn" (hoặc gõ "## " đầu dòng).
export function BlogEditor({ name, defaultValue }: { name: string; defaultValue?: string }) {
  const [html, setHtml] = useState(defaultValue ?? "");
  const [, setSelectionTick] = useState(0);
  const [uploading, startUpload] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), Image],
    content: defaultValue ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => setHtml(e.getHTML()),
    onSelectionUpdate: () => setSelectionTick((t) => t + 1),
    editorProps: {
      attributes: {
        class:
          "prose-editor prose-lesson min-h-96 rounded-b-md border border-t-0 px-4 py-3 text-[15px] leading-7 outline-none focus:border-ring",
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
        const result = await uploadBlogImage(formData);
        if ("error" in result) {
          toast.error(result.error);
          return;
        }
        // alt = tên file bỏ đuôi; sửa được bằng cách xoá ảnh chèn lại với tên file rõ nghĩa.
        const alt = file.name.replace(/\.[^.]+$/, "").replace(/[-_]+/g, " ");
        editor.chain().focus().setImage({ src: result.url, alt }).run();
      } catch {
        toast.error("Không tải được ảnh lên — thử ảnh nhỏ hơn.");
      }
    });
  }

  function setLink() {
    if (!editor) return;
    const prev = (editor.getAttributes("link").href as string | undefined) ?? "";
    const url = window.prompt("Đường dẫn (vd /thue-loa hoặc https://…). Để trống để bỏ link:", prev);
    if (url === null) return;
    if (url.trim() === "") editor.chain().focus().extendMarkRange("link").unsetLink().run();
    else editor.chain().focus().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  const toolBtn = (active: boolean, onClick: () => void, icon: React.ReactNode, label: string) => (
    <Button
      type="button"
      variant={active ? "secondary" : "ghost"}
      size="icon-sm"
      // Không cho nút giành focus khỏi khung soạn — bấm H2 rồi gõ tiếp được ngay.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      title={label}
    >
      {icon}
      <span className="sr-only">{label}</span>
    </Button>
  );

  return (
    <div>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-0.5 rounded-t-md border bg-muted px-1 py-0.5">
        {editor && (
          <>
            {toolBtn(
              editor.isActive("heading", { level: 2 }),
              () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              <Heading2 className="size-4" />,
              "Tiêu đề lớn (vào mục lục)",
            )}
            {toolBtn(
              editor.isActive("heading", { level: 3 }),
              () => editor.chain().focus().toggleHeading({ level: 3 }).run(),
              <Heading3 className="size-4" />,
              "Tiêu đề nhỏ",
            )}
            {toolBtn(editor.isActive("bold"), () => editor.chain().focus().toggleBold().run(), <Bold className="size-4" />, "Chữ đậm")}
            {toolBtn(
              editor.isActive("italic"),
              () => editor.chain().focus().toggleItalic().run(),
              <Italic className="size-4" />,
              "Chữ nghiêng",
            )}
            {toolBtn(editor.isActive("link"), setLink, <Link2 className="size-4" />, "Gắn link (vd sang trang /thue-loa)")}
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
              "Danh sách đánh số",
            )}
            {toolBtn(
              editor.isActive("blockquote"),
              () => editor.chain().focus().toggleBlockquote().run(),
              <Quote className="size-4" />,
              "Khung lưu ý",
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              title="Chèn ảnh (ảnh lớn tự thu nhỏ; tên file thành mô tả ảnh)"
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
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
