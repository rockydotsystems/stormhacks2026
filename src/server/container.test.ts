import { describe, expect, it, vi } from "vitest";
import { container } from "@/server/container";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));

describe("request scopes", () => {
  it("reuses services inside a request, but not across requests", async () => {
    const first = container.createScope();
    const second = container.createScope();
    expect(first.cradle.authService).toBe(first.cradle.authService);
    expect(first.cradle.authService).not.toBe(second.cradle.authService);
    expect(first.cradle.docsService).toBe(first.cradle.docsService);
    expect(first.cradle.docsService === second.cradle.docsService).toBe(false);
    expect(first.cradle.projectsService).toBe(first.cradle.projectsService);
    expect(first.cradle.projectsService === second.cradle.projectsService).toBe(
      false,
    );
    expect(
      first.cradle.organizationsService === second.cradle.organizationsService,
    ).toBe(false);
    // Compare identity without asking the assertion library to inspect the DI proxy.
    expect(first.cradle.notesController === second.cradle.notesController).toBe(
      false,
    );
    await Promise.all([first.dispose(), second.dispose()]);
  });

  it("shares the stateless model adapter across requests", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "k");
    vi.stubEnv("OPENROUTER_MODEL", "google/gemini-3.8-flash");
    const first = container.createScope();
    const second = container.createScope();
    expect(first.cradle.model === second.cradle.model).toBe(true);
    await Promise.all([first.dispose(), second.dispose()]);
    vi.unstubAllEnvs();
  });
});
