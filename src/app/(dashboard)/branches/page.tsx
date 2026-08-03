import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/dal";
import { DIRECTOR_ONLY } from "@/lib/roles";
import { BranchDialog } from "./branch-dialog";
import { DeleteBranchButton } from "./delete-branch-button";

export default async function BranchesPage() {
  // Menu đã để mục này riêng cho Giám đốc, nhưng trang lại không chặn ai —
  // gõ thẳng URL là vào. Chặn cho khớp với menu.
  const employee = await requireRole([...DIRECTOR_ONLY]);

  const supabase = await createClient();
  const { data: branches } = await supabase.from("branches").select("*").order("position");

  const isDirector = employee.role === "giam_doc";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Chi nhánh</h1>
        {isDirector && (
          <BranchDialog />
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tên chi nhánh</TableHead>
            <TableHead>Vùng lương tối thiểu</TableHead>
            <TableHead>Trạng thái</TableHead>
            {isDirector && <TableHead className="w-24"></TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {branches?.map((branch) => (
            <TableRow key={branch.id}>
              <TableCell className="font-medium">
                <Link href={`/branches/${branch.id}`} className="hover:underline">
                  {branch.name}
                </Link>
              </TableCell>
              <TableCell>{branch.min_wage_region ?? "—"}</TableCell>
              <TableCell>
                <Badge variant={branch.is_active ? "default" : "secondary"}>
                  {branch.is_active ? "Hoạt động" : "Ngừng"}
                </Badge>
              </TableCell>
              {isDirector && (
                <TableCell>
                  <div className="flex items-center gap-1">
                    <BranchDialog branch={branch} />
                    <DeleteBranchButton id={branch.id} name={branch.name} />
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
          {!branches?.length && (
            <TableRow>
              <TableCell colSpan={isDirector ? 4 : 3} className="text-center text-muted-foreground">
                Chưa có chi nhánh nào.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
