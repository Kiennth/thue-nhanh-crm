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
import { TableBody, TableRow, TableCell } from "@/components/ui/table";
import { reorderOrderEquipmentLines } from "@/lib/actions/orders";

interface OrderLineRow {
  id: string;
  content: ReactNode;
}

// Kéo thả sắp xếp lại "Danh sách thiết bị" — cập nhật thứ tự tại chỗ (client
// state) để kéo mượt, rồi lưu xuống DB (order_equipment.position) ở nền; nếu
// lưu lỗi thì trả lại thứ tự cũ.
export function OrderLinesSortableBody({ orderId, rows }: { orderId: string; rows: OrderLineRow[] }) {
  const [order, setOrder] = useState(() => rows.map((r) => r.id));
  const contentById = new Map(rows.map((r) => [r.id, r.content]));

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    setOrder((prev) => {
      const oldIndex = prev.indexOf(String(active.id));
      const newIndex = prev.indexOf(String(over.id));
      const next = arrayMove(prev, oldIndex, newIndex);
      reorderOrderEquipmentLines(orderId, next).catch(() => setOrder(prev));
      return next;
    });
  }

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <TableBody>
          {order.map((id) => (
            <SortableLineRow key={id} id={id}>
              {contentById.get(id)}
            </SortableLineRow>
          ))}
        </TableBody>
      </SortableContext>
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
