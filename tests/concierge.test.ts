import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@google/genai";
import { buildUserMessage, runConcierge, type ConciergeEvent } from "@/lib/concierge/agent";
import { validatePicks } from "@/lib/concierge/picks";
import { anthropicFactory } from "@/lib/llm/anthropic";
import { geminiFactory } from "@/lib/llm/gemini";
import { rankGeminiModels } from "@/lib/llm";
import { LlmRateLimitError, type LlmFactory, type ToolCall, type ToolResult, type Turn } from "@/lib/llm/types";
import { createDemoProvider } from "@/lib/places/demo";

const KYIV = { lat: 50.4651, lng: 30.5155 };
const input = { prompt: "Romantic wine evening", center: KYIV, localTime: "Friday 19:30", savedNames: ["Kava Lab (Coffee shop)"] };
const call = (id: string, name: string, args: unknown): ToolCall => ({ id, name, input: args });
const turn = (toolCalls: ToolCall[], refused = false): Turn => ({ toolCalls, text: "", refused });

/** Scripted fake model: returns the given turns in order and records what the agent sent back. */
function scripted(turns: Turn[]) {
  const sent: ToolResult[][] = [];
  const nudges: string[] = [];
  let i = 0;
  const next = vi.fn(async () => turns[Math.min(i++, turns.length - 1)]);
  const llm: LlmFactory = () => ({ next, addToolResults: (r) => sent.push(r), addUserText: (t) => nudges.push(t) });
  return { llm, next, sent, nudges };
}

describe("validatePicks (anti-hallucination guardrail)", () => {
  const seen = new Set(["a", "b"]);
  const pick = (id: string) => ({ place_id: id, headline: "h", why: "w", tip: "" });

  it("accepts picks that come from tool results", () => {
    expect(validatePicks({ intro: "Hi", picks: [pick("a"), pick("b")] }, seen).ok).toBe(true);
  });
  it("rejects an invented place id", () => {
    const r = validatePicks({ intro: "Hi", picks: [pick("a"), pick("made-up")] }, seen);
    expect(r).toMatchObject({ ok: false });
    expect(!r.ok && r.error).toContain("made-up");
  });
  it("rejects duplicates, empty and oversized lists", () => {
    expect(validatePicks({ intro: "", picks: [pick("a"), pick("a")] }, seen).ok).toBe(false);
    expect(validatePicks({ intro: "", picks: [] }, seen).ok).toBe(false);
    expect(validatePicks({ intro: "", picks: [pick("a"), pick("b"), pick("a"), pick("b")] }, seen).ok).toBe(false);
  });
});

describe("runConcierge agent loop", () => {
  it("searches, recovers from a hallucinated pick, and emits validated results", async () => {
    const m = scripted([
      turn([call("t1", "search_places", { query: "wine bar" }), call("t2", "search_places", { query: "rooftop" })]),
      turn([call("t3", "present_picks", { intro: "x", picks: [{ place_id: "ghost", headline: "h", why: "w", tip: "" }] })]),
      turn([call("t4", "present_picks", { intro: "Lovely spot.", picks: [{ place_id: "demo_vino_vino", headline: "Natural wine", why: "4.7★", tip: "Cheese board" }] })]),
    ]);
    const events: ConciergeEvent[] = [];
    const picks = await runConcierge(input, { llm: m.llm, places: createDemoProvider(), emit: (e) => events.push(e) });

    expect(picks?.picks[0].place_id).toBe("demo_vino_vino");
    expect(m.next).toHaveBeenCalledTimes(3);
    // Both parallel results go back together, in call order.
    expect(m.sent[0].map((r) => r.id)).toEqual(["t1", "t2"]);
    // The invented id was bounced back to the model as an error.
    expect(m.sent[1][0]).toMatchObject({ id: "t3", isError: true });
    expect(m.sent[1][0].content).toContain("ghost");
    const result = events.find((e) => e.t === "result");
    expect(result && result.t === "result" && result.picks[0].place.name).toBe("Vino Vino");
    expect(events.filter((e) => e.t === "search")).toHaveLength(2);
  });

  it("stops on a refusal without running tools", async () => {
    const m = scripted([turn([call("t1", "search_places", { query: "x" })], true)]);
    const events: ConciergeEvent[] = [];
    expect(await runConcierge(input, { llm: m.llm, places: createDemoProvider(), emit: (e) => events.push(e) })).toBeNull();
    expect(events.some((e) => e.t === "error")).toBe(true);
    expect(events.some((e) => e.t === "search")).toBe(false);
  });

  it("gives up after maxTurns instead of looping forever", async () => {
    const m = scripted([turn([call("t", "search_places", { query: "coffee" })])]);
    expect(await runConcierge(input, { llm: m.llm, places: createDemoProvider(), emit: () => {}, maxTurns: 3 })).toBeNull();
    expect(m.next).toHaveBeenCalledTimes(3);
  });

  it("nudges the model when it answers in prose instead of calling present_picks", async () => {
    const m = scripted([turn([]), turn([])]);
    await runConcierge(input, { llm: m.llm, places: createDemoProvider(), emit: () => {}, maxTurns: 2 });
    expect(m.nudges[0]).toContain("present_picks");
  });

  it("returns invalid tool input to the model as an error instead of crashing", async () => {
    const m = scripted([turn([call("t1", "search_places", { query: "" })]), turn([])]);
    await runConcierge(input, { llm: m.llm, places: createDemoProvider(), emit: () => {}, maxTurns: 2 });
    expect(m.sent[0][0]).toMatchObject({ id: "t1", isError: true });
  });

  it("caps tool calls per turn so one reply cannot fan out into unlimited API calls", async () => {
    const many = Array.from({ length: 6 }, (_, i) => call(`s${i}`, "search_places", { query: `q${i} wine` }));
    const m = scripted([turn(many), turn([])]);
    const events: ConciergeEvent[] = [];
    await runConcierge(input, { llm: m.llm, places: createDemoProvider(), emit: (e) => events.push(e), maxTurns: 2 });
    expect(events.filter((e) => e.t === "search")).toHaveLength(4);
    expect(m.sent[0]).toHaveLength(6); // every call still gets a result
    expect(m.sent[0].slice(4).every((r) => r.isError)).toBe(true);
  });

  it("stops calling the model once the request is aborted (client left)", async () => {
    const ctrl = new AbortController();
    const m = scripted([turn([call("t1", "search_places", { query: "coffee" })])]);
    m.next.mockImplementationOnce(async () => {
      ctrl.abort();
      return turn([call("t1", "search_places", { query: "coffee" })]);
    });
    expect(await runConcierge(input, { llm: m.llm, places: createDemoProvider(), emit: () => {}, signal: ctrl.signal })).toBeNull();
    expect(m.next).toHaveBeenCalledTimes(1);
  });

  it("puts volatile context in the user message, keeping the system prompt stable", () => {
    const msg = buildUserMessage({ ...input, previous: [{ prompt: "coffee", picked: ["Kava Lab"] }] });
    expect(msg).toContain("Friday 19:30");
    expect(msg).toContain("Kava Lab (Coffee shop)");
    expect(msg).toContain('Earlier request: "coffee"');
    expect(msg.trim().endsWith("Guest request: Romantic wine evening")).toBe(true);
  });
});

describe("Gemini adapter", () => {
  const tools = [{ name: "search_places", description: "d", parameters: { type: "object", properties: {} } }];
  const response = (fc: Array<{ id?: string; name: string; args: object }>) => ({
    candidates: [{ content: { role: "model", parts: fc.map((f) => ({ functionCall: f })) }, finishReason: "STOP" }],
    functionCalls: fc,
    text: "",
  });

  it("maps function calls, sends tools as JSON schema, and returns results as functionResponse parts", async () => {
    const generate = vi.fn().mockResolvedValue(response([{ name: "search_places", args: { query: "pizza" } }]));
    const s = geminiFactory(generate, ["gemini-x-flash"])({ system: "sys", tools, userMessage: "hi" });
    const t = await s.next();
    expect(t.toolCalls).toEqual([{ id: "local_1", name: "search_places", input: { query: "pizza" } }]);
    const req = generate.mock.calls[0][0];
    expect(req.config.systemInstruction).toBe("sys");
    expect(req.config.tools[0].functionDeclarations[0]).toMatchObject({ name: "search_places", parametersJsonSchema: tools[0].parameters });

    s.addToolResults([{ id: "local_1", name: "search_places", content: "[]" }]);
    await s.next();
    const history = generate.mock.calls[1][0].contents;
    expect(history.map((c: { role: string }) => c.role)).toEqual(["user", "model", "user"]);
    // Synthetic ids are not sent back to Gemini; the model turn is kept verbatim.
    expect(history[2].parts[0].functionResponse).toEqual({ id: undefined, name: "search_places", response: { output: "[]" } });
  });

  it("falls back to the next model when the free quota is exhausted", async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new ApiError({ status: 429, message: "quota" }))
      .mockResolvedValueOnce(response([]));
    const s = geminiFactory(generate, ["gemini-x-flash", "gemini-x-flash-lite"])({ system: "", tools, userMessage: "hi" });
    await s.next();
    expect(generate.mock.calls.map((c) => c[0].model)).toEqual(["gemini-x-flash", "gemini-x-flash-lite"]);
  });

  it("raises a typed rate-limit error when every model is exhausted", async () => {
    const generate = vi.fn().mockRejectedValue(new ApiError({ status: 429, message: "quota" }));
    const s = geminiFactory(generate, ["a", "b"])({ system: "", tools, userMessage: "hi" });
    await expect(s.next()).rejects.toBeInstanceOf(LlmRateLimitError);
  });

  it("ranks discovered models: fast flash-lite first (newest first), flash as fallback, skipping previews", () => {
    expect(
      rankGeminiModels([
        "models/gemini-2.5-flash",
        "models/gemini-3.8-flash",
        "models/gemini-3.9-flash-preview",
        "models/gemini-3.5-flash-lite",
        "models/gemini-3.1-flash-lite",
        "models/gemini-2.0-flash-lite",
        "models/gemini-3.8-flash-image",
        "models/text-embedding-004",
      ]),
    ).toEqual(["gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.8-flash"]);
  });
});

describe("Claude adapter", () => {
  it("returns all tool results for a turn in one user message", async () => {
    const create = vi.fn().mockResolvedValue({
      content: [
        { type: "tool_use", id: "a", name: "search_places", input: { query: "x" } },
        { type: "tool_use", id: "b", name: "search_places", input: { query: "y" } },
      ],
      stop_reason: "tool_use",
    });
    const s = anthropicFactory(create, "claude-opus-5-5")({ system: "sys", tools: [], userMessage: "hi" });
    expect((await s.next()).toolCalls.map((c) => c.id)).toEqual(["a", "b"]);
    s.addToolResults([
      { id: "a", name: "search_places", content: "1" },
      { id: "b", name: "search_places", content: "2", isError: true },
    ]);
    await s.next();
    const last = create.mock.calls[1][0].messages.at(-1);
    expect(last.role).toBe("user");
    expect(last.content).toEqual([
      { type: "tool_result", tool_use_id: "a", content: "1" },
      { type: "tool_result", tool_use_id: "b", content: "2", is_error: true },
    ]);
  });
});
