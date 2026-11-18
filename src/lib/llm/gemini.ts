import { ApiError, ThinkingLevel, type Content, type GenerateContentResponse, type GoogleGenAI } from "@google/genai";
import { LlmRateLimitError, type LlmFactory, type LlmSession, type ToolCall } from "./types";

const PER_CALL_MS = 12_000;
/** Models that timed out or hit quota recently are skipped for a while (shared per server instance). */
const cooling = new Map<string, number>();
const COOL_MS = 10 * 60_000;

type GenerateFn = (req: Parameters<GoogleGenAI["models"]["generateContent"]>[0]) => Promise<GenerateContentResponse>;

/**
 * Gemini adapter. `models` is an ordered list: if the first model hits the free-tier quota (429),
 * the same request is retried on the next one, so the concierge keeps working on a free key.
 */
export function geminiFactory(generate: GenerateFn, models: string[]): LlmFactory {
  return ({ system, tools, userMessage, signal }): LlmSession => {
    const contents: Content[] = [{ role: "user", parts: [{ text: userMessage }] }];
    let callSeq = 0;
    const syntheticIds = new Set<string>(); // ids we invented because Gemini omitted them

    return {
      async next() {
        let res: GenerateContentResponse | undefined;
        let usedModel = models[0];
        const order = [...models.filter((m) => (cooling.get(m) ?? 0) < Date.now()), ...models.filter((m) => (cooling.get(m) ?? 0) >= Date.now())];
        for (let i = 0; i < order.length; i++) {
          try {
            usedModel = order[i];
            res = await generate({
              model: order[i],
              contents: [...contents],
              config: {
                systemInstruction: system,
                tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
                temperature: 0.6,
                // Per-call cap: a stuck model must not eat the whole run; on timeout we try the next model.
                abortSignal: signal ? AbortSignal.any([signal, AbortSignal.timeout(PER_CALL_MS)]) : AbortSignal.timeout(PER_CALL_MS),
                // Gemini 3+ thinks by default; tool routing needs little of it, so keep it minimal for speed.
                ...(Number(order[i].match(/gemini-(\d+)/)?.[1] ?? 0) >= 3 ? { thinkingConfig: { thinkingLevel: order[i].endsWith("-lite") ? ThinkingLevel.MINIMAL : ThinkingLevel.LOW } } : {}),
              },
            });
            break;
          } catch (err) {
            if (signal?.aborted) throw err; // the whole run was cancelled
            const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
            const quota = timedOut || (err instanceof ApiError && (err.status === 429 || err.status === 500 || err.status === 503));
            if (!quota) throw err;
            cooling.set(order[i], Date.now() + COOL_MS);
            console.warn(`gemini ${order[i]} timed out or unavailable, trying next`);
            if (i === order.length - 1) throw new LlmRateLimitError("All Gemini models are rate limited");
          }
        }
        const candidate = res!.candidates?.[0];
        const refused = !!res!.promptFeedback?.blockReason || candidate?.finishReason === "SAFETY" || candidate?.finishReason === "PROHIBITED_CONTENT";
        // Append the model turn verbatim: it may carry thought signatures that Gemini needs back.
        if (candidate?.content) contents.push({ role: "model", parts: candidate.content.parts ?? [] });
        const toolCalls: ToolCall[] = (res!.functionCalls ?? []).map((fc) => {
          let id = fc.id;
          if (!id) syntheticIds.add((id = `local_${++callSeq}`));
          return { id, name: fc.name ?? "", input: fc.args ?? {} };
        });
        return { toolCalls, text: res!.text ?? "", refused, model: usedModel };
      },
      addToolResults(results) {
        contents.push({
          role: "user",
          parts: results.map((r) => ({
            functionResponse: { id: syntheticIds.has(r.id) ? undefined : r.id, name: r.name, response: r.isError ? { error: r.content } : { output: r.content } },
          })),
        });
      },
      addUserText(text) {
        // Merge into the previous user turn (e.g. right after tool results) instead of sending two user turns in a row.
        const last = contents[contents.length - 1];
        if (last?.role === "user") last.parts = [...(last.parts ?? []), { text }];
        else contents.push({ role: "user", parts: [{ text }] });
      },
    };
  };
}
