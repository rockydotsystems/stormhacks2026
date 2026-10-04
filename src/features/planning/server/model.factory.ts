import { createOpenRouterModel } from "@/features/planning/server/ai-sdk.model";
import { ModelError, type ModelPort } from "@/features/planning/server/model";

type Env = Record<string, string | undefined>;

// Selects the adapter from AI_PROVIDER. Registered as a singleton: the model holds no request state.
export function createModel(env: Env = process.env): ModelPort {
  const provider = env.AI_PROVIDER ?? "openrouter";
  switch (provider) {
    case "openrouter": {
      const apiKey = env.OPENROUTER_API_KEY;
      const model = env.OPENROUTER_MODEL;
      if (!apiKey || !model) {
        throw new ModelError(
          "config",
          "OPENROUTER_API_KEY and OPENROUTER_MODEL must be set.",
        );
      }
      return createOpenRouterModel({ apiKey, model });
    }
    default:
      throw new ModelError("config", `Unknown AI_PROVIDER "${provider}".`);
  }
}
