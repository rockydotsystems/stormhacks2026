import {
  generateObject,
  generateText,
  Output,
  parsePartialJson,
  streamText,
  type LanguageModel,
} from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import {
  ModelError,
  type ModelPort,
  type ModelRequest,
  type ObjectRequest,
  type ObjectStream,
  type ObjectStreamEvent,
  type ReasoningLevel,
} from "@/features/planning/server/model";

// The only file that touches the AI SDK. Another provider means another createXModel function.

// Providers read reasoning from their own model settings, so a reasoning level is a model
// instance. A plain model ignores the level.
export type ModelResolver = (reasoning?: ReasoningLevel) => LanguageModel;

export class AiSdkModel implements ModelPort {
  private readonly resolve: ModelResolver;

  constructor(model: LanguageModel | ModelResolver) {
    this.resolve = typeof model === "function" ? model : () => model;
  }

  async generateText(request: ModelRequest): Promise<string> {
    try {
      const result = await generateText({ ...this.options(request) });
      return result.text;
    } catch (error) {
      throw toModelError(error);
    }
  }

  async generateObject<T>(request: ObjectRequest<T>): Promise<T> {
    try {
      const result = await generateObject({
        ...this.options(request),
        schema: request.schema,
        schemaName: request.schemaName,
        schemaDescription: request.schemaDescription,
      });
      return result.object as T;
    } catch (error) {
      throw toModelError(error);
    }
  }

  async *streamText(request: ModelRequest): AsyncIterable<string> {
    let failure: unknown;
    const result = streamText({
      ...this.options(request),
      onError: ({ error }) => {
        failure = error;
      },
    });
    try {
      for await (const delta of result.textStream) yield delta;
    } catch (error) {
      throw toModelError(error);
    }
    if (failure) throw toModelError(failure);
  }

  streamObject<T>(request: ObjectRequest<T>): ObjectStream<T> {
    let failure: unknown;
    const run = streamText({
      ...this.options(request),
      output: Output.object({
        schema: request.schema,
        name: request.schemaName,
        description: request.schemaDescription,
      }),
      onError: ({ error }) => {
        failure = error;
      },
    });
    const events = (async function* (): AsyncGenerator<ObjectStreamEvent> {
      let json = "";
      try {
        for await (const part of run.stream) {
          if (part.type === "reasoning-delta") {
            if (part.text) yield { type: "reasoning", text: part.text };
          } else if (part.type === "text-delta") {
            json += part.text;
            const parsed = await parsePartialJson(json);
            if (parsed.value !== undefined && parsed.value !== null) {
              yield { type: "partial", value: parsed.value };
            }
          }
        }
      } catch (error) {
        throw toModelError(error);
      }
      if (failure) throw toModelError(failure);
    })();
    const result = Promise.resolve(run.output).then(
      (object) => object as T,
      (error: unknown) => {
        throw toModelError(failure ?? error);
      },
    );
    // A consumer may stop reading after the events fail. Avoid an unhandled rejection.
    result.catch(() => undefined);
    return { events, result };
  }

  private options(request: ModelRequest) {
    return {
      model: this.resolve(request.reasoning),
      system: request.system,
      messages: request.messages,
      temperature: request.temperature,
      abortSignal: request.signal,
    };
  }
}

export function createOpenRouterModel(options: {
  apiKey: string;
  model: string;
}): ModelPort {
  const openrouter = createOpenRouter({ apiKey: options.apiKey });
  return new AiSdkModel((reasoning) =>
    reasoning
      ? openrouter(options.model, { reasoning: { effort: reasoning } })
      : openrouter(options.model),
  );
}

function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) return error;
  const name = error instanceof Error ? error.name : "";
  const kind =
    /NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse/i.test(name)
      ? "invalid-output"
      : "provider";
  const message = error instanceof Error ? error.message : "Model call failed.";
  return new ModelError(kind, message, { cause: error });
}
