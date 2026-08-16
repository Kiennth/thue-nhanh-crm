"use client";

import { useState } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, List, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";

// Soạn thảo trực quan cho mô tả sản phẩm/danh mục web (CEO yêu cầu
// 2026-08-16 — "HTML thô sao tao biết sửa"). TipTap xuất HTML thẳng vào
// hidden input cùng name để form action nhận như textarea cũ, không đổi
// gì phía server. Tiêu đề H2/H3 quan trọng: web bóc heading để chia ô
// Specs / Trong hộp / Thông tin (xem product-info-sections bên repo web).
export function RichTextEditor({
  name,
  defaultValue,
  placeholder,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  // TipTap v3 không tự re-render component cha theo transaction — tự theo
  // dõi HTML (cho hidden input) + nhịp selection (cho trạng thái toolbar).
  const [html, setHtml] = useState(defaultValue ?? "");
  const [, setSelectionTick] = useState(0);
  const editor = useEditor({
    extensions: [StarterKit],
    content: defaultValue ?? "",
    immediatelyRender: false,
    onUpdate: ({ editor: e }) => setHtml(e.getHTML()),
    onSelectionUpdate: () => setSelectionTick((t) => t + 1),
    editorProps: {
      attributes: {
        class:
          "prose-editor min-h-40 rounded-b-md border border-t-0 px-3 py-2 text-sm outline-none focus:border-ring",
      },
    },
  });

  const toolBtn = (
    active: boolean,
    onClick: () => void,
    icon: React.ReactNode,
    label: string,
  ) => (
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
      <div className="flex items-center gap-0.5 rounded-t-md border bg-muted/40 px-1 py-0.5">
        {editor && (
          <>
            {toolBtn(
              editor.isActive("heading", { level: 2 }),
              () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
              <Heading2 className="size-4" />,
              "Tiêu đề lớn (chia ô: Cấu hình, Trong hộp...)",
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
              editor.isActive("bulletList"),
              () => editor.chain().focus().toggleBulletList().run(),
              <List className="size-4" />,
              "Gạch đầu dòng",
            )}
            {toolBtn(false, () => editor.chain().focus().undo().run(), <Undo2 className="size-4" />, "Hoàn tác")}
          </>
        )}
        {placeholder && <span className="ml-auto pr-2 text-xs text-muted-foreground">{placeholder}</span>}
      </div>
      <EditorContent editor={editor} />
      {/* HTML kết quả đi vào form qua hidden input — server không đổi gì */}
      <input type="hidden" name={name} value={html} />
    </div>
  );
}
