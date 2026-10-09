"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SpecFacetsEditor } from "../../website/spec-facets-editor";
import { saveEquipmentSpecFacets } from "@/lib/actions/website";
import type { SpecFacets } from "@/lib/spec-fields";

// Tab "Thông số & web" của mã hàng (B4, Grok CRM 09/10): sửa thông số ngay
// trong hồ sơ thiết bị — cùng dữ liệu với khung "Sửa nội dung" ở trang
// Website, sửa bên nào cũng thấy bên kia.
export function SpecTab({
  equipmentTypeId,
  categorySlug,
  categoryName,
  productSlug,
  initial,
  canEdit,
}: {
  equipmentTypeId: string;
  categorySlug: string | null;
  categoryName: string | null;
  productSlug: string;
  initial: SpecFacets;
  canEdit: boolean;
}) {
  const [facets, setFacets] = useState<SpecFacets>(initial);
  const [dirty, setDirty] = useState(false);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const res = await saveEquipmentSpecFacets(equipmentTypeId, facets);
      if ("error" in res) return void toast.error(res.error);
      setDirty(false);
      toast.success("Đã lưu thông số — web cập nhật sau ít phút.");
    });
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle className="text-base">Thông số &amp; web</CardTitle>
        <span className="text-xs text-muted-foreground">
          Danh mục web: {categoryName ?? "chưa gán"} ·{" "}
          <Link href={`/website?search=${encodeURIComponent(productSlug)}`} className="text-primary hover:underline">
            Mở ở trang Website
          </Link>{" "}
          ·{" "}
          <a href={`https://thuenhanh.vn/${productSlug}`} target="_blank" rel="noopener" className="text-primary hover:underline">
            Xem trên web ↗
          </a>
        </span>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* fieldset KHÔNG dùng display:contents — Chrome không cho focus ô bên trong. */}
        <fieldset disabled={!canEdit || pending} className="m-0 min-w-0 border-0 p-0">
          <SpecFacetsEditor
            categorySlug={categorySlug}
            productSlug={productSlug}
            initial={initial}
            onChange={(f) => {
              setFacets(f);
              setDirty(true);
            }}
          />
        </fieldset>
        {canEdit && (
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" disabled={!dirty || pending} onClick={save}>
              {pending ? "Đang lưu…" : "Lưu thông số"}
            </Button>
            {dirty && <span className="text-xs text-amber-700 dark:text-amber-300">● Có thay đổi chưa lưu</span>}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
