import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenAI } from "@google/genai";
import { env } from "@/lib/env";
import { anthropicFactory } from "./anthropic";
import { geminiFactory } from "./gemini";
import type { LlmFactory } from "./types";

/**
 * Picks the stable text models available to this key, newest first: the best "flash" model,
 * then "flash-lite" models (much higher free-tier daily quota) as fallbacks.
 */
export function rankGeminiModels(names: string[]): string[] {
  const version = (n: string) => Number(n.match(/gemini-(\d+(?:\.\d+)?)/)?.[1] ?? 0);
  const ok = names
    .map((n) => n.replace(/^models\//, ""))
    .filter((n) => /^gemini-\d+(\.\d+)?-flash(-lite)?$/.test(n)); // skips preview/image/tts/live variants
  const flash = ok.filter((n) => !n.endsWith("-lite")).sort((a, b) => version(b) - version(a));
  const lite = ok.filter((n) => n.endsWith("-lite")).sort((a, b) => version(b) - version(a));
  return [...flash.slice(0, 1), ...lite.slice(0, 2)];
}

let geminiModels: Promise<string[]> | null = null;

export function llmProvider(): { name: "gemini" | "claude"; factory: () => Promise<LlmFactory> } | null {
  if (env.geminiKey) {
    const ai = new GoogleGenAI({ apiKey: env.geminiKey });
    return {
      name: "gemini",
      factory: async () => {
        geminiModels ??= env.geminiModels.length
          ? Promise.resolve(env.geminiModels)
          : (async () => {
              const names: string[] = [];
              for await (const m of await ai.models.list()) if (m.name) names.push(m.name);
              const ranked = rankGeminiModels(names);
              if (!ranked.length) throw new Error("No Gemini flash models available for this key");
              return ranked;
            })().catch((e) => {
              geminiModels = null; // retry discovery next time
              throw e;
            });
        return geminiFactory((req) => ai.models.generateContent(req), await geminiModels);
      },
    };
  }
  if (env.anthropicKey) {
    const client = new Anthropic({ apiKey: env.anthropicKey });
    return { name: "claude", factory: async () => anthropicFactory((p, o) => client.beta.messages.create(p, o), env.conciergeModel) };
  }
  return null;
}
