import { z } from "zod";

// Jev is TypeSafe's System One model. It answers typed questions about some state with a
// calibrated number, and generates no text. Docs: https://docs.typesafe.ai/api
//
// This file asks only Noul questions (yes/no, answered as a probability of yes from 0 to 1).
// It never logs the key or the state, because the state is a private conversation.

export type Noul = {
  instructions: string;
  // What a yes and a no mean. Jev reads questions literally, so spell out the boundary.
  criteria?: { true: string; false: string };
};

export interface JevPort {
  // One request, many questions. Each answer is the probability of yes for the same key.
  askNouls<K extends string>(
    state: unknown,
    questions: Record<K, Noul>,
  ): Promise<Record<K, number>>;
}

export class JevError extends Error {
  constructor(
    readonly kind: "config" | "unavailable" | "rejected" | "invalid-output",
    message: string,
  ) {
    super(message);
    this.name = "JevError";
  }
}

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
// The alias jev-latest moves when a new release ships, which would move the answers behind
// our thresholds. Pin a version and change it on purpose.
export const DEFAULT_JEV_MODEL = "jev-1.13.0";
const TIMEOUT_MS = 4000;
// 429 and 529 are the documented retryable statuses. A chat message waits on this call, so
// keep the retries few and short.
const RETRY_DELAYS_MS = [200, 600];

const responseSchema = z.object({
  answers: z.record(
    z.string(),
    z.object({ type: z.literal("noul"), noul: z.number().min(0).max(1) }),
  ),
});

type Options = {
  apiKey: string;
  model?: string;
  fetch?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  endpoint?: string;
};

export class HttpJev implements JevPort {
  private readonly model: string;
  private readonly send: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly endpoint: string;

  constructor(private readonly options: Options) {
    this.model = options.model ?? DEFAULT_JEV_MODEL;
    this.send = options.fetch ?? fetch;
    this.sleep =
      options.sleep ??
      ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
    this.endpoint = options.endpoint ?? ENDPOINT;
  }

  async askNouls<K extends string>(
    state: unknown,
    questions: Record<K, Noul>,
  ): Promise<Record<K, number>> {
    const keys = Object.keys(questions) as K[];
    const body = JSON.stringify({
      model: this.model,
      state,
      questions: Object.fromEntries(
        keys.map((key) => [key, { type: "noul", ...questions[key] }]),
      ),
    });

    for (let attempt = 0; ; attempt++) {
      const response = await this.post(body);
      if (response.ok) return this.parse(await response.json(), keys);
      const retryable = response.status === 429 || response.status === 529;
      if (retryable && attempt < RETRY_DELAYS_MS.length) {
        await this.sleep(RETRY_DELAYS_MS[attempt]);
        continue;
      }
      // Only the status is kept. The response body can echo parts of the state.
      throw new JevError(
        retryable ? "unavailable" : "rejected",
        `Jev answered with status ${response.status}.`,
      );
    }
  }

  private async post(body: string): Promise<Response> {
    try {
      return await this.send(this.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.options.apiKey}`,
          "Content-Type": "application/json",
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw new JevError("unavailable", "Jev could not be reached.");
    }
  }

  private parse<K extends string>(json: unknown, keys: K[]): Record<K, number> {
    const parsed = responseSchema.safeParse(json);
    if (!parsed.success)
      throw new JevError("invalid-output", "Jev returned an unexpected shape.");
    const result = {} as Record<K, number>;
    for (const key of keys) {
      const answer = parsed.data.answers[key];
      if (!answer)
        throw new JevError("invalid-output", `Jev left out question "${key}".`);
      result[key] = answer.noul;
    }
    return result;
  }
}

// Used when no key is configured. Asking fails the same way an outage does, so callers have
// one path to handle.
export class DisabledJev implements JevPort {
  async askNouls(): Promise<never> {
    throw new JevError("config", "TYPESAFE_API_KEY is not set.");
  }
}

type Env = Record<string, string | undefined>;

export function createJev(env: Env = process.env): JevPort {
  const apiKey = env.TYPESAFE_API_KEY?.trim();
  if (!apiKey) return new DisabledJev();
  return new HttpJev({
    apiKey,
    model: env.TYPESAFE_MODEL?.trim() || undefined,
  });
}
