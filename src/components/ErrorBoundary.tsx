import { Component, type ReactNode, type ErrorInfo } from "react";
import { reportAppError } from "@/lib/reportAppError";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global React ErrorBoundary.
 * Catches any render / lifecycle error and shows a friendly recovery UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    reportAppError({
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack ?? undefined,
      context: "ErrorBoundary",
    });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoHome = () => {
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            minHeight: "100vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px",
            fontFamily: "Inter, system-ui, sans-serif",
            background: "#fafafa",
            color: "#111",
          }}
        >
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
            <h1 style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
              Algo deu errado ao carregar o app
            </h1>
            <p style={{ fontSize: 14, color: "#666", marginBottom: 24, lineHeight: 1.5 }}>
              Ocorreu um erro inesperado. Tente recarregar a página.
            </p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "none",
                  background: "#111",
                  color: "#fff",
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Tentar novamente
              </button>
              <button
                onClick={this.handleGoHome}
                style={{
                  padding: "10px 24px",
                  borderRadius: 8,
                  border: "1px solid #ddd",
                  background: "#fff",
                  color: "#333",
                  fontWeight: 500,
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                Voltar para início
              </button>
            </div>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <pre
                style={{
                  marginTop: 24,
                  padding: 16,
                  background: "#f5f5f5",
                  borderRadius: 8,
                  fontSize: 11,
                  textAlign: "left",
                  overflow: "auto",
                  maxHeight: 200,
                  color: "#c00",
                }}
              >
                {this.state.error.message}
                {"\n"}
                {this.state.error.stack}
              </pre>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
