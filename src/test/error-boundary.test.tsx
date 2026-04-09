import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ErrorBoundary } from "@/components/ErrorBoundary";

function ThrowingComponent({ error }: { error?: Error }) {
  if (error) throw error;
  return <div>OK</div>;
}

describe("ErrorBoundary", () => {
  it("renders children when no error", () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("renders fallback UI when child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error("boom")} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Algo deu errado ao carregar o app")).toBeInTheDocument();
    expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
    expect(screen.getByText("Voltar para início")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("renders route-level fallback when isRouteLevel", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    render(
      <ErrorBoundary isRouteLevel>
        <ThrowingComponent error={new Error("page boom")} />
      </ErrorBoundary>
    );
    expect(screen.getByText("Erro ao carregar esta página")).toBeInTheDocument();
    expect(screen.getByText("Tentar novamente")).toBeInTheDocument();
    expect(screen.getByText("Voltar ao início")).toBeInTheDocument();
    consoleSpy.mockRestore();
  });

  it("reload button calls window.location.reload", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const reloadMock = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadMock, pathname: "/test" },
      writable: true,
    });

    render(
      <ErrorBoundary>
        <ThrowingComponent error={new Error("test")} />
      </ErrorBoundary>
    );
    fireEvent.click(screen.getByText("Tentar novamente"));
    expect(reloadMock).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });
});
