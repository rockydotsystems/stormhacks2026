import { asValue } from "awilix";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "@/app/api/notes/route";
import { container } from "@/server/container";
import { ApiError } from "@/server/errors";
import { NotesService } from "@/features/notes/server/notes.service";
import { AuthService } from "@/features/auth/server/auth.service";

vi.mock("@workos-inc/authkit-nextjs", () => ({ withAuth: vi.fn() }));

const requireUser = vi.fn<AuthService["requireUser"]>();
const list = vi.fn<NotesService["list"]>();
const create = vi.fn<NotesService["create"]>();

function post(body: string, contentType = "application/json") {
  return POST(
    new Request("http://localhost:3000/api/notes", {
      method: "POST",
      headers: { "Content-Type": contentType },
      body,
    }),
  );
}

describe("notes API through the request-scoped DI container", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const authService = new AuthService();
    authService.requireUser = requireUser;
    const notesService = new NotesService({ db: {} as never });
    notesService.list = list;
    notesService.create = create;
    container.register({
      authService: asValue(authService),
      notesService: asValue(notesService),
    });
    requireUser.mockResolvedValue({
      id: "user-a",
      email: "a@example.com",
      firstName: null,
      lastName: null,
      profilePictureUrl: null,
    });
  });

  it("blocks reads and writes before touching the database", async () => {
    requireUser.mockRejectedValue(new ApiError(401, "Sign in to continue."));
    const responses = await Promise.all([GET(), post('{"content":"hello"}')]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Sign in to continue." });
    }
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("lists only for the authenticated identity and disables response caching", async () => {
    list.mockResolvedValue([
      {
        id: "note-1",
        content: "A private idea",
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
    const response = await GET();
    expect(list).toHaveBeenCalledWith("user-a");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual([
      {
        id: "note-1",
        content: "A private idea",
        createdAt: "2026-10-03T00:00:00.000Z",
      },
    ]);
  });

  it("trims content and ignores a forged owner ID", async () => {
    create.mockResolvedValue({
      id: "new-note",
      content: "hello",
      createdAt: "2026-10-03T00:00:00.000Z",
    });
    const response = await post('{"content":"  hello  ","ownerId":"user-b"}');
    expect(response.status).toBe(201);
    expect(create).toHaveBeenCalledWith("user-a", { content: "hello" });
    expect(await response.json()).toEqual({
      id: "new-note",
      content: "hello",
      createdAt: "2026-10-03T00:00:00.000Z",
    });
  });

  it.each([
    "{",
    '{"content":"   "}',
    '{"content":42}',
    JSON.stringify({ content: "x".repeat(2001) }),
  ])("returns 400 for invalid input without writing: %s", async (body) => {
    expect((await post(body)).status).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });

  it("accepts the maximum content length", async () => {
    const content = "x".repeat(2000);
    create.mockResolvedValue({
      id: "boundary",
      content,
      createdAt: "2026-10-03T00:00:00.000Z",
    });
    expect((await post(JSON.stringify({ content }))).status).toBe(201);
    expect(create).toHaveBeenCalledWith("user-a", { content });
  });

  it("rejects non-JSON writes, including cross-site HTML form payloads", async () => {
    expect((await post('{"content":"hello"}', "text/plain")).status).toBe(415);
    expect(create).not.toHaveBeenCalled();
  });

  it("does not expose unexpected internal errors", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    list.mockRejectedValue(new Error("private database details"));
    const response = await GET();
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: "Internal server error." });
    log.mockRestore();
  });
});
