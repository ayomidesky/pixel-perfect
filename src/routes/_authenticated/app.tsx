import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  KanbanSquare,
  Plus,
  Folder,
  LogOut,
  MoreHorizontal,
} from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import {
  createBoard,
  deleteBoard,
  fetchBoardData,
  fetchBoards,
  renameBoard,
} from "@/lib/db";
import { Board } from "@/components/kanban/Board";
import { ChatPanel } from "@/components/kanban/ChatPanel";
import { useSession } from "@/hooks/useSession";

export const Route = createFileRoute("/_authenticated/app")({
  validateSearch: z.object({ board: z.string().optional() }),
  head: () => ({
    meta: [
      { title: "Your boards — Flowdeck" },
      { name: "description", content: "Plan, drag and track your tasks across projects." },
      { property: "og:title", content: "Your boards — Flowdeck" },
      { property: "og:description", content: "Plan, drag and track your tasks across projects." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: AppPage,
});

function AppPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const queryClient = useQueryClient();
  const { user } = useSession();
  const [creating, setCreating] = useState(false);

  const boardsQuery = useQuery({ queryKey: ["boards"], queryFn: fetchBoards });
  const boards = boardsQuery.data ?? [];
  const activeBoardId = search.board ?? boards[0]?.id ?? null;
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

  const boardDataQuery = useQuery({
    queryKey: ["board-data", activeBoardId],
    queryFn: () => fetchBoardData(activeBoardId!),
    enabled: !!activeBoardId,
  });

  useEffect(() => {
    if (!boardsQuery.isSuccess || boards.length > 0 || creating) return;
    setCreating(true);
    createBoard("My first project")
      .then(() => queryClient.invalidateQueries({ queryKey: ["boards"] }))
      .catch(() => toast.error("Could not create your first board"))
      .finally(() => setCreating(false));
  }, [boardsQuery.isSuccess, boards.length, creating, queryClient]);

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ["board-data", activeBoardId] });
    queryClient.invalidateQueries({ queryKey: ["boards"] });
  }

  async function handleNewBoard() {
    const name = window.prompt("Project name");
    if (!name?.trim()) return;
    const board = await createBoard(name.trim());
    await queryClient.invalidateQueries({ queryKey: ["boards"] });
    navigate({ to: "/app", search: { board: board.id } });
  }

  async function handleSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="flex h-screen bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-2 px-5 py-6">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KanbanSquare className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">Flowdeck</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="flex items-center justify-between px-5 pb-2">
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Projects
          </span>
          <Button size="icon" variant="ghost" className="size-7 rounded-lg" onClick={handleNewBoard}>
            <Plus className="size-4" />
          </Button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {boards.map((board) => (
            <div
              key={board.id}
              className={cn(
                "group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition",
                board.id === activeBoardId
                  ? "bg-secondary font-medium text-foreground"
                  : "text-muted-foreground hover:bg-secondary/60",
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 text-left"
                onClick={() => navigate({ to: "/app", search: { board: board.id } })}
              >
                <Folder className="size-4 shrink-0" />
                <span className="truncate">{board.name}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="opacity-0 transition group-hover:opacity-100"
                    aria-label="Project options"
                  >
                    <MoreHorizontal className="size-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="rounded-xl">
                  <DropdownMenuItem
                    onClick={async () => {
                      const name = window.prompt("Rename project", board.name);
                      if (name?.trim()) {
                        await renameBoard(board.id, name.trim());
                        queryClient.invalidateQueries({ queryKey: ["boards"] });
                      }
                    }}
                  >
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={async () => {
                      if (window.confirm(`Delete "${board.name}" and everything in it?`)) {
                        await deleteBoard(board.id);
                        await queryClient.invalidateQueries({ queryKey: ["boards"] });
                        navigate({ to: "/app", search: {} });
                      }
                    }}
                  >
                    Delete project
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          ))}
        </nav>

        <div className="border-t border-border p-3">
          <Button
            variant="ghost"
            className="w-full justify-start rounded-xl text-muted-foreground"
            onClick={handleSignOut}
          >
            <LogOut className="mr-2 size-4" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 overflow-hidden">
        {activeBoard && boardDataQuery.data ? (
          <Board
            boardId={activeBoard.id}
            boardName={activeBoard.name}
            data={boardDataQuery.data}
            onChanged={refresh}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            {boardsQuery.isLoading || creating ? "Loading your boards…" : "Create a project to begin."}
          </div>
        )}
      </main>

      {activeBoard && <ChatPanel boardId={activeBoard.id} onBoardChanged={refresh} />}
    </div>
  );
}
