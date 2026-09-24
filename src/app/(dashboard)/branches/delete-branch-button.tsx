"use client";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteBranch } from "@/lib/actions/branches";

export function DeleteBranchButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Xoá chi nhánh "${name}"? Hành động này không thể hoàn tác.`}
      successMessage="Đã xoá chi nhánh."
      action={deleteBranch}
      actionArg={id}
    />
  );
}
