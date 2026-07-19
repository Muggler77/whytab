import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useState, type MouseEvent, type ReactNode } from "react";
import type { WidgetKey, WidgetSize } from "./types";

export type SortableWidgetGridItem = {
  id: WidgetKey;
  size: WidgetSize;
  label: string;
  sizeLabel: string;
  icon: ReactNode;
  content: ReactNode;
};

function SortableWidgetItem({ item }: { item: SortableWidgetGridItem }) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: item.id });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 20 : undefined
  } as React.CSSProperties;

  return (
    <div
      ref={setNodeRef}
      className={`widget-sortable-shell widget-size-${item.size} ${isDragging ? "is-dragging" : ""}`}
      data-widget-key={item.id}
      style={style}
    >
      {item.content}
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="widget-sortable-handle"
        aria-label={`拖动${item.label}小组件`}
        title={`拖动${item.label}`}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={16} />
      </button>
    </div>
  );
}

export default function SortableWidgetGrid({ items, onMove, onContextMenu }: {
  items: SortableWidgetGridItem[];
  onMove: (source: WidgetKey, target: WidgetKey) => void;
  onContextMenu: (event: MouseEvent<HTMLElement>) => void;
}) {
  const [activeId, setActiveId] = useState<WidgetKey | undefined>();
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  const activeItem = items.find((item) => item.id === activeId);
  const finishDrag = (event: DragEndEvent) => {
    const source = event.active.id as WidgetKey;
    const target = event.over?.id as WidgetKey | undefined;
    setActiveId(undefined);
    if (target && source !== target) onMove(source, target);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={(event) => setActiveId(event.active.id as WidgetKey)}
      onDragCancel={() => setActiveId(undefined)}
      onDragEnd={finishDrag}
    >
      <SortableContext items={items.map((item) => item.id)} strategy={rectSortingStrategy}>
        <section className="widgets home-widgets layout-editing" aria-label="主页小组件" onContextMenu={onContextMenu}>
          {items.map((item) => <SortableWidgetItem item={item} key={item.id} />)}
        </section>
      </SortableContext>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease" }}>
        {activeItem ? (
          <div className={`widget-drag-preview widget-tone-${activeItem.id}`}>
            {activeItem.icon}
            <strong>{activeItem.label}</strong>
            <span>{activeItem.sizeLabel}</span>
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
