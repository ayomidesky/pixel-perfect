import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  addComment,
  createTag,
  createTask,
  deleteTask,
  fetchComments,
  updateTask,
  type BoardColumn,
  type Priority,
  type Tag,
  type Task,
} from "@/lib/db";
import { cn } from "@/lib/utils";

const TAG_COLORS = ["violet", "green", "blue", "amber", "rose"];

export function tagClasses(color: string) {
  switch (color) {
    case "green":
      return "bg-tag-progress text-tag-progress-foreground";
    case "blue":
      return "bg-tag-done text-tag-done-foreground";
    case "amber":
      return "bg-tag-warn text-tag-warn-foreground";
    case "rose":
      return "bg-tag-danger text-tag-danger-foreground";
    default:
      return "bg-tag-todo text-tag-todo-foreground";
  }
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  boardId: string;
  columns: BoardColumn[];
  tags: Tag[];
  task: Task | null;
  defaultColumnId: string | null;
  onSaved: () => void;
}

export function TaskDialog({
  open,
  onOpenChange,
  boardId,
  columns,
  tags,
  task,
  defaultColumnId,
  onSaved,
}: Props) {
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [priority, setPriority] = useState<Priority>("medium");
  const [assignees, setAssignees] = useState("");
  const [columnId, setColumnId] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(task?.title ?? "");
    setDescription(task?.description ?? "");
    setDueDate(task?.due_date ?? "");
    setPriority(task?.priority ?? "medium");
    setAssignees((task?.assignees ?? []).join(", "));
    setColumnId(task?.column_id ?? defaultColumnId ?? columns[0]?.id ?? "");
    setSelectedTags(task?.tagIds ?? []);
    setComment("");
    setNewTag("");
  }, [open, task, defaultColumnId, columns]);

  const { data: comments = [] } = useQuery({
    queryKey: ["comments", task?.id],
    queryFn: () => fetchComments(task!.id),
    enabled: open && !!task,
  });

  async function handleSave() {
    if (!title.trim()) {
      toast.error("Give the task a title.");
      return;
    }
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        due_date: dueDate || null,
        priority,
        assignees: assignees
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        column_id: columnId,
      };
      if (task) {
        await updateTask(task.id, payload, selectedTags);
      } else {
        await createTask(boardId, columnId, payload, selectedTags);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save the task");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (!task) return;
    setBusy(true);
    try {
      await deleteTask(task.id);
      onSaved();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not delete the task");
    } finally {
      setBusy(false);
    }
  }

  async function handleAddTag() {
    const name = newTag.trim();
    if (!name) return;
    try {
      const color = TAG_COLORS[tags.length % TAG_COLORS.length]!;
      const tag = await createTag(boardId, name, color);
      setSelectedTags((prev) => [...prev, tag.id]);
      setNewTag("");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the label");
    }
  }

  async function handleAddComment() {
    if (!task || !comment.trim()) return;
    await addComment(task.id, comment.trim());
    setComment("");
    queryClient.invalidateQueries({ queryKey: ["comments", task.id] });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-3xl sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{task ? "Edit task" : "New task"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Design the landing page"
              className="rounded-xl"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What needs to happen?"
              className="rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="due">Due date</Label>
              <Input
                id="due"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as Priority)}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Column</Label>
              <Select value={columnId} onValueChange={setColumnId}>
                <SelectTrigger className="rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {columns.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignees">Assignees</Label>
              <Input
                id="assignees"
                value={assignees}
                onChange={(e) => setAssignees(e.target.value)}
                placeholder="Ada, Grace"
                className="rounded-xl"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Labels</Label>
            <div className="flex flex-wrap gap-2">
              {tags.map((tag) => {
                const active = selectedTags.includes(tag.id);
                return (
                  <button
                    key={tag.id}
                    type="button"
                    onClick={() =>
                      setSelectedTags((prev) =>
                        active ? prev.filter((t) => t !== tag.id) : [...prev, tag.id],
                      )
                    }
                    className={cn(
                      "rounded-full px-3 py-1 text-xs font-medium transition",
                      tagClasses(tag.color),
                      active ? "ring-2 ring-primary ring-offset-1" : "opacity-70",
                    )}
                  >
                    {tag.name}
                  </button>
                );
              })}
            </div>
            <div className="flex gap-2">
              <Input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                placeholder="New label"
                className="rounded-xl"
              />
              <Button type="button" variant="outline" className="rounded-xl" onClick={handleAddTag}>
                Add
              </Button>
            </div>
          </div>

          {task && (
            <div className="space-y-2">
              <Label>Comments</Label>
              <div className="space-y-2">
                {comments.map((c) => (
                  <div key={c.id} className="rounded-xl bg-secondary px-3 py-2 text-sm">
                    {c.body}
                  </div>
                ))}
                {comments.length === 0 && (
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                )}
              </div>
              <div className="flex gap-2">
                <Input
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Add a comment"
                  className="rounded-xl"
                />
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-xl"
                  onClick={handleAddComment}
                >
                  Post
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="mt-2 gap-2 sm:justify-between">
          {task ? (
            <Button
              type="button"
              variant="ghost"
              className="rounded-xl text-destructive hover:text-destructive"
              onClick={handleDelete}
              disabled={busy}
            >
              <Trash2 className="mr-1 size-4" /> Delete
            </Button>
          ) : (
            <span />
          )}
          <Button type="button" className="rounded-xl" onClick={handleSave} disabled={busy}>
            {task ? "Save changes" : "Create task"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
