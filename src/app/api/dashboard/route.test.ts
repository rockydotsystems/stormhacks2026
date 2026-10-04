import { asValue } from "awilix";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import {
  GET as getDocument,
  POST as postDocument,
} from "../documents/[id]/route";
import { container } from "@/server/container";
import { ApiError } from "@/server/errors";
vi.mock("@workos-inc/authkit-nextjs", () => ({ getWorkOS: vi.fn() }));
const requireUser = vi.fn();
const list = vi.fn();
const create = vi.fn();
const organizationId = "11111111-1111-4111-8111-111111111111";
const docId = "22222222-2222-4222-8222-222222222222";
const context = { params: Promise.resolve({ id: docId }) };
const request = (body: unknown) =>
  new Request("http://localhost/api/dashboard", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
describe("dashboard API authorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    container.register({
      authService: asValue({ requireUser }),
      organizationsService: asValue({ list, create }),
    });
    requireUser.mockResolvedValue({ id: "authenticated-user" });
  });
  it("rejects all dashboard and document operations before resolving the database", async () => {
    requireUser.mockRejectedValue(new ApiError(401, "Sign in to continue."));
    container.register({ db: asValue(undefined) });
    const responses = await Promise.all([
      GET(new Request("http://localhost/api/dashboard")),
      POST(request({ action: "createOrganization", name: "Team" })),
      getDocument(
        new Request(
          `http://localhost/api/documents/${docId}?organizationId=${organizationId}`,
        ),
        context,
      ),
      postDocument(
        request({
          action: "save",
          organizationId,
          title: "Title",
          content: "",
        }),
        context,
      ),
    ]);
    for (const response of responses) {
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: "Sign in to continue." });
    }
    expect(list).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });
  it("uses the authenticated identity when creating an organization", async () => {
    create.mockResolvedValue({ id: organizationId, name: "Team" });
    const response = await POST(
      request({
        action: "createOrganization",
        name: " Team ",
        userId: "forged-user",
      }),
    );
    expect(create).toHaveBeenCalledWith("authenticated-user", "Team");
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("reports malformed JSON and input as 400", async () => {
    expect(
      (await POST(request({ action: "createOrganization", name: " " }))).status,
    ).toBe(400);
    expect(
      (
        await POST(
          new Request("http://localhost/api/dashboard", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{",
          }),
        )
      ).status,
    ).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
