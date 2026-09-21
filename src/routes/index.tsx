import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { KanbanSquare, Sparkles, Database, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Flowdeck — Kanban boards with an AI assistant" },
      {
        name: "description",
        content:
          "Plan your work on clean kanban boards, and let an AI assistant create, move and summarise your tasks. Everything saves to your account.",
      },
      { property: "og:title", content: "Flowdeck — Kanban boards with an AI assistant" },
      {
        property: "og:description",
        content: "Clean kanban boards with an AI assistant that manages your tasks for you.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Landing,
});

function Landing() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2">
          <span className="flex size-9 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <KanbanSquare className="size-5" />
          </span>
          <span className="text-lg font-semibold">Flowdeck</span>
        </div>
        <Button asChild className="rounded-xl">
          <Link to="/auth">Sign in</Link>
        </Button>
      </header>

      <main className="mx-auto max-w-6xl px-6 pb-24 pt-10">
        <section className="max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-foreground">
            <Sparkles className="size-3.5" /> Kanban with a built-in assistant
          </span>
          <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
            Your projects, organised the way you think.
          </h1>
          <p className="mt-5 max-w-xl text-lg text-muted-foreground">
            Drag tasks between columns, tag and schedule them, then ask the assistant to add, move
            or summarise anything on your board.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button asChild size="lg" className="rounded-xl">
              <Link to="/auth">Start free</Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="rounded-xl">
              <Link to="/auth">I already have an account</Link>
            </Button>
          </div>
        </section>

        <section className="mt-20 grid gap-5 sm:grid-cols-3">
          {[
            {
              icon: KanbanSquare,
              title: "Boards that move",
              body: "Multiple projects, custom columns, drag-and-drop cards with due dates, tags and assignees.",
            },
            {
              icon: Sparkles,
              title: "An assistant that acts",
              body: "Ask it to create a task, move one to In Progress, or summarise what's still pending.",
            },
            {
              icon: Database,
              title: "Saved for good",
              body: "Everything lives in your private account, so it's there on any device, days later.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-3xl border border-border bg-card p-6">
              <f.icon className="size-5 text-primary" />
              <h3 className="mt-4 text-base font-semibold">{f.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{f.body}</p>
            </div>
          ))}
        </section>

        <section className="mt-6 flex items-center gap-3 rounded-3xl border border-border bg-card p-6">
          <Search className="size-5 shrink-0 text-primary" />
          <p className="text-sm text-muted-foreground">
            Search and filter across every task you have ever created, including completed work from
            past months.
          </p>
        </section>
      </main>
    </div>
  );
}
