import { describe, expect, it, vi } from "vitest";
import type {
  ReviewInput,
  ReviewResult,
} from "@stormhacks/data/github-review/contracts";
import {
  diffLines,
  evaluateReview,
  formatReview,
  validateReview,
} from "./review";

const versionId = "6f4ec3d5-b985-4de2-b160-9b1779ed6f25";
const input: ReviewInput = {
  organizationId: "org_test",
  installationId: "42",
  repositoryId: "repo",
  owner: "team",
  repository: "todo",
  pullRequest: {
    number: 1,
    title: "Add todos",
    body: null,
    state: "open",
    draft: false,
    head: { sha: "a".repeat(40) },
    base: { sha: "b".repeat(40) },
  },
  decisions: [
    {
      versionId,
      documentId: "doc",
      projectId: "project",
      number: 1,
      title: "Todo decisions",
      content: "Failed creation must not automatically retry.",
    },
  ],
};
const files = [
  {
    filename: "todo.ts",
    status: "modified",
    additions: 1,
    deletions: 1,
    changes: 2,
    patch:
      "@@ -9,2 +9,2 @@\n const item = input;\n-create(item);\n+retry(() => create(item));",
  },
];
const result: ReviewResult = {
  summary: "Creation retries disagree with the decision.",
  limitations: [],
  findings: [
    {
      category: "direct contradiction",
      versionId,
      decisionQuote: input.decisions[0].content,
      path: "todo.ts",
      line: 10,
      side: "RIGHT",
      codeQuote: "retry(() => create(item));",
      explanation: "This retries a failed creation automatically.",
      suggestion: "Remove retries, or discuss and publish an amendment.",
    },
  ],
};

describe("published decision evidence", () => {
  it("maps both sides and context across multiple hunks", () => {
    const lines = diffLines(
      `${files[0].patch}\n@@ -30 +40,2 @@\n-old\n+new\n+second\n\\ No newline at end of file`,
    );
    expect(lines.get("LEFT:10")).toBe("create(item);");
    expect(lines.get("RIGHT:10")).toBe("retry(() => create(item));");
    expect(lines.get("RIGHT:9")).toBe("const item = input;");
    expect(lines.get("LEFT:30")).toBe("old");
    expect(lines.get("RIGHT:41")).toBe("second");
  });
  it("accepts exact citations and rejects invented versions, quotes, paths, lines and sides", () => {
    expect(validateReview(result, input, files)).toEqual(result);
    for (const change of [
      { versionId: "cc328e97-9f70-4470-b915-bfdf0284a4f4" },
      { decisionQuote: "A draft now permits retries." },
      { path: "other.ts" },
      { line: 11 },
      { side: "LEFT" },
      { codeQuote: "invented()" },
    ])
      expect(() =>
        validateReview(
          { ...result, findings: [{ ...result.findings[0], ...change }] },
          input,
          files,
        ),
      ).toThrow();
  });
  it("adds deterministic missing/truncated evidence limitations", async () => {
    const model = {
      generateObject: vi.fn().mockResolvedValue({
        summary: "No evidenced conflicts.",
        limitations: [],
        findings: [],
      }),
    };
    const reviewed = await evaluateReview(model, input, [
      files[0],
      {
        filename: "binary.png",
        status: "added",
        additions: 1,
        deletions: 0,
        changes: 1,
      },
      { ...files[0], filename: "large.ts", additions: 100 },
    ]);
    expect(reviewed.limitations).toEqual([
      "No textual diff was available for binary.png.",
      "The diff for large.ts is incomplete; unshown changes were not reviewed.",
    ]);
    const request = model.generateObject.mock.calls[0][0];
    expect(JSON.parse(request.messages[0].content).publishedDecisions).toEqual(
      input.decisions,
    );
  });
  it("refuses to silently truncate ADR or diff context", async () => {
    const model = { generateObject: vi.fn() };
    await expect(
      evaluateReview(
        model,
        {
          ...input,
          decisions: [{ ...input.decisions[0], content: "a".repeat(200001) }],
        },
        files,
      ),
    ).rejects.toMatchObject({ status: 422 });
    expect(model.generateObject).not.toHaveBeenCalled();
  });
  it("formats pinned publication links and commit, escapes markup, and suppresses mentions", () => {
    const formatted = formatReview(
      "job",
      input,
      { ...result, summary: "@someone <img> [click](https://bad.test)" },
      "https://app.test",
    );
    expect(formatted.commit_id).toBe(input.pullRequest.head.sha);
    expect(formatted.body).toContain(`/api/github/decisions/${versionId}`);
    expect(formatted.body).not.toContain("@someone");
    expect(formatted.body).not.toContain("<img>");
    expect(formatted.comments[0]).toMatchObject({
      path: "todo.ts",
      line: 10,
      side: "RIGHT",
    });
    expect(formatted.comments[0].body).toContain(input.decisions[0].content);
  });
});
