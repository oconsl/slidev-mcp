export interface ToolErrorPayload {
  success: false;
  code: string;
  message: string;
  details?: unknown;
}

export interface ToolSuccessPayload<T extends Record<string, unknown> = Record<string, unknown>> {
  success: true;
  data: T;
}

export function toolSuccess<T extends Record<string, unknown>>(data: T) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify({ success: true, data }) }],
  };
}

export function toolError(code: string, message: string, details?: unknown) {
  const payload: ToolErrorPayload = { success: false, code, message };
  if (details !== undefined) payload.details = details;

  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload) }],
    isError: true,
  };
}

export function logInfo(message: string): void {
  process.stderr.write(`[slidev-mcp] ${message}\n`);
}

export function summarizeOutput(text: string, maxLength = 4000): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}\n...[truncated ${text.length - maxLength} chars]`;
}
