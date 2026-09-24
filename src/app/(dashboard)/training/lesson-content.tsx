import { Fragment } from "react";
import { isSafeLinkHref, TRAINING_IMAGE_PATH_MARKER } from "@/lib/training";
import type { TrainingDocNode } from "@/types/database";

// Render tài liệu TipTap (JSON) của bài học bằng React thuần — chỉ vẽ đúng
// các node/mark trong danh sách cho phép (khớp validateTrainingDoc lúc lưu),
// text luôn đi qua escape của React nên không cần dangerouslySetInnerHTML.
// Node lạ (dữ liệu cũ/sửa tay trong DB) bị bỏ qua thay vì làm vỡ trang.

function renderMarks(node: TrainingDocNode, key: number): React.ReactNode {
  let out: React.ReactNode = node.text ?? "";
  for (const mark of node.marks ?? []) {
    if (mark.type === "bold") out = <strong>{out}</strong>;
    else if (mark.type === "italic") out = <em>{out}</em>;
    else if (mark.type === "underline") out = <u>{out}</u>;
    else if (mark.type === "strike") out = <s>{out}</s>;
    else if (mark.type === "code") out = <code>{out}</code>;
    else if (mark.type === "link" && isSafeLinkHref(mark.attrs?.href)) {
      out = (
        <a href={mark.attrs.href} target="_blank" rel="noopener noreferrer nofollow">
          {out}
        </a>
      );
    }
  }
  return <Fragment key={key}>{out}</Fragment>;
}

function renderNode(node: TrainingDocNode, key: number): React.ReactNode {
  const children = node.content?.map((child, i) => renderNode(child, i));
  switch (node.type) {
    case "text":
      return renderMarks(node, key);
    case "paragraph":
      return <p key={key}>{children}</p>;
    case "heading":
      return node.attrs?.level === 3 ? <h3 key={key}>{children}</h3> : <h2 key={key}>{children}</h2>;
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return <li key={key}>{children}</li>;
    case "blockquote":
      return <blockquote key={key}>{children}</blockquote>;
    case "codeBlock":
      return (
        <pre key={key}>
          <code>{children}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "image": {
      const src = node.attrs?.src;
      if (typeof src !== "string" || !src.includes(TRAINING_IMAGE_PATH_MARKER)) return null;
      const alt = typeof node.attrs?.alt === "string" ? node.attrs.alt : "";
      // Ảnh người soạn tự upload lên Supabase Storage — kích thước không
      // biết trước nên dùng <img> thường thay vì next/image.
      // eslint-disable-next-line @next/next/no-img-element
      return <img key={key} src={src} alt={alt} loading="lazy" />;
    }
    default:
      return null;
  }
}

export function LessonContent({ doc }: { doc: TrainingDocNode }) {
  if (!doc?.content?.length) {
    return <p className="text-sm text-muted-foreground">Bài học chưa có nội dung.</p>;
  }
  return (
    <div className="prose-editor prose-lesson text-[0.95rem]">
      {doc.content.map((node, i) => renderNode(node, i))}
    </div>
  );
}
