import { Suspense, useState, useEffect, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback: ReactNode;
  timeoutMs?: number;
}

function TimeoutFallback({ fallback, timeoutMs = 12000 }: { fallback: ReactNode; timeoutMs?: number }) {
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(timer);
  }, [timeoutMs]);

  if (timedOut) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: 48,
          fontFamily: "Inter, system-ui, sans-serif",
          color: "#333",
          gap: 16,
        }}
      >
        <p style={{ fontSize: 14 }}>O carregamento está demorando mais que o esperado.</p>
        <button
          onClick={() => window.location.reload()}
          style={{
            padding: "8px 20px",
            borderRadius: 8,
            border: "1px solid #ddd",
            background: "#fff",
            fontWeight: 500,
            fontSize: 13,
            cursor: "pointer",
          }}
        >
          Recarregar página
        </button>
      </div>
    );
  }

  return <>{fallback}</>;
}

/**
 * Suspense wrapper with built-in timeout.
 * After timeoutMs (default 12s), shows an error state with reload action.
 */
export function SuspenseWithTimeout({ children, fallback, timeoutMs }: Props) {
  return (
    <Suspense fallback={<TimeoutFallback fallback={fallback} timeoutMs={timeoutMs} />}>
      {children}
    </Suspense>
  );
}
