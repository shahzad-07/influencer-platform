import { useEffect, useState } from "react";

interface Props {
  // How long to wait before showing the note
  afterMs?: number;
}

// Render this only while a request is running. If the request is still going
// after a few seconds (for example while the free server wakes up), it shows
// a friendly note. Fast requests never show anything.
export default function SlowNotice({ afterMs = 3000 }: Props) {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), afterMs);
    return () => clearTimeout(timer);
  }, [afterMs]);

  if (!slow) return null;

  return (
    <p className="muted" role="status">
      Still working. The server may be waking up after a quiet period, so this
      can take up to a minute. Please don't close the page.
    </p>
  );
}
