import { vi } from "vitest";

// Next.js provides the server-only runtime condition; Vitest runs outside Next.js.
vi.mock("server-only", () => ({}));
