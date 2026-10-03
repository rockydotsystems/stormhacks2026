import { describe, expect, it, vi } from "vitest";
import { container } from "@/server/container";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));

describe("request scopes", () => {
  it("reuses services inside a request, but not across requests", async () => {
    const first = container.createScope();
    const second = container.createScope();
    expect(first.cradle.authService).toBe(first.cradle.authService);
    expect(first.cradle.authService).not.toBe(second.cradle.authService);
    // Compare identity without asking the assertion library to inspect the DI proxy.
    expect(first.cradle.notesController === second.cradle.notesController).toBe(
      false,
    );
    await Promise.all([first.dispose(), second.dispose()]);
  });
});
