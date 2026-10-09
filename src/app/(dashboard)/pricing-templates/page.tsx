import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY } from "@/lib/roles";
import { deletePricingTemplate } from "@/lib/actions/equipment";
import { PricingTemplateDialog } from "../equipment/pricing-template-dialog";
import { PricingTemplateTiersDialog } from "../equipment/pricing-template-tiers-dialog";
import Link from "next/link";
import { AssignCategoryButton } from "./assign-category-button";

export default async function PricingTemplatesPage() {
  await requireRole([...DIRECTOR_ONLY]);

  const supabase = await createClient();
  const [{ data: templates }, { data: tiers }, { data: usage }, { data: categories }, { data: ownTemplates }] =
    await Promise.all([
      supabase.from("pricing_templates").select("*").is("owner_equipment_type_id", null).order("name"),
      supabase.from("pricing_template_tiers").select("*").order("min_duration"),
      supabase.from("equipment_types").select("pricing_template_id").eq("pricing_method", "pricing_structure"),
      supabase.from("equipment_categories").select("id, name").eq("is_active", true).order("sort_order"),
      // B3: mã có thang giá riêng (tên mã qua owner).
      supabase
        .from("pricing_templates")
        .select("id, owner_equipment_type_id, equipment_types!pricing_templates_owner_equipment_type_id_fkey(name)")
        .not("owner_equipment_type_id", "is", null),
    ]);
  const templateList = templates ?? [];
  const useCount = new Map<string, number>();
  for (const u of usage ?? []) {
    if (u.pricing_template_id) useCount.set(u.pricing_template_id, (useCount.get(u.pricing_template_id) ?? 0) + 1);
  }
  const customList = (ownTemplates ?? []).map((t) => ({
    typeId: t.owner_equipment_type_id!,
    name: (t.equipment_types as unknown as { name: string } | null)?.name ?? "—",
  }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Bảng giá mẫu</h1>
        <PricingTemplateDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danh sách bảng giá</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Số bậc giá</TableHead>
                <TableHead>Số mã dùng</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {templateList.map((template) => {
                const templateTiers = (tiers ?? []).filter((t) => t.template_id === template.id);
                return (
                  <TableRow key={template.id}>
                    <TableCell className="font-medium">{template.name}</TableCell>
                    <TableCell>{templateTiers.length}</TableCell>
                    <TableCell className="tabular-nums">{useCount.get(template.id) ?? 0}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <AssignCategoryButton templateId={template.id} categories={categories ?? []} />
                        <PricingTemplateTiersDialog
                          templateId={template.id}
                          templateName={template.name}
                          tiers={templateTiers}
                        />
                        <ConfirmDeleteButton
                          confirmMessage={`Xoá bảng giá "${template.name}"?`}
                          successMessage="Đã xoá bảng giá."
                          action={deletePricingTemplate}
                          actionArg={template.id}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {!templateList.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Chưa có bảng giá mẫu nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Mã có thang giá riêng ({customList.length})</CardTitle>
        </CardHeader>
        <CardContent className="text-sm">
          {customList.length ? (
            <ul className="flex flex-wrap gap-1.5">
              {customList.map((c) => (
                <li key={c.typeId}>
                  <Link
                    href={`/equipment/${c.typeId}?tab=pricing`}
                    className="inline-block rounded-full border px-2.5 py-0.5 hover:bg-muted"
                  >
                    {c.name}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">
              Chưa có — mở 1 mã hàng → tab <b>Bảng giá</b> → &quot;Thang giá riêng&quot; để đặt thang riêng cho mã đó.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
