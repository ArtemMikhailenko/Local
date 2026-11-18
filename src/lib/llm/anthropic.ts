import Anthropic from "@anthropic-ai/sdk";
import { LlmRateLimitError, type LlmFactory, type LlmSession } from "./types";

type CreateParams = Anthropic.Beta.MessageCreateParamsNonStreaming;
type CreateFn = (params: CreateParams, opts?: { signal?: AbortSignal }) => Promise<Anthropic.Beta.BetaMessage>;

/** Claude adapter (optional provider, used when ANTHROPIC_API_KEY is set). */
export function anthropicFactory(create: CreateFn, model: string): LlmFactory {
  return ({ system, tools, userMessage, signal }): LlmSession => {
    const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: userMessage }];
    const apiTools: Anthropic.Beta.BetaTool[] = tools.map((t) => ({
      name: t.name,
      description: t.description,
      input_schema: t.parameters as Anthropic.Beta.BetaTool["input_schema"],
    }));
    return {
      async next() {
        let msg: Anthropic.Beta.BetaMessage;
        try {
          msg = await create(
            {
              model,
              max_tokens: 4000,
              system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
              tools: apiTools,
              messages: [...messages],
              output_config: { effort: "low" },
              betas: ["server-side-fallback-2026-07-01"],
              fallbacks: "default",
            },
            { signal },
          );
        } catch (err) {
          if (err instanceof Anthropic.RateLimitError) throw new LlmRateLimitError("Claude rate limited");
          throw err;
        }
        messages.push({ role: "assistant", content: msg.content });
        const toolCalls = msg.content
          .filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use")
          .map((b) => ({ id: b.id, name: b.name, input: b.input }));
        const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("");
        return { toolCalls, text, refused: msg.stop_reason === "refusal" };
      },
      addToolResults(results) {
        messages.push({
          role: "user",
          content: results.map((r) => ({ type: "tool_result" as const, tool_use_id: r.id, content: r.content, ...(r.isError ? { is_error: true } : {}) })),
        });
      },
      addUserText(text) {
        messages.push({ role: "user", content: text });
      },
    };
  };
}
