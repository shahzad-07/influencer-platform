import type { ReactNode } from "react";
import SiteHeader from "./SiteHeader";
import MobileTabBar from "./MobileTabBar";
import { ChatUnreadProvider } from "../context/ChatUnreadContext";

// The frame for every logged-in page: header on top, tab bar at the bottom on phones
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <ChatUnreadProvider>
      <div className="app has-tabbar">
        <SiteHeader />
        <main className="page">{children}</main>
        <MobileTabBar />
      </div>
    </ChatUnreadProvider>
  );
}
