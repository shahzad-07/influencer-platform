import AppLayout from "../components/AppLayout";
import NotificationFeed from "../components/NotificationFeed";

export default function Notifications() {
  return (
    <AppLayout>
      <section className="notifications-page card" aria-label="Notifications">
        <NotificationFeed />
      </section>
    </AppLayout>
  );
}
