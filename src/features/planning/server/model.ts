import type { ZodType } from "zod";

// The model port. Feature code depends on this file only. Provider SDK types stay inside adapters.

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

// How hard the model thinks before it answers. Models without reasoning ignore it.
export type ReasoningLevel = "none" | "low" | "medium" | "high";

export type ModelRequest = {
  system?: string;
  messages: ChatMessage[];
  temperature?: number;
  signal?: AbortSignal;
  reasoning?: ReasoningLevel;
};

export type ObjectRequest<T> = ModelRequest & {
  schema: ZodType<T>;
  schemaName?: string;
  schemaDescription?: string;
};

export type ObjectStreamEvent =
  | { type: "reasoning"; text: string }
  /** A growing, unvalidated object. Each one extends the previous one. */
  | { type: "partial"; value: unknown };

export type ObjectStream<T> = {
  /** Reasoning deltas and partial objects, in the order they arrive. */
  events: AsyncIterable<ObjectStreamEvent>;
  /** The final object, validated against the schema. Rejects with ModelError on failure. */
  result: Promise<T>;
};

export interface ModelPort {
  /** Complete text reply. */
  generateText(request: ModelRequest): Promise<string>;
  /** Reply validated against a Zod schema. Rejects with ModelError if the output does not match. */
  generateObject<T>(request: ObjectRequest<T>): Promise<T>;
  /**
   * Structured output as it arrives. Partials are not validated and may be discarded if
   * `result` rejects. Consumers must treat streamed text as provisional until `result` resolves.
   */
  streamObject<T>(request: ObjectRequest<T>): ObjectStream<T>;
  /** Text deltas, in order. Cancel through the request signal. */
  streamText(request: ModelRequest): AsyncIterable<string>;
}

export type ModelErrorKind = "config" | "provider" | "invalid-output";

export class ModelError extends Error {
  constructor(
    public readonly kind: ModelErrorKind,
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "ModelError";
  }
}
