/**
 * Provider-neutral contract for a tool-using chat session.
 * The concierge agent only talks to this interface; Gemini and Claude are adapters.
 */
export type ToolSpec = {
  name: string;
  description: string;
  /** JSON Schema for the tool's input object. */
  parameters: Record<string, unknown>;
};

export type ToolCall = { id: string; name: string; input: unknown };
export type ToolResult = { id: string; name: string; content: string; isError?: boolean };

export type Turn = { toolCalls: ToolCall[]; text: string; refused: boolean; model?: string };

export interface LlmSession {
  /** Sends the conversation so far and returns what the model wants to do next. */
  next(): Promise<Turn>;
  /** All results for one turn go back together, in the order the calls were made. */
  addToolResults(results: ToolResult[]): void;
  addUserText(text: string): void;
}

export type LlmFactory = (opts: { system: string; tools: ToolSpec[]; userMessage: string; signal?: AbortSignal }) => LlmSession;

/** Thrown by adapters when the provider says "too many requests", so the UI can show a friendly message. */
export class LlmRateLimitError extends Error {}
