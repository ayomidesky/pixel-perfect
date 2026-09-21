import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const inputSchema = z.object({
  boardId: z.string().uuid(),
  message: z.string().min(1).max(4000),
});

const MODEL = "google/gemini-3.8-flash";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

type ChatMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: unknown;
  tool_call_id?: string;
};

const tools = [
  {
    type: "function",
    function: {
      name: "create_task",
      description: "Create a new task on the current board.",
      parameters: {
        type: "object",
        properties: {
          title: { type: "string" },
          description: { type: "string" },
          column: { type: "string", description: "Column name, e.g. 'To Do'" },
          due_date: { type: "string", description: "ISO date YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          assignees: { type: "array", items: { type: "string" } },
        },
        required: ["title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "update_task",
      description: "Update an existing task on the current board, found by its title.",
      parameters: {
        type: "object",
        properties: {
          task_title: { type: "string" },
          new_title: { type: "string" },
          description: { type: "string" },
          column: { type: "string", description: "Move the task to this column name" },
          due_date: { type: "string", description: "ISO date YYYY-MM-DD" },
          priority: { type: "string", enum: ["low", "medium", "high", "urgent"] },
          completed: { type: "boolean" },
        },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "delete_task",
      description: "Delete a task on the current board by title.",
      parameters: {
        type: "object",
        properties: { task_title: { type: "string" } },
        required: ["task_title"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_tasks",
      description:
        "Search the user's tasks across all boards, including historical and completed tasks.",
      parameters: {
        type: "object",
        properties: {
          query: { type: "string" },
          due_before: { type: "string", description: "ISO date" },
          due_after: { type: "string", description: "ISO date" },
          completed: { type: "boolean" },
        },
      },
    },
  },
];

export const sendChatMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => inputSchema.parse(data))
  .handler(async ({ data, context }) => {
    const apiKey = process.env["LOVABLE_API_KEY"];
    if (!apiKey) throw new Error("AI is not configured yet.");

    const supabase = context.supabase;
    const userId = context.userId;
    const { boardId, message } = data;

    const { data: board } = await supabase
      .from("boards")
      .select("id,name")
      .eq("id", boardId)
      .single();
    if (!board) throw new Error("Board not found");

    const loadState = async () => {
      const [{ data: columns }, { data: tasks }] = await Promise.all([
        supabase.from("board_columns").select("id,name,position").eq("board_id", boardId).order("position"),
        supabase
          .from("tasks")
          .select("id,title,description,due_date,priority,completed,column_id,assignees,position")
          .eq("board_id", boardId)
          .order("position"),
      ]);
      return { columns: columns ?? [], tasks: tasks ?? [] };
    };

    const state = await loadState();
    const colName = (id: string) => state.columns.find((c) => c.id === id)?.name ?? "?";

    const history = await supabase
      .from("chat_messages")
      .select("role,content")
      .eq("board_id", boardId)
      .order("created_at", { ascending: false })
      .limit(12);

    const priorHistory = (history.data ?? [])
      .reverse()
      .map((m) => ({ role: m.role as "user" | "assistant", content: m.content }));

    await supabase
      .from("chat_messages")
      .insert({ user_id: userId, board_id: boardId, role: "user", content: message });

    const today = new Date().toISOString().slice(0, 10);
    const systemPrompt = [
      `You are the assistant inside a personal Kanban app. Today is ${today}.`,
      `Current board: "${board.name}".`,
      `Columns: ${state.columns.map((c) => c.name).join(", ") || "none"}.`,
      `Tasks on this board:`,
      state.tasks.length
        ? state.tasks
            .map(
              (t) =>
                `- "${t.title}" [${colName(t.column_id)}] priority=${t.priority} due=${t.due_date ?? "none"} done=${t.completed}`,
            )
            .join("\n")
        : "- (no tasks yet)",
      `Use the tools to create, update, move or delete tasks when the user asks. Answer concisely in plain language. When summarising, group by column.`,
    ].join("\n");

    const messages: ChatMsg[] = [
      { role: "system", content: systemPrompt },
      ...priorHistory,
      { role: "user", content: message },
    ];

    const runTool = async (name: string, args: Record<string, unknown>): Promise<string> => {
      const fresh = await loadState();
      const findTask = (title: string) => {
        const lower = String(title).toLowerCase();
        return (
          fresh.tasks.find((t) => t.title.toLowerCase() === lower) ??
          fresh.tasks.find((t) => t.title.toLowerCase().includes(lower))
        );
      };
      const findColumn = (name2: string) => {
        const lower = String(name2).toLowerCase();
        return (
          fresh.columns.find((c) => c.name.toLowerCase() === lower) ??
          fresh.columns.find((c) => c.name.toLowerCase().includes(lower))
        );
      };

      if (name === "create_task") {
        const column = args["column"] ? findColumn(String(args["column"])) : fresh.columns[0];
        if (!column) return "No column available to add the task to.";
        const position = fresh.tasks.filter((t) => t.column_id === column.id).length;
        const { error } = await supabase.from("tasks").insert({
          board_id: boardId,
          column_id: column.id,
          user_id: userId,
          title: String(args["title"]),
          description: (args["description"] as string) ?? null,
          due_date: (args["due_date"] as string) ?? null,
          priority: (args["priority"] as string) ?? "medium",
          assignees: (args["assignees"] as string[]) ?? [],
          position,
        });
        return error ? `Error: ${error.message}` : `Created "${args["title"]}" in ${column.name}.`;
      }

      if (name === "update_task") {
        const task = findTask(String(args["task_title"]));
        if (!task) return `No task matching "${args["task_title"]}".`;
        const patch: Record<string, unknown> = {};
        if (args["new_title"]) patch["title"] = args["new_title"];
        if (args["description"] !== undefined) patch["description"] = args["description"];
        if (args["due_date"] !== undefined) patch["due_date"] = args["due_date"];
        if (args["priority"]) patch["priority"] = args["priority"];
        if (args["completed"] !== undefined) patch["completed"] = args["completed"];
        if (args["column"]) {
          const column = findColumn(String(args["column"]));
          if (!column) return `No column named "${args["column"]}".`;
          patch["column_id"] = column.id;
          patch["position"] = fresh.tasks.filter((t) => t.column_id === column.id).length;
        }
        const { error } = await supabase.from("tasks").update(patch).eq("id", task.id);
        return error ? `Error: ${error.message}` : `Updated "${task.title}".`;
      }

      if (name === "delete_task") {
        const task = findTask(String(args["task_title"]));
        if (!task) return `No task matching "${args["task_title"]}".`;
        const { error } = await supabase.from("tasks").delete().eq("id", task.id);
        return error ? `Error: ${error.message}` : `Deleted "${task.title}".`;
      }

      if (name === "search_tasks") {
        let q = supabase
          .from("tasks")
          .select("title,due_date,priority,completed,board_id,column_id")
          .limit(50);
        if (args["query"]) q = q.ilike("title", `%${String(args["query"])}%`);
        if (args["due_before"]) q = q.lte("due_date", String(args["due_before"]));
        if (args["due_after"]) q = q.gte("due_date", String(args["due_after"]));
        if (args["completed"] !== undefined) q = q.eq("completed", Boolean(args["completed"]));
        const { data: rows, error } = await q;
        if (error) return `Error: ${error.message}`;
        return JSON.stringify(rows ?? []);
      }

      return "Unknown tool.";
    };

    let reply = "";
    for (let step = 0; step < 5; step++) {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ model: MODEL, messages, tools }),
      });

      if (res.status === 429) throw new Error("The assistant is busy right now. Try again shortly.");
      if (res.status === 402) throw new Error("AI credits are exhausted. Please top up to continue.");
      if (!res.ok) throw new Error(`Assistant error (${res.status}).`);

      const json = (await res.json()) as {
        choices: {
          message: {
            content: string | null;
            tool_calls?: { id: string; function: { name: string; arguments: string } }[];
          };
        }[];
      };
      const choice = json.choices?.[0]?.message;
      if (!choice) throw new Error("Empty response from assistant.");

      if (choice.tool_calls?.length) {
        messages.push({ role: "assistant", content: choice.content ?? "", tool_calls: choice.tool_calls });
        for (const call of choice.tool_calls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(call.function.arguments || "{}");
          } catch {
            args = {};
          }
          const result = await runTool(call.function.name, args);
          messages.push({ role: "tool", tool_call_id: call.id, content: result });
        }
        continue;
      }

      reply = choice.content ?? "";
      break;
    }

    if (!reply) reply = "Done.";

    await supabase
      .from("chat_messages")
      .insert({ user_id: userId, board_id: boardId, role: "assistant", content: reply });

    return { reply };
  });
