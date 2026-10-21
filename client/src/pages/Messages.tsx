import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";
import { useAuth } from "../context/AuthContext";
import AppLayout from "../components/AppLayout";

interface ConversationItem {
  id: string;
  otherUser: { id: string; name: string };
  lastMessageText: string;
  lastMessageAt: string;
  unreadCount: number;
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

  // Reading a conversation clears only its own unread count on the server.
  const markConversationRead = useCallback(async (id: string) => {
    await api<{ readAt: string }>(`/chat/conversations/${id}/read`, {
      method: "PATCH",
    });
    setConversations((prev) =>
      prev.map((conversation) =>
        conversation.id === id
          ? { ...conversation, unreadCount: 0 }
          : conversation,
      ),
    );
  }, []);

  // Load my conversation list
  useEffect(() => {
    api<{ conversations: ConversationItem[]; unreadTotal: number }>(
      "/chat/conversations",
    )
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
            await markConversationRead(conversationId);
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
      void markConversationRead(conversationId).catch((err) =>
        setError(
          err instanceof Error ? err.message : "Could not mark conversation read",
        ),
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
  }, [conversationId, addMessage, bumpConversation, markConversationRead]);

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
  const isBrand = user?.role === "BRAND";

  return (
    <AppLayout>
      <div className={conversationId ? "chat-wrap chat-open" : "chat-wrap"}>
        <h1 className="chat-title">Messages</h1>

        <div className="chat">
          {/* Conversation list */}
          <aside className="chat-list">
            {conversations.length === 0 && (
              <div className="chat-empty">
                <p className="muted">No conversations yet.</p>
                <p>
                  <Link
                    to={isBrand ? "/brand/influencers" : "/influencer/brands"}
                  >
                    {isBrand ? "Find a creator" : "Find a brand"}
                  </Link>{" "}
                  to start one.
                </p>
              </div>
            )}
            {conversations.map((c) => (
              <Link
                key={c.id}
                to={`/messages/${c.id}`}
                className={
                  [
                    "chat-item",
                    c.id === conversationId ? "active" : "",
                    c.unreadCount > 0 ? "unread" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")
                }
              >
                <span className="chat-item-title">
                  <strong>{c.otherUser.name}</strong>
                  {c.unreadCount > 0 && (
                    <span
                      className="chat-unread-count"
                      aria-label={`${c.unreadCount} unread messages`}
                    >
                      {c.unreadCount}
                    </span>
                  )}
                </span>
                <small>{c.lastMessageText || "No messages yet"}</small>
              </Link>
            ))}
          </aside>

          {/* Open chat */}
          <section className="chat-pane">
            {!conversationId ? (
              <p className="muted chat-empty">
                Select a conversation to start chatting.
              </p>
            ) : (
              <>
                <div className="chat-head">
                  <Link className="chat-back" to="/messages">
                    All chats
                  </Link>
                  <h2>{activeConversation?.otherUser.name ?? "Chat"}</h2>
                </div>

                <div className="chat-log">
                  {messages.length === 0 && (
                    <p className="muted">No messages yet. Say hello!</p>
                  )}
                  {messages.map((m) => {
                    const mine = m.sender === user?.id;
                    return (
                      <div
                        key={m.id}
                        className={mine ? "bubble mine" : "bubble"}
                      >
                        {m.text}
                        <time dateTime={m.createdAt}>
                          {new Date(m.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    );
                  })}
                  <div ref={bottomRef} />
                </div>

                {error && (
                  <p className="alert" role="alert">
                    {error}
                  </p>
                )}

                <form className="chat-form" onSubmit={handleSend}>
                  <input
                    className="input"
                    aria-label="Message"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Type a message..."
                    maxLength={2000}
                  />
                  <button
                    className="btn btn-primary"
                    type="submit"
                    disabled={sending || !text.trim()}
                  >
                    Send
                  </button>
                </form>
              </>
            )}
          </section>
        </div>
      </div>
    </AppLayout>
  );
}
