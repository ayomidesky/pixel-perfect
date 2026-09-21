import { supabase } from "@/integrations/supabase/client";

export type Priority = "low" | "medium" | "high" | "urgent";

export interface Board {
  id: string;
  name: string;
  description: string | null;
  position: number;
}

export interface BoardColumn {
  id: string;
  board_id: string;
  name: string;
  position: number;
}

export interface Tag {
  id: string;
  board_id: string;
  name: string;
  color: string;
}

export interface Task {
  id: string;
  board_id: string;
  column_id: string;
  title: string;
  description: string | null;
  due_date: string | null;
  priority: Priority;
  assignees: string[];
  completed: boolean;
  position: number;
  created_at: string;
  tagIds: string[];
}

export interface BoardData {
  columns: BoardColumn[];
  tasks: Task[];
  tags: Tag[];
}

async function uid(): Promise<string> {
  const { data } = await supabase.auth.getUser();
  if (!data.user) throw new Error("Not signed in");
  return data.user.id;
}

function unwrap<T>(res: { data: T | null; error: { message: string } | null }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

export async function fetchBoards(): Promise<Board[]> {
  const res = await supabase
    .from("boards")
    .select("id,name,description,position")
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  return unwrap(res) as Board[];
}

export async function createBoard(name: string, withDefaults = true): Promise<Board> {
  const user_id = await uid();
  const existing = await fetchBoards();
  const board = unwrap(
    await supabase
      .from("boards")
      .insert({ name, user_id, position: existing.length })
      .select("id,name,description,position")
      .single(),
  ) as Board;

  if (withDefaults) {
    const defaults = ["To Do", "In Progress", "Done"];
    unwrap(
      await supabase
        .from("board_columns")
        .insert(
          defaults.map((n, i) => ({ name: n, position: i, board_id: board.id, user_id })),
        )
        .select("id"),
    );
  }
  return board;
}

export async function renameBoard(id: string, name: string) {
  unwrap(await supabase.from("boards").update({ name }).eq("id", id).select("id"));
}

export async function deleteBoard(id: string) {
  const { error } = await supabase.from("boards").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function fetchBoardData(boardId: string): Promise<BoardData> {
  const [columnsRes, tasksRes, tagsRes, taskTagsRes] = await Promise.all([
    supabase
      .from("board_columns")
      .select("id,board_id,name,position")
      .eq("board_id", boardId)
      .order("position"),
    supabase
      .from("tasks")
      .select(
        "id,board_id,column_id,title,description,due_date,priority,assignees,completed,position,created_at",
      )
      .eq("board_id", boardId)
      .order("position"),
    supabase.from("tags").select("id,board_id,name,color").eq("board_id", boardId).order("name"),
    supabase.from("task_tags").select("task_id,tag_id"),
  ]);

  const columns = unwrap(columnsRes) as BoardColumn[];
  const rawTasks = unwrap(tasksRes) as Omit<Task, "tagIds">[];
  const tags = unwrap(tagsRes) as Tag[];
  const links = unwrap(taskTagsRes) as { task_id: string; tag_id: string }[];

  const tasks: Task[] = rawTasks.map((t) => ({
    ...t,
    assignees: t.assignees ?? [],
    tagIds: links.filter((l) => l.task_id === t.id).map((l) => l.tag_id),
  }));

  return { columns, tasks, tags };
}

export async function createColumn(boardId: string, name: string, position: number) {
  const user_id = await uid();
  unwrap(
    await supabase
      .from("board_columns")
      .insert({ board_id: boardId, name, position, user_id })
      .select("id"),
  );
}

export async function renameColumn(id: string, name: string) {
  unwrap(await supabase.from("board_columns").update({ name }).eq("id", id).select("id"));
}

export async function deleteColumn(id: string) {
  const { error } = await supabase.from("board_columns").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function reorderColumns(ordered: BoardColumn[]) {
  await Promise.all(
    ordered.map((c, i) => supabase.from("board_columns").update({ position: i }).eq("id", c.id)),
  );
}

export interface TaskInput {
  title: string;
  description?: string | null;
  due_date?: string | null;
  priority?: Priority;
  assignees?: string[];
  completed?: boolean;
  column_id?: string;
}

export async function createTask(
  boardId: string,
  columnId: string,
  input: TaskInput,
  tagIds: string[] = [],
  position = 0,
) {
  const user_id = await uid();
  const task = unwrap(
    await supabase
      .from("tasks")
      .insert({
        board_id: boardId,
        column_id: columnId,
        user_id,
        title: input.title,
        description: input.description ?? null,
        due_date: input.due_date ?? null,
        priority: input.priority ?? "medium",
        assignees: input.assignees ?? [],
        position,
      })
      .select("id")
      .single(),
  ) as { id: string };

  if (tagIds.length) {
    unwrap(
      await supabase
        .from("task_tags")
        .insert(tagIds.map((tag_id) => ({ task_id: task.id, tag_id, user_id })))
        .select("tag_id"),
    );
  }
  return task.id;
}

export async function updateTask(id: string, input: TaskInput, tagIds?: string[]) {
  const user_id = await uid();
  unwrap(await supabase.from("tasks").update(input).eq("id", id).select("id"));
  if (tagIds) {
    const { error } = await supabase.from("task_tags").delete().eq("task_id", id);
    if (error) throw new Error(error.message);
    if (tagIds.length) {
      unwrap(
        await supabase
          .from("task_tags")
          .insert(tagIds.map((tag_id) => ({ task_id: id, tag_id, user_id })))
          .select("tag_id"),
      );
    }
  }
}

export async function deleteTask(id: string) {
  const { error } = await supabase.from("tasks").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function persistTaskOrder(tasks: { id: string; column_id: string; position: number }[]) {
  await Promise.all(
    tasks.map((t) =>
      supabase.from("tasks").update({ column_id: t.column_id, position: t.position }).eq("id", t.id),
    ),
  );
}

export async function createTag(boardId: string, name: string, color: string) {
  const user_id = await uid();
  return unwrap(
    await supabase
      .from("tags")
      .insert({ board_id: boardId, name, color, user_id })
      .select("id,board_id,name,color")
      .single(),
  ) as Tag;
}

export async function deleteTag(id: string) {
  const { error } = await supabase.from("tags").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export interface Comment {
  id: string;
  task_id: string;
  body: string;
  created_at: string;
}

export async function fetchComments(taskId: string): Promise<Comment[]> {
  return unwrap(
    await supabase
      .from("comments")
      .select("id,task_id,body,created_at")
      .eq("task_id", taskId)
      .order("created_at"),
  ) as Comment[];
}

export async function addComment(taskId: string, body: string) {
  const user_id = await uid();
  unwrap(
    await supabase.from("comments").insert({ task_id: taskId, body, user_id }).select("id"),
  );
}

export interface ChatMessage {
  id: string;
  role: string;
  content: string;
  created_at: string;
}

export async function fetchChatMessages(boardId: string): Promise<ChatMessage[]> {
  return unwrap(
    await supabase
      .from("chat_messages")
      .select("id,role,content,created_at")
      .eq("board_id", boardId)
      .order("created_at"),
  ) as ChatMessage[];
}
