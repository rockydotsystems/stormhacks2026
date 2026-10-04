import { vi } from "vitest";

// Next.js provides the server-only runtime condition; Vitest runs outside Next.js.
vi.mock("server-only", () => ({}));

vi.mock("@stormhacks/data/organizations/workos", async () => {
  const { fakeWorkOS } = await import("./workos");
  const workos = fakeWorkOS();
  return { getWorkOS: () => workos };
});
