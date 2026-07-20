import { Plus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { getCurrentEmployee } from "@/lib/dal";
import { deleteEquipmentType, deleteEquipmentUnit } from "@/lib/actions/equipment";
import { EquipmentTypeDialog } from "./equipment-type-dialog";
import { EquipmentUnitDialog } from "./equipment-unit-dialog";

const MANAGE_ROLES = ["admin", "ke_toan"];
const currencyFormatter = new Intl.NumberFormat("vi-VN");

export default async function EquipmentPage() {
  const supabase = await createClient();
  const [{ data: types }, { data: units }, { data: branches }, employee] = await Promise.all([
    supabase.from("equipment_types").select("*").order("name"),
    supabase.from("equipment_units").select("*").order("brand_model"),
    supabase.from("branches").select("id, name").order("name"),
    getCurrentEmployee(),
  ]);

  const canManage = !!employee && MANAGE_ROLES.includes(employee.role);
  const branchList = branches ?? [];
  const branchNameById = new Map(branchList.map((b) => [b.id, b.name]));
  const unitsByType = new Map<string, NonNullable<typeof units>>();
  for (const unit of units ?? []) {
    const list = unitsByType.get(unit.equipment_type_id) ?? [];
    list.push(unit);
    unitsByType.set(unit.equipment_type_id, list);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Thiết bị</h1>
        {canManage && (
          <EquipmentTypeDialog
            branches={branchList}
            trigger={
              <Button>
                <Plus className="size-4" />
                Thêm loại thiết bị
              </Button>
            }
          />
        )}
      </div>

      <div className="space-y-4">
        {types?.map((type) => {
          const typeUnits = unitsByType.get(type.id) ?? [];
          return (
            <Card key={type.id}>
              <CardHeader className="flex-row items-start justify-between">
                <div>
                  <CardTitle>{type.name}</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    {branchNameById.get(type.branch_id) ?? "—"} ·{" "}
                    {currencyFormatter.format(type.rental_price_per_day)}đ/ngày
                  </p>
                </div>
                {canManage && (
                  <div className="flex items-center gap-1">
                    <EquipmentTypeDialog
                      branches={branchList}
                      equipmentType={type}
                      trigger={
                        <Button variant="ghost" size="icon-sm">
                          <Pencil className="size-4" />
                          <span className="sr-only">Sửa</span>
                        </Button>
                      }
                    />
                    <ConfirmDeleteButton
                      confirmMessage={`Xoá loại thiết bị "${type.name}" và toàn bộ biến thể? Hành động này không thể hoàn tác.`}
                      successMessage="Đã xoá loại thiết bị."
                      onDelete={() => deleteEquipmentType(type.id)}
                    />
                  </div>
                )}
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hãng / model</TableHead>
                      <TableHead>Tổng số lượng</TableHead>
                      <TableHead>Sẵn có</TableHead>
                      <TableHead>Ghi chú</TableHead>
                      {canManage && <TableHead className="w-24"></TableHead>}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {typeUnits.map((unit) => (
                      <TableRow key={unit.id}>
                        <TableCell className="font-medium">{unit.brand_model}</TableCell>
                        <TableCell>{unit.quantity_total}</TableCell>
                        <TableCell>{unit.quantity_available}</TableCell>
                        <TableCell>{unit.condition_notes ?? "—"}</TableCell>
                        {canManage && (
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <EquipmentUnitDialog
                                equipmentTypeId={type.id}
                                unit={unit}
                                trigger={
                                  <Button variant="ghost" size="icon-sm">
                                    <Pencil className="size-4" />
                                    <span className="sr-only">Sửa</span>
                                  </Button>
                                }
                              />
                              <ConfirmDeleteButton
                                confirmMessage={`Xoá biến thể "${unit.brand_model}"?`}
                                successMessage="Đã xoá biến thể."
                                onDelete={() => deleteEquipmentUnit(unit.id)}
                              />
                            </div>
                          </TableCell>
                        )}
                      </TableRow>
                    ))}
                    {!typeUnits.length && (
                      <TableRow>
                        <TableCell
                          colSpan={canManage ? 5 : 4}
                          className="text-center text-muted-foreground"
                        >
                          Chưa có biến thể nào.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
                {canManage && (
                  <div className="mt-3">
                    <EquipmentUnitDialog
                      equipmentTypeId={type.id}
                      trigger={
                        <Button variant="outline" size="sm">
                          <Plus className="size-4" />
                          Thêm biến thể
                        </Button>
                      }
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {!types?.length && (
          <p className="text-center text-muted-foreground">Chưa có loại thiết bị nào.</p>
        )}
      </div>
    </div>
  );
}
