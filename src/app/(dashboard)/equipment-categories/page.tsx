import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
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
import { MANAGE_ROLES } from "@/lib/roles";
import { deleteEquipmentCategory } from "@/lib/actions/equipment";
import { EquipmentCategoryDialog } from "../equipment/equipment-category-dialog";

export default async function EquipmentCategoriesPage() {
  await requireRole([...MANAGE_ROLES]);

  const supabase = await createClient();
  const { data: categories } = await supabase
    .from("equipment_categories")
    .select("*")
    .order("sort_order");
  const categoryList = categories ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Danh mục thiết bị</h1>
        <EquipmentCategoryDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Danh sách danh mục</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tên</TableHead>
                <TableHead>Thứ tự</TableHead>
                <TableHead>Trạng thái</TableHead>
                <TableHead className="w-24"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryList.map((category) => (
                <TableRow key={category.id}>
                  <TableCell className="font-medium">{category.name}</TableCell>
                  <TableCell>{category.sort_order}</TableCell>
                  <TableCell>
                    <Badge variant={category.is_active ? "default" : "secondary"}>
                      {category.is_active ? "Hoạt động" : "Ngừng"}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <EquipmentCategoryDialog category={category} />
                      <ConfirmDeleteButton
                        confirmMessage={`Xoá danh mục "${category.name}"? Sản phẩm thuộc danh mục này sẽ chuyển về "Chưa phân loại".`}
                        successMessage="Đã xoá danh mục."
                        action={deleteEquipmentCategory}
                        actionArg={category.id}
                      />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {!categoryList.length && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground">
                    Chưa có danh mục nào.
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
