import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
const m = vi.hoisted(()=>({v:vi.fn(),r:vi.fn()}));
vi.mock("@/lib/authVerification", async () => {
  const a = await vi.importActual<any>("@/lib/authVerification");
  return { ...a, verifyEmailCode: m.v, requestVerificationCode: m.r };
});
import EmailCodeVerificationModal from "@/components/auth/EmailCodeVerificationModal";
it("dbg", async () => {
  m.v.mockResolvedValue({ kind: "verified", next: "/x" });
  render(<EmailCodeVerificationModal open email="a@b.com" accountType="MEMBER" flowOrigin="circles" onVerified={vi.fn()} onUseAnotherEmail={vi.fn()} />);
  const inputs = screen.getAllByRole("textbox") as HTMLInputElement[];
  fireEvent.change(inputs[0], { target: { value: "1" } });
  console.log("after1", inputs.map(i=>i.value));
  fireEvent.change(inputs[1], { target: { value: "2" } });
  console.log("after2", inputs.map(i=>i.value));
  fireEvent.change(inputs[2], { target: { value: "3" } });
  fireEvent.change(inputs[3], { target: { value: "4" } });
  console.log("after4", inputs.map(i=>i.value), m.v.mock.calls.length);
});
