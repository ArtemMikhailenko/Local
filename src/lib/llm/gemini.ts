import { ApiError, type Content, type GenerateContentResponse, type GoogleGenAI } from "@google/genai";
import { LlmRateLimitError, type LlmFactory, type LlmSession, type ToolCall } from "./types";

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
        for (let i = 0; i < models.length; i++) {
          try {
            res = await generate({
              model: models[i],
              contents: [...contents],
              config: {
                systemInstruction: system,
                tools: [{ functionDeclarations: tools.map((t) => ({ name: t.name, description: t.description, parametersJsonSchema: t.parameters })) }],
                temperature: 0.6,
                abortSignal: signal,
              },
            });
            break;
          } catch (err) {
            const quota = err instanceof ApiError && (err.status === 429 || err.status === 503);
            if (!quota) throw err;
            if (i === models.length - 1) throw new LlmRateLimitError("All Gemini models are rate limited");
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
        return { toolCalls, text: res!.text ?? "", refused };
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
        contents.push({ role: "user", parts: [{ text }] });
      },
    };
  };
}
