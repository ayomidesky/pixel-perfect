import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Sparkles, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { fetchChatMessages } from "@/lib/db";
import { sendChatMessage } from "@/lib/chat.functions";

interface Props {
  boardId: string;
  onBoardChanged: () => void;
}

export function ChatPanel({ boardId, onBoardChanged }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();
  const send = useServerFn(sendChatMessage);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["chat", boardId],
    queryFn: () => fetchChatMessages(boardId),
    enabled: open && !!boardId,
  });

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput("");
    setBusy(true);
    try {
      await send({ data: { boardId, message: text } });
      await queryClient.invalidateQueries({ queryKey: ["chat", boardId] });
      onBoardChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The assistant could not reply");
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <Button
        onClick={() => setOpen(true)}
        className="fixed bottom-6 right-6 z-40 h-14 rounded-2xl px-5 shadow-lg"
      >
        <Sparkles className="mr-2 size-5" /> Ask assistant
      </Button>
    );
  }

  return (
    <div className="fixed bottom-6 right-6 z-40 flex h-[32rem] w-[24rem] max-w-[calc(100vw-2rem)] flex-col rounded-3xl border border-border bg-card shadow-xl">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <Sparkles className="size-4 text-primary" />
        <span className="font-semibold">Board assistant</span>
        <Button
          size="icon"
          variant="ghost"
          className="ml-auto size-8 rounded-lg"
          onClick={() => setOpen(false)}
        >
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {messages.length === 0 && (
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>Try asking:</p>
            <p className="rounded-xl bg-secondary px-3 py-2">
              Add a task called "Design landing page" to To Do, due Friday
            </p>
            <p className="rounded-xl bg-secondary px-3 py-2">
              Move "Design landing page" to In Progress
            </p>
            <p className="rounded-xl bg-secondary px-3 py-2">What's still pending on this board?</p>
          </div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm",
              m.role === "user"
                ? "ml-auto bg-primary text-primary-foreground"
                : "bg-secondary text-secondary-foreground",
            )}
          >
            {m.content.split("\n").map((line, i) => (
              <p key={i} className={i > 0 ? "mt-1" : undefined}>
                {line.split(/(\*\*[^*]+\*\*)/g).map((part, j) =>
                  part.startsWith("**") && part.endsWith("**") ? (
                    <strong key={j}>{part.slice(2, -2)}</strong>
                  ) : (
                    <span key={j}>{part.replace(/\*/g, "")}</span>
                  ),
                )}
              </p>
            ))}
          </div>
        ))}
        {busy && <div className="text-sm text-muted-foreground">Thinking…</div>}
        <div ref={endRef} />
      </div>

      <form onSubmit={handleSend} className="flex gap-2 border-t border-border p-4">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask or tell the assistant…"
          className="rounded-xl"
        />
        <Button type="submit" size="icon" className="size-10 shrink-0 rounded-xl" disabled={busy}>
          <Send className="size-4" />
        </Button>
      </form>
    </div>
  );
}
