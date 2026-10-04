import { describe, expect, it } from "vitest";
import { createSseParser } from "@/features/planning/client/sse";

describe("createSseParser", () => {
  it("parses several frames from one chunk", () => {
    const parser = createSseParser();
    const frames = parser.push(
      'id: 1:1\nevent: message.delta\ndata: {"a":1}\n\nid: 1:2\ndata: {"b":2}\n\n',
    );
    expect(frames).toEqual([
      { id: "1:1", event: "message.delta", data: '{"a":1}' },
      { id: "1:2", event: null, data: '{"b":2}' },
    ]);
  });

  it("joins a frame split across chunks", () => {
    const parser = createSseParser();
    expect(parser.push('data: {"te')).toEqual([]);
    expect(parser.push('xt":"hi"}\n')).toEqual([]);
    expect(parser.push("\n")).toEqual([
      { id: null, event: null, data: '{"text":"hi"}' },
    ]);
  });

  it("handles CRLF, including a CR and LF split across chunks", () => {
    const parser = createSseParser();
    expect(parser.push("data: one\r\n\r")).toEqual([]);
    expect(parser.push("\ndata: two\r\n\r\n")).toEqual([
      { id: null, event: null, data: "one" },
      { id: null, event: null, data: "two" },
    ]);
  });

  it("accepts lone CR line breaks", () => {
    const parser = createSseParser();
    const frames = [
      ...parser.push("data: a\r\rdata: b\r\r"),
      ...parser.flush(),
    ];
    expect(frames).toEqual([
      { id: null, event: null, data: "a" },
      { id: null, event: null, data: "b" },
    ]);
  });

  it("ignores heartbeat comments and comment-only frames", () => {
    const parser = createSseParser();
    expect(parser.push(": ping\n\n")).toEqual([]);
    expect(parser.push(": ping\ndata: x\n\n")).toEqual([
      { id: null, event: null, data: "x" },
    ]);
  });

  it("joins multi-line data with newlines and strips one leading space", () => {
    const parser = createSseParser();
    expect(parser.push("data: line one\ndata:  line two\n\n")).toEqual([
      { id: null, event: null, data: "line one\n line two" },
    ]);
  });

  it("keeps unicode intact", () => {
    const parser = createSseParser();
    const text = 'data: {"text":"café \u{1F680} 漢字"}\n\n';
    const half = Math.floor(text.length / 2);
    expect(parser.push(text.slice(0, half))).toEqual([]);
    expect(parser.push(text.slice(half))).toEqual([
      { id: null, event: null, data: '{"text":"café \u{1F680} 漢字"}' },
    ]);
  });

  it("drops a truncated trailing frame on flush", () => {
    const parser = createSseParser();
    expect(parser.push('data: {"done":true}\n\ndata: {"part')).toHaveLength(1);
    expect(parser.flush()).toEqual([]);
  });

  it("resolves a trailing CR on flush", () => {
    const parser = createSseParser();
    expect(parser.push("data: x\r\n\r")).toEqual([]);
    expect(parser.flush()).toEqual([{ id: null, event: null, data: "x" }]);
  });
});
