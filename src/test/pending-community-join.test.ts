import { beforeEach, describe, expect, it, vi } from "vitest";

const mockRpc = vi.fn();
const mockFrom = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: any[]) => mockRpc(...args),
    from: (...args: any[]) => mockFrom(...args),
  },
}));

describe("pendingCommunityJoin", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sessionStorage.clear();
  });

  it("completa o join pendente e limpa o sessionStorage", async () => {
    sessionStorage.setItem(
      "kivo_pending_community_join",
      JSON.stringify({
        communityId: "comm-1",
        communitySlug: "creatoracademyfree",
        displayName: "João",
        status: "ACTIVE",
      })
    );

    mockRpc.mockResolvedValue({ error: null });

    const { completePendingCommunityJoin, getPendingCommunityJoin } = await import("@/lib/pendingCommunityJoin");
    const result = await completePendingCommunityJoin("user-1");

    expect(mockRpc).toHaveBeenCalledWith("join_community", {
      p_community_id: "comm-1",
      p_user_id: "user-1",
      p_display_name: "João",
      p_role: "MEMBER",
      p_status: "ACTIVE",
    });
    expect(result).toEqual({ communitySlug: "creatoracademyfree", status: "ACTIVE" });
    expect(getPendingCommunityJoin()).toBeNull();
  });

  it("mantém o pending join quando o RPC falha", async () => {
    sessionStorage.setItem(
      "kivo_pending_community_join",
      JSON.stringify({
        communityId: "comm-1",
        communitySlug: "creatoracademyfree",
        displayName: "João",
        status: "ACTIVE",
      })
    );

    mockRpc.mockResolvedValue({ error: { message: "fk_violation" } });

    const { completePendingCommunityJoin, getPendingCommunityJoin } = await import("@/lib/pendingCommunityJoin");

    await expect(completePendingCommunityJoin("user-1")).rejects.toEqual({ message: "fk_violation" });
    expect(getPendingCommunityJoin()).not.toBeNull();
  });
});
