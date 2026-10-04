import { describe, expect, it } from "vitest";
import type {
  AgentTurnInput,
  TurnAnalysis,
} from "@/features/planning/contracts";
import type { CodebasePort } from "@/features/planning/server/codebase";
import { FakeModel } from "@/features/planning/server/fake.model";
import type {
  ModelRequest,
  ObjectRequest,
} from "@/features/planning/server/model";
import { PlanningService } from "@/features/planning/server/planning.service";

const FINDINGS = "acme/api src/auth/session.ts keeps sessions in cookies.";

function analysis(): TurnAnalysis {
  return {
    reply: "Which store?",
    questions: [{ text: "Which store?", suggestions: [] }],
    checklist: [],
    userSignal: "continue",
  };
}

function codebase(): CodebasePort & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    repositories: () => ["acme/api", "acme/web"],
    tree: async (repository, path) => {
      calls.push(`tree ${repository} ${path ?? ""}`);
      return "src/";
    },
    readFile: async (repository, path) => {
      calls.push(`read ${repository} ${path}`);
      return "file text";
    },
    search: async (repository, query) => {
      calls.push(`search ${repository} ${query}`);
      return "src/a.ts";
    },
  };
}

function setup(text: string | (() => string) = FINDINGS) {
  const model = new FakeModel({
    text: typeof text === "string" ? () => text : text,
    object: (request: ModelRequest) =>
      (request as ObjectRequest<unknown>).schemaName === "EditResult"
        ? {
            reply: "Noted.",
            action: "none",
            courseChange: { detected: false, summary: null },
            title: null,
            content: null,
          }
        : analysis(),
  });
  return { model, service: new PlanningService({ model }) };
}

function turn(overrides: Partial<AgentTurnInput> = {}): AgentTurnInput {
  return {
    messages: [{ role: "user", content: "Add token auth to the API." }],
    phase: "grilling",
    checklist: [],
    document: null,
    projectName: "Platform",
    ...overrides,
  };
}

const analysisSystem = (model: FakeModel) =>
  model.requests.find(
    (request) =>
      (request as ObjectRequest<unknown>).schemaName === "TurnAnalysis",
  )?.system ?? "";

describe("codebase research", () => {
  it("reads the linked repositories first and gives the findings to the analysis", async () => {
    const { model, service } = setup();
    await service.runTurn(turn({ codebase: codebase() }));

    const research = model.requests[0];
    expect(research.tools?.map((tool) => tool.name)).toEqual([
      "list_tree",
      "read_file",
      "search_code",
    ]);
    expect(research.system).toContain("acme/api, acme/web");
    expect(analysisSystem(model)).toContain("CODEBASE FINDINGS");
    expect(analysisSystem(model)).toContain(FINDINGS);
    expect(analysisSystem(model)).toContain("contradicts the findings");
  });

  it("runs the tools against the codebase port", async () => {
    const reader = codebase();
    const { model, service } = setup();
    await service.runTurn(turn({ codebase: reader }));
    const [list, read, search] = model.requests[0].tools!;
    await list.execute({ repository: "acme/api", path: "src" });
    await read.execute({ repository: "acme/api", path: "src/a.ts" });
    await search.execute({ repository: "acme/web", query: "session" });
    expect(reader.calls).toEqual([
      "tree acme/api src",
      "read acme/api src/a.ts",
      "search acme/web session",
    ]);
  });

  it("does nothing extra when the project has no repositories", async () => {
    const { model, service } = setup();
    await service.runTurn(turn());
    await service.runTurn(
      turn({ codebase: { ...codebase(), repositories: () => [] } }),
    );
    expect(model.requests.every((request) => !request.tools)).toBe(true);
    expect(analysisSystem(model)).not.toContain("CODEBASE");
  });

  it("leaves the findings out when the code has nothing to say", async () => {
    const { model, service } = setup("NONE");
    await service.runTurn(turn({ codebase: codebase() }));
    expect(analysisSystem(model)).not.toContain("CODEBASE");
  });

  it("still answers when reading the code fails", async () => {
    const { model, service } = setup(() => {
      throw new Error("GitHub is down");
    });
    const result = await service.runTurn(turn({ codebase: codebase() }));
    expect(result.reply).toBe("Which store?");
    expect(analysisSystem(model)).not.toContain("CODEBASE");
  });

  it("also challenges edits to a finished document", async () => {
    const { model, service } = setup();
    await service.runTurn(
      turn({
        phase: "generated",
        document: { title: "Plan", content: "# Plan\n" },
        codebase: codebase(),
      }),
    );
    const edit = model.requests.find(
      (request) =>
        (request as ObjectRequest<unknown>).schemaName === "EditResult",
    );
    expect(edit?.system).toContain(FINDINGS);
  });

  it("tells the user it is checking the code while streaming", async () => {
    const { service } = setup();
    const events: string[] = [];
    for await (const event of service.streamTurn(
      turn({ codebase: codebase() }),
    )) {
      if (event.type === "reasoning") events.push(event.text);
    }
    expect(events[0]).toContain("Checking the linked repositories");
  });
});
