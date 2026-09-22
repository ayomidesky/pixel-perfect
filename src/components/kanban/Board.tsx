import { useEffect, useMemo, useState } from "react";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useDroppable } from "@dnd-kit/core";
import { format, isBefore, isAfter, addDays, parseISO, startOfToday } from "date-fns";
import {
  CalendarDays,
  MoreHorizontal,
  Plus,
  Search,
  Users,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  createColumn,
  deleteColumn,
  persistTaskOrder,
  renameColumn,
  updateTask,
  type BoardColumn,
  type BoardData,
  type Tag,
  type Task,
} from "@/lib/db";
import { TaskDialog, tagClasses } from "./TaskDialog";

const priorityClasses: Record<string, string> = {
  low: "bg-tag-done text-tag-done-foreground",
  medium: "bg-tag-todo text-tag-todo-foreground",
  high: "bg-tag-warn text-tag-warn-foreground",
  urgent: "bg-tag-danger text-tag-danger-foreground",
};

interface Props {
  boardId: string;
  boardName: string;
  data: BoardData;
  onChanged: () => void;
}

export function Board({ boardId, boardName, data, onChanged }: Props) {
  const [tasks, setTasks] = useState<Task[]>(data.tasks);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [dialogColumn, setDialogColumn] = useState<string | null>(null);

  useEffect(() => setTasks(data.tasks), [data.tasks]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tasks.filter((t) => {
      const matchesText =
        !q ||
        t.title.toLowerCase().includes(q) ||
        (t.description ?? "").toLowerCase().includes(q) ||
        t.assignees.some((a) => a.toLowerCase().includes(q));
      const matchesPriority = priorityFilter === "all" || t.priority === priorityFilter;
      return matchesText && matchesPriority;
    });
  }, [tasks, query, priorityFilter]);

  const dueSoon = useMemo(() => {
    const today = startOfToday();
    const limit = addDays(today, 3);
    return tasks.filter(
      (t) =>
        !t.completed &&
        t.due_date &&
        !isAfter(parseISO(t.due_date), limit) &&
        !isBefore(parseISO(t.due_date), addDays(today, -3650)),
    );
  }, [tasks]);

  const columnTasks = (columnId: string) =>
    visible.filter((t) => t.column_id === columnId).sort((a, b) => a.position - b.position);

  function findColumnOf(id: string): string | null {
    const task = tasks.find((t) => t.id === id);
    if (task) return task.column_id;
    if (data.columns.some((c) => c.id === id)) return id;
    return null;
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveId(String(event.active.id));
  }

  function handleDragOver(event: DragOverEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeCol = findColumnOf(String(active.id));
    const overCol = findColumnOf(String(over.id));
    if (!activeCol || !overCol || activeCol === overCol) return;
    setTasks((prev) =>
      prev.map((t) => (t.id === String(active.id) ? { ...t, column_id: overCol } : t)),
    );
  }

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;

    const overCol = findColumnOf(String(over.id));
    if (!overCol) return;

    let next = tasks;
    const inColumn = tasks
      .filter((t) => t.column_id === overCol)
      .sort((a, b) => a.position - b.position);
    const oldIndex = inColumn.findIndex((t) => t.id === String(active.id));
    const newIndex = inColumn.findIndex((t) => t.id === String(over.id));

    if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
      const reordered = arrayMove(inColumn, oldIndex, newIndex);
      next = tasks.map((t) => {
        const idx = reordered.findIndex((r: Task) => r.id === t.id);
        return idx === -1 ? t : { ...t, position: idx };
      });
    } else {
      const reordered = inColumn.map((t, i) => ({ ...t, position: i }));
      next = tasks.map((t) => reordered.find((r) => r.id === t.id) ?? t);
    }

    setTasks(next);
    await persistTaskOrder(
      next
        .filter((t) => t.column_id === overCol)
        .map((t) => ({ id: t.id, column_id: t.column_id, position: t.position })),
    );
    onChanged();
  }

  async function toggleComplete(task: Task) {
    setTasks((prev) =>
      prev.map((t) => (t.id === task.id ? { ...t, completed: !t.completed } : t)),
    );
    await updateTask(task.id, { title: task.title, completed: !task.completed });
    onChanged();
  }

  function openNewTask(columnId: string) {
    setEditingTask(null);
    setDialogColumn(columnId);
    setDialogOpen(true);
  }

  async function handleAddColumn() {
    const name = window.prompt("Column name");
    if (!name?.trim()) return;
    await createColumn(boardId, name.trim(), data.columns.length);
    onChanged();
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-6 py-4">
        <h1 className="mr-auto text-xl font-semibold tracking-tight">{boardName}</h1>

        {dueSoon.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-tag-warn px-3 py-1 text-xs font-medium text-tag-warn-foreground">
            <CalendarDays className="size-3.5" />
            {dueSoon.length} due soon
          </span>
        )}

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search tasks"
            className="w-56 rounded-xl pl-9"
          />
        </div>

        <Select value={priorityFilter} onValueChange={setPriorityFilter}>
          <SelectTrigger className="w-36 rounded-xl">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All priorities</SelectItem>
            <SelectItem value="low">Low</SelectItem>
            <SelectItem value="medium">Medium</SelectItem>
            <SelectItem value="high">High</SelectItem>
            <SelectItem value="urgent">Urgent</SelectItem>
          </SelectContent>
        </Select>

        <Button variant="outline" className="rounded-xl" onClick={handleAddColumn}>
          <Plus className="mr-1 size-4" /> Column
        </Button>
      </div>

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragEnd={handleDragEnd}
      >
        <div className="flex flex-1 gap-6 overflow-x-auto px-6 py-6">
          {data.columns.map((column) => (
            <ColumnView
              key={column.id}
              column={column}
              tasks={columnTasks(column.id)}
              tags={data.tags}
              onAddTask={() => openNewTask(column.id)}
              onEditTask={(task) => {
                setEditingTask(task);
                setDialogColumn(column.id);
                setDialogOpen(true);
              }}
              onToggleComplete={toggleComplete}
              onChanged={onChanged}
            />
          ))}
          {data.columns.length === 0 && (
            <div className="text-sm text-muted-foreground">
              No columns yet — add your first one to get started.
            </div>
          )}
        </div>

        <DragOverlay>
          {activeId ? (
            <div className="w-72 rotate-2 rounded-2xl border border-border bg-card p-4 shadow-lg">
              <p className="font-medium">{tasks.find((t) => t.id === activeId)?.title}</p>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      <TaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        boardId={boardId}
        columns={data.columns}
        tags={data.tags}
        task={editingTask}
        defaultColumnId={dialogColumn}
        onSaved={onChanged}
      />
    </div>
  );
}

function ColumnView({
  column,
  tasks,
  tags,
  onAddTask,
  onEditTask,
  onToggleComplete,
  onChanged,
}: {
  column: BoardColumn;
  tasks: Task[];
  tags: Tag[];
  onAddTask: () => void;
  onEditTask: (task: Task) => void;
  onToggleComplete: (task: Task) => void;
  onChanged: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id });

  return (
    <div className="flex w-80 shrink-0 flex-col">
      <div className="mb-4 flex items-center gap-2">
        <h2 className="text-lg font-semibold tracking-tight">
          {column.name} <span className="text-muted-foreground">({tasks.length})</span>
        </h2>
        <div className="ml-auto flex items-center gap-1">
          <Button size="icon" variant="ghost" className="size-8 rounded-lg" onClick={onAddTask}>
            <Plus className="size-4" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="size-8 rounded-lg">
                <MoreHorizontal className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              <DropdownMenuItem
                onClick={async () => {
                  const name = window.prompt("Rename column", column.name);
                  if (name?.trim()) {
                    await renameColumn(column.id, name.trim());
                    onChanged();
                  }
                }}
              >
                Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive"
                onClick={async () => {
                  if (window.confirm(`Delete "${column.name}" and its tasks?`)) {
                    await deleteColumn(column.id);
                    onChanged();
                  }
                }}
              >
                Delete column
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          "flex min-h-40 flex-1 flex-col gap-4 rounded-3xl p-1 transition",
          isOver && "bg-accent/60",
        )}
      >
        <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
          {tasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              columnName={column.name}
              tags={tags}
              onEdit={() => onEditTask(task)}
              onToggleComplete={() => onToggleComplete(task)}
            />
          ))}
        </SortableContext>

        <button
          type="button"
          onClick={onAddTask}
          className="flex h-24 items-center justify-center gap-2 rounded-3xl border border-dashed border-border text-sm text-muted-foreground transition hover:border-primary hover:text-primary"
        >
          <Plus className="size-4" /> Add a task
        </button>
      </div>
    </div>
  );
}

function TaskCard({
  task,
  columnName,
  tags,
  onEdit,
  onToggleComplete,
}: {
  task: Task;
  columnName: string;
  tags: Tag[];
  onEdit: () => void;
  onToggleComplete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: task.id,
  });

  const taskTags = tags.filter((t) => task.tagIds.includes(t.id));
  const overdue =
    task.due_date && !task.completed && isBefore(parseISO(task.due_date), startOfToday());

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        "rounded-3xl border border-border bg-card p-5 shadow-sm transition hover:shadow-md",
        isDragging && "opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="rounded-full bg-tag-todo px-2.5 py-1 text-xs font-medium text-tag-todo-foreground">
          {columnName}
        </span>
        <span
          className={cn(
            "rounded-full px-2.5 py-1 text-xs font-medium capitalize",
            priorityClasses[task.priority],
          )}
        >
          {task.priority}
        </span>
        <button
          type="button"
          {...attributes}
          {...listeners}
          className="ml-auto cursor-grab rounded-lg p-1 text-muted-foreground hover:bg-secondary active:cursor-grabbing"
          aria-label="Drag task"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </div>

      <button type="button" onClick={onEdit} className="mt-3 block w-full text-left">
        <h3
          className={cn(
            "text-lg font-semibold leading-snug tracking-tight",
            task.completed && "text-muted-foreground line-through",
          )}
        >
          {task.title}
        </h3>
        {task.description && (
          <p className="mt-1.5 line-clamp-3 text-sm text-muted-foreground">{task.description}</p>
        )}
      </button>

      {taskTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {taskTags.map((tag) => (
            <span
              key={tag.id}
              className={cn("rounded-full px-2.5 py-1 text-xs font-medium", tagClasses(tag.color))}
            >
              {tag.name}
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        {task.due_date && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-secondary px-2.5 py-1",
              overdue && "bg-tag-danger text-tag-danger-foreground",
            )}
          >
            <CalendarDays className="size-3.5" />
            {format(parseISO(task.due_date), "MMM d")}
          </span>
        )}
        {task.assignees.length > 0 && (
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-3.5" />
            {task.assignees.join(", ")}
          </span>
        )}
        <button
          type="button"
          onClick={onToggleComplete}
          className={cn(
            "ml-auto inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 transition hover:bg-secondary",
            task.completed && "bg-tag-progress text-tag-progress-foreground",
          )}
        >
          <CheckCircle2 className="size-3.5" />
          {task.completed ? "Done" : "Mark done"}
        </button>
      </div>
    </div>
  );
}
