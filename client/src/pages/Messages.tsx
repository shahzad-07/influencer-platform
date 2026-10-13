import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useAuth } from "../context/AuthContext";

interface ConversationItem {
  id: string;
  otherUser: { id: string; name: string };
  lastMessageText: string;
  lastMessageAt: string;
}

interface ChatMessage {
  id: string;
  sender: string;
  text: string;
  createdAt: string;
}

export default function Messages() {
  const { user } = useAuth();
  const { conversationId } = useParams<{ conversationId: string }>();

  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Add a message unless it's already there (the same message can arrive
  // twice: once from the socket and once from the REST response)
  const addMessage = useCallback((m: ChatMessage) => {
    setMessages((prev) =>
      prev.some((x) => x.id === m.id) ? prev : [...prev, m],
    );
  }, []);

  // Update a conversation's preview text and move it to the top of the list
  const bumpConversation = useCallback(
    (id: string, lastText: string, at: string) => {
      setConversations((prev) => {
        const target = prev.find((c) => c.id === id);
        if (!target) return prev;
        const updated = {
          ...target,
          lastMessageText: lastText.slice(0, 100),
          lastMessageAt: at,
        };
        return [updated, ...prev.filter((c) => c.id !== id)];
      });
    },
    [],
  );

  // Load my conversation list
  useEffect(() => {
    api<{ conversations: ConversationItem[] }>("/chat/conversations")
      .then((res) => setConversations(res.conversations))
      .catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not load conversations",
        ),
      );
  }, []);

  // Open the selected conversation: join its room, load history, listen for new messages
  useEffect(() => {
    if (!conversationId) {
      setMessages([]);
      return;
    }

    const socket = getSocket();
    let cancelled = false;
    setMessages([]);
    setError("");

    const joinAndLoad = () => {
      socket.emit(
        "conversation:join",
        conversationId,
        async (res: { ok: boolean; error?: string }) => {
          if (cancelled) return;
          if (!res.ok) {
            setError(res.error ?? "Could not open conversation");
            return;
          }
          try {
            const data = await api<{ messages: ChatMessage[] }>(
              `/chat/conversations/${conversationId}/messages`,
            );
            if (cancelled) return;
            // Merge so a message that arrived mid-load is not lost
            setMessages((prev) => {
              const ids = new Set(data.messages.map((m) => m.id));
              return [...data.messages, ...prev.filter((m) => !ids.has(m.id))];
            });
          } catch (err) {
            if (!cancelled)
              setError(
                err instanceof Error ? err.message : "Could not load messages",
              );
          }
        },
      );
    };

    const onMessage = (payload: {
      conversationId: string;
      message: ChatMessage;
    }) => {
      if (payload.conversationId !== conversationId) return;
      addMessage(payload.message);
      bumpConversation(
        conversationId,
        payload.message.text,
        payload.message.createdAt,
      );
    };

    socket.on("message:new", onMessage);
    socket.on("connect", joinAndLoad); // re-join after a dropped connection
    if (socket.connected) joinAndLoad();

    return () => {
      cancelled = true;
      socket.off("message:new", onMessage);
      socket.off("connect", joinAndLoad);
      socket.emit("conversation:leave", conversationId);
    };
  }, [conversationId, addMessage, bumpConversation]);

  // Keep the newest message in view
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSend(e: FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body || !conversationId) return;

    setSending(true);
    setError("");
    try {
      const res = await api<{ message: ChatMessage }>(
        `/chat/conversations/${conversationId}/messages`,
        { method: "POST", body: JSON.stringify({ text: body }) },
      );
      addMessage(res.message);
      bumpConversation(conversationId, res.message.text, res.message.createdAt);
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send message");
    } finally {
      setSending(false);
    }
  }

  const activeConversation = conversations.find((c) => c.id === conversationId);
  const dashboardPath = user?.role === "BRAND" ? "/brand" : "/influencer";

  return (
    <div style={{ maxWidth: 900, margin: "24px auto", padding: 16 }}>
      <p>
        <Link to={dashboardPath}>← Back to dashboard</Link>
      </p>
      <h1>Messages</h1>

      <div style={{ display: "flex", gap: 16, height: "65vh" }}>
        {/* Left: conversation list */}
        <div
          style={{
            width: 260,
            overflowY: "auto",
            borderRight: "1px solid #ccc",
            paddingRight: 8,
          }}
        >
          {conversations.length === 0 && (
            <p style={{ color: "gray" }}>No conversations yet.</p>
          )}
          {conversations.map((c) => (
            <Link
              key={c.id}
              to={`/messages/${c.id}`}
              style={{
                display: "block",
                padding: 8,
                marginBottom: 4,
                borderRadius: 6,
                textDecoration: "none",
                background: c.id === conversationId ? "#e8f0fe" : "transparent",
                color: "#222",
              }}
            >
              <strong>{c.otherUser.name}</strong>
              <div style={{ fontSize: 13, color: "gray" }}>
                {c.lastMessageText || "No messages yet"}
              </div>
            </Link>
          ))}
        </div>

        {/* Right: open chat */}
        <div
          style={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minWidth: 0,
          }}
        >
          {!conversationId ? (
            <p style={{ color: "gray" }}>
              Select a conversation to start chatting.
            </p>
          ) : (
            <>
              <h3 style={{ margin: "0 0 8px" }}>
                {activeConversation?.otherUser.name ?? "Chat"}
              </h3>

              <div
                style={{
                  flex: 1,
                  overflowY: "auto",
                  border: "1px solid #ccc",
                  borderRadius: 8,
                  padding: 8,
                }}
              >
                {messages.length === 0 && (
                  <p style={{ color: "gray" }}>No messages yet. Say hello!</p>
                )}
                {messages.map((m) => {
                  const mine = m.sender === user?.id;
                  return (
                    <div
                      key={m.id}
                      style={{
                        display: "flex",
                        justifyContent: mine ? "flex-end" : "flex-start",
                      }}
                    >
                      <div
                        style={{
                          maxWidth: "75%",
                          margin: "4px 0",
                          padding: "6px 10px",
                          borderRadius: 12,
                          background: mine ? "#d1e7ff" : "#eee",
                          color: "#222",
                          whiteSpace: "pre-wrap",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {m.text}
                        <div style={{ fontSize: 11, color: "gray" }}>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {error && (
                <p style={{ color: "crimson", margin: "8px 0 0" }}>{error}</p>
              )}

              <form
                onSubmit={handleSend}
                style={{ display: "flex", gap: 8, marginTop: 8 }}
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Type a message..."
                  maxLength={2000}
                  style={{ flex: 1 }}
                />
                <button type="submit" disabled={sending || !text.trim()}>
                  Send
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
