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

export default async function PricingTemplatesPage() {
  await requireRole([...DIRECTOR_ONLY]);

  const supabase = await createClient();
  const [{ data: templates }, { data: tiers }] = await Promise.all([
    supabase.from("pricing_templates").select("*").order("name"),
    supabase.from("pricing_template_tiers").select("*").order("min_duration"),
  ]);
  const templateList = templates ?? [];

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
                    <TableCell>
                      <div className="flex items-center gap-1">
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
                  <TableCell colSpan={3} className="text-center text-muted-foreground">
                    Chưa có bảng giá mẫu nào.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
