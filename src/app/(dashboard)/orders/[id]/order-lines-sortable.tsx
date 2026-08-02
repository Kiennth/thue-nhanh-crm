"use client";

import { useState, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import { reorderOrderEquipmentLines } from "@/lib/actions/orders";

interface OrderLineRow {
  id: string;
  content: ReactNode;
}

// Kéo thả sắp xếp lại "Danh sách thiết bị" — cập nhật thứ tự tại chỗ (client
// state) để kéo mượt, rồi lưu xuống DB (order_equipment.position) ở nền; nếu
// lưu lỗi thì trả lại thứ tự cũ.
//
// DndContext phải bọc NGOÀI <Table> (không đặt trong <tbody>): dnd-kit render
// các phần tử ẩn cho screen reader dạng <div> ngay cạnh children — nằm trong
// <table> là HTML không hợp lệ, trình duyệt tự dời ra ngoài gây hydration
// mismatch của React.
export function OrderLinesSortableTable({ orderId, rows }: { orderId: string; rows: OrderLineRow[] }) {
  const [order, setOrder] = useState(() => rows.map((r) => r.id));
  const contentById = new Map(rows.map((r) => [r.id, r.content]));

  // State chỉ khởi tạo lúc mount, nhưng danh sách dòng có thể đổi NGOÀI bảng
  // này (thêm dòng qua dialog, xoá dòng → server revalidate) — đối chiếu lại
  // mỗi lần render: dòng server không còn thì bỏ, dòng mới nối vào cuối, thứ
  // tự người dùng đang kéo giữ nguyên. Không làm vậy thì dòng mới thêm không
  // hiện ra cho tới khi refresh trang.
  const serverIds = rows.map((r) => r.id);
  const displayOrder = [
    ...order.filter((id) => contentById.has(id)),
    ...serverIds.filter((id) => !order.includes(id)),
  ];

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    // Kéo thả tính trên displayOrder (đã gồm dòng mới thêm) chứ không phải
    // state thô — state thô có thể thiếu dòng mới/thừa dòng đã xoá.
    const prev = displayOrder;
    const oldIndex = prev.indexOf(String(active.id));
    const newIndex = prev.indexOf(String(over.id));
    const next = arrayMove(prev, oldIndex, newIndex);
    reorderOrderEquipmentLines(orderId, next).catch(() => setOrder(prev));
    setOrder(next);
  }

  return (
    <DndContext
      // id cố định — dnd-kit sinh id đếm tăng dần cho aria-describedby, SSR
      // và client đếm khác nhau gây hydration mismatch nếu không truyền.
      id="order-lines-dnd"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-8"></TableHead>
            <TableHead>Hàng hoá</TableHead>
            <TableHead>Biến thể/Sản phẩm</TableHead>
            <TableHead>SL</TableHead>
            <TableHead>Giá thuê</TableHead>
            <TableHead>Thành tiền</TableHead>
            <TableHead>Người thực hiện</TableHead>
            <TableHead className="w-16"></TableHead>
          </TableRow>
        </TableHeader>
        <SortableContext items={displayOrder} strategy={verticalListSortingStrategy}>
          <TableBody>
            {displayOrder.map((id) => (
              <SortableLineRow key={id} id={id}>
                {contentById.get(id)}
              </SortableLineRow>
            ))}
          </TableBody>
        </SortableContext>
      </Table>
    </DndContext>
  );
}

function SortableLineRow({ id, children }: { id: string; children: ReactNode }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : undefined,
  };

  return (
    <TableRow ref={setNodeRef} style={style}>
      <TableCell className="w-8 cursor-grab touch-none" {...attributes} {...listeners}>
        <GripVertical className="size-4 text-muted-foreground" />
      </TableCell>
      {children}
    </TableRow>
  );
}
