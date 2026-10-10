"use client";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteBranch } from "@/lib/actions/branches";

export function DeleteBranchButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Xoá kho "${name}"? Hành động này không thể hoàn tác.`}
      successMessage="Đã xoá kho."
      action={deleteBranch}
      actionArg={id}
    />
  );
}
