import {
  ModelError,
  type ModelPort,
  type ModelRequest,
  type ObjectRequest,
  type ObjectStream,
  type ObjectStreamEvent,
} from "@/features/planning/server/model";

// Deterministic adapter for tests and offline development. It records every request.

export class FakeModel implements ModelPort {
  readonly requests: ModelRequest[] = [];

  constructor(
    private readonly script: {
      text?: string | ((request: ModelRequest) => string);
      /** One value, or a function of the request (use a counter for multi-step scripts). */
      object?: unknown | ((request: ModelRequest) => unknown);
      chunkSize?: number;
      /** Reasoning text streamed before the object when a request asks for reasoning. */
      reasoning?: string;
    } = {},
  ) {}

  async generateText(request: ModelRequest): Promise<string> {
    this.requests.push(request);
    return this.textFor(request);
  }

  async generateObject<T>(request: ObjectRequest<T>): Promise<T> {
    this.requests.push(request);
    return this.validate(request, this.objectFor(request));
  }

  streamObject<T>(request: ObjectRequest<T>): ObjectStream<T> {
    this.requests.push(request);
    const raw = this.objectFor(request);
    const size = this.script.chunkSize ?? 4;
    const result = Promise.resolve().then(() => this.validate(request, raw));
    result.catch(() => undefined);
    const reasoning = request.reasoning ? this.script.reasoning : undefined;
    return { events: eventsOf(raw, size, reasoning, request.signal), result };
  }

  async *streamText(request: ModelRequest): AsyncIterable<string> {
    this.requests.push(request);
    const text = this.textFor(request);
    const size = this.script.chunkSize ?? 4;
    for (let i = 0; i < text.length; i += size) {
      if (request.signal?.aborted) return;
      yield text.slice(i, i + size);
    }
  }

  private objectFor(request: ModelRequest): unknown {
    const { object } = this.script;
    return typeof object === "function"
      ? (object as (r: ModelRequest) => unknown)(request)
      : object;
  }

  private validate<T>(request: ObjectRequest<T>, raw: unknown): T {
    const parsed = request.schema.safeParse(raw);
    if (!parsed.success) {
      throw new ModelError("invalid-output", parsed.error.message);
    }
    return parsed.data;
  }

  private textFor(request: ModelRequest): string {
    const { text } = this.script;
    return typeof text === "function" ? text(request) : (text ?? "");
  }
}

async function* eventsOf(
  raw: unknown,
  size: number,
  reasoning: string | undefined,
  signal?: AbortSignal,
): AsyncIterable<ObjectStreamEvent> {
  if (reasoning) {
    for (let i = 0; i < reasoning.length; i += size) {
      if (signal?.aborted) return;
      yield { type: "reasoning", text: reasoning.slice(i, i + size) };
    }
  }
  for await (const value of partialsOf(raw, size, signal)) {
    yield { type: "partial", value };
  }
}

// Emulates a provider stream: keys arrive in order and string values grow chunk by chunk.
async function* partialsOf(
  raw: unknown,
  size: number,
  signal?: AbortSignal,
): AsyncIterable<unknown> {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    yield raw;
    return;
  }
  const partial: Record<string, unknown> = {};
  yield { ...partial };
  for (const [key, value] of Object.entries(raw)) {
    if (typeof value === "string") {
      for (let end = size; end < value.length; end += size) {
        if (signal?.aborted) return;
        partial[key] = value.slice(0, end);
        yield { ...partial };
      }
    }
    partial[key] = value;
    yield { ...partial };
  }
}
