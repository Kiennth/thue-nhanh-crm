"use client";

import { useRef, useState, useTransition } from "react";
import { MessageSquare, Reply } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { addOrderComment, deleteOrderComment } from "@/lib/actions/order-comments";
import { VN_TIME_ZONE } from "@/lib/date-format";

export interface OrderCommentItem {
  id: string;
  parentId: string | null;
  authorName: string;
  body: string;
  createdAt: string;
}

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VN_TIME_ZONE,
});

function CommentForm({
  orderId,
  parentId,
  placeholder,
  submitLabel,
  autoFocus,
  onDone,
}: {
  orderId: string;
  parentId?: string;
  placeholder: string;
  submitLabel: string;
  autoFocus?: boolean;
  onDone?: () => void;
}) {
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await addOrderComment(undefined, formData);
      if (result && "error" in result) {
        setError(result.error);
      } else {
        formRef.current?.reset();
        onDone?.();
      }
    });
  }

  return (
    <form ref={formRef} action={handleSubmit} className="space-y-2">
      <input type="hidden" name="order_id" value={orderId} />
      {parentId && <input type="hidden" name="parent_id" value={parentId} />}
      <Textarea
        name="body"
        placeholder={placeholder}
        rows={2}
        required
        autoFocus={autoFocus}
        onKeyDown={(e) => {
          // Ctrl/Cmd + Enter gửi nhanh như các app chat.
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            formRef.current?.requestSubmit();
          }
        }}
      />
      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex justify-end gap-2">
        {onDone && parentId && (
          <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={pending}>
            Huỷ
          </Button>
        )}
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? "Đang gửi..." : submitLabel}
        </Button>
      </div>
    </form>
  );
}

function CommentBubble({
  comment,
  canDelete,
}: {
  comment: OrderCommentItem;
  canDelete: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1">
        <p className="text-sm">
          <span className="font-semibold">{comment.authorName}</span>
          <span className="ml-2 text-xs text-muted-foreground">
            {timeFormatter.format(new Date(comment.createdAt))}
          </span>
        </p>
        <p className="mt-0.5 text-sm break-words whitespace-pre-wrap">{comment.body}</p>
      </div>
      {canDelete && (
        <ConfirmDeleteButton
          confirmMessage="Xoá bình luận này? Các trả lời bên dưới cũng bị xoá theo."
          successMessage="Đã xoá bình luận."
          action={deleteOrderComment}
          actionArg={comment.id}
        />
      )}
    </div>
  );
}

// Khung ghi chú nội bộ của đơn (CEO 2026-09-25): nhân viên bình luận + trả
// lời 1 tầng, lưu lại toàn bộ lịch sử. Không sửa được bài đã đăng; chỉ Giám
// đốc xoá được khi ghi nhầm.
export function OrderComments({
  orderId,
  comments,
  canDelete,
}: {
  orderId: string;
  comments: OrderCommentItem[];
  canDelete: boolean;
}) {
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const roots = comments.filter((c) => !c.parentId);
  const repliesByParent = new Map<string, OrderCommentItem[]>();
  for (const c of comments) {
    if (!c.parentId) continue;
    const list = repliesByParent.get(c.parentId) ?? [];
    list.push(c);
    repliesByParent.set(c.parentId, list);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquare className="size-4 text-muted-foreground" />
          Ghi chú nội bộ ({comments.length})
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!roots.length && (
          <p className="text-sm text-muted-foreground">
            Chưa có ghi chú nào. Khách chỉ thấy các chứng từ, không thấy phần này.
          </p>
        )}
        {roots.map((root) => {
          const replies = repliesByParent.get(root.id) ?? [];
          return (
            <div key={root.id} className="space-y-3 rounded-lg border p-3">
              <CommentBubble comment={root} canDelete={canDelete} />
              {replies.length > 0 && (
                <div className="space-y-3 border-l-2 pl-3">
                  {replies.map((reply) => (
                    <CommentBubble key={reply.id} comment={reply} canDelete={canDelete} />
                  ))}
                </div>
              )}
              {replyingTo === root.id ? (
                <div className="border-l-2 pl-3">
                  <CommentForm
                    orderId={orderId}
                    parentId={root.id}
                    placeholder={`Trả lời ${root.authorName}...`}
                    submitLabel="Trả lời"
                    autoFocus
                    onDone={() => setReplyingTo(null)}
                  />
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs text-muted-foreground"
                  onClick={() => setReplyingTo(root.id)}
                >
                  <Reply className="size-3.5" />
                  Trả lời
                </Button>
              )}
            </div>
          );
        })}
        <CommentForm
          orderId={orderId}
          placeholder="Viết ghi chú cho đơn này... (Ctrl + Enter để gửi)"
          submitLabel="Đăng ghi chú"
        />
      </CardContent>
    </Card>
  );
}
