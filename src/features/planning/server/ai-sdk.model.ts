import {
  generateObject,
  generateText,
  streamObject,
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
} from "@/features/planning/server/model";

// The only file that touches the AI SDK. Another provider means another createXModel function.

export class AiSdkModel implements ModelPort {
  constructor(private readonly model: LanguageModel) {}

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
    const run = streamObject({
      ...this.options(request),
      schema: request.schema,
      schemaName: request.schemaName,
      schemaDescription: request.schemaDescription,
    });
    const partials = (async function* () {
      try {
        for await (const partial of run.partialObjectStream) yield partial;
      } catch (error) {
        throw toModelError(error);
      }
    })();
    const result = run.object.then(
      (object) => object as T,
      (error: unknown) => {
        throw toModelError(error);
      },
    );
    // A consumer may stop reading after the partials fail. Avoid an unhandled rejection.
    result.catch(() => undefined);
    return { partials, result };
  }

  private options(request: ModelRequest) {
    return {
      model: this.model,
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
  return new AiSdkModel(openrouter(options.model));
}

function toModelError(error: unknown): ModelError {
  if (error instanceof ModelError) return error;
  const name = error instanceof Error ? error.name : "";
  const kind = /NoObjectGenerated|TypeValidation|JSONParse/i.test(name)
    ? "invalid-output"
    : "provider";
  const message = error instanceof Error ? error.message : "Model call failed.";
  return new ModelError(kind, message, { cause: error });
}
