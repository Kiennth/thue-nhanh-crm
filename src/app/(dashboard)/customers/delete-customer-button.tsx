"use client";

import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { deleteCustomer } from "@/lib/actions/customers";

export function DeleteCustomerButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDeleteButton
      confirmMessage={`Xoá khách hàng "${name}"? Hành động này không thể hoàn tác.`}
      successMessage="Đã xoá khách hàng."
      action={deleteCustomer}
      actionArg={id}
    />
  );
}
