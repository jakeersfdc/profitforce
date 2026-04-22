"use client";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ background: "#040915", color: "#e6eef8", fontFamily: "system-ui", padding: 40, minHeight: "100vh" }}>
      <h1 style={{ color: "#ff6b6b" }}>Dashboard Error</h1>
      <pre style={{ color: "#ffa07a", whiteSpace: "pre-wrap", wordBreak: "break-all", maxWidth: "90vw", fontSize: 14 }}>
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
    </div>
  );
}
