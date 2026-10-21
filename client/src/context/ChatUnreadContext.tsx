import { createContext, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useAuth } from "./AuthContext";
import { api } from "../lib/api";
import { getSocket } from "../lib/socket";

const ChatUnreadContext = createContext<number | null>(null);

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [unreadTotal, setUnreadTotal] = useState(0);

  useEffect(() => {
    if (!user) {
      setUnreadTotal(0);
      return;
    }

    let cancelled = false;
    const refreshUnreadTotal = async () => {
      try {
        const response = await api<{ unreadTotal: number }>(
          "/chat/conversations",
        );
        if (!cancelled) {
          setUnreadTotal(
            Number.isInteger(response.unreadTotal)
              ? Math.max(0, response.unreadTotal)
              : 0,
          );
        }
      } catch {
        // Keep the last known count if a temporary request fails.
      }
    };

    const socket = getSocket();
    socket.on("chat:changed", refreshUnreadTotal);
    socket.on("connect", refreshUnreadTotal);
    void refreshUnreadTotal();

    return () => {
      cancelled = true;
      socket.off("chat:changed", refreshUnreadTotal);
      socket.off("connect", refreshUnreadTotal);
    };
  }, [user?.id]);

  return (
    <ChatUnreadContext.Provider value={unreadTotal}>
      {children}
    </ChatUnreadContext.Provider>
  );
}

export function useChatUnread() {
  const unreadTotal = useContext(ChatUnreadContext);
  if (unreadTotal === null) {
    throw new Error("useChatUnread must be used inside <ChatUnreadProvider>");
  }
  return unreadTotal;
}
