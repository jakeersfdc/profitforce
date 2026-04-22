"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html>
      <body style={{ background: "#040915", color: "#e6eef8", fontFamily: "system-ui", padding: 40 }}>
        <h1>Something went wrong</h1>
        <pre style={{ color: "#ff6b6b", whiteSpace: "pre-wrap", wordBreak: "break-all", maxWidth: "90vw" }}>
          {error.message}
          {"\n\n"}
          {error.stack}
        </pre>
        <button
          onClick={reset}
          style={{ marginTop: 20, padding: "10px 20px", background: "#3b82f6", color: "white", border: "none", borderRadius: 8, cursor: "pointer" }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
