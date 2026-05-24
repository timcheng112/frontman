import process from "node:process";

export const DEFAULT_FRONTMAN_MODEL = process.env.FRONTMAN_OPENAI_MODEL ?? "gpt-5.4-mini";

export type ReasoningEffort = "none" | "minimal" | "low" | "medium" | "high" | "xhigh";

interface JsonSchemaFormat {
  type: "json_schema";
  name: string;
  description?: string;
  strict?: boolean;
  schema: Record<string, unknown>;
}

interface ResponseRequestOptions {
  model?: string;
  instructions: string;
  input: string;
  reasoningEffort?: ReasoningEffort;
  maxOutputTokens?: number;
  textFormat?: JsonSchemaFormat;
}

interface OpenAIErrorResponse {
  error?: {
    message?: string;
  };
}

export async function createTextResponse(options: ResponseRequestOptions) {
  const response = await createResponse(options);
  return extractResponseText(response);
}

export async function createStructuredResponse<T>(options: ResponseRequestOptions) {
  const response = await createResponse(options);
  const text = extractResponseText(response);

  try {
    return JSON.parse(text) as T;
  } catch (error) {
    throw new Error(
      `The model returned invalid JSON. ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

async function createResponse(options: ResponseRequestOptions) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for the LLM digest generator.");
  }

  const model = options.model ?? DEFAULT_FRONTMAN_MODEL;
  const payload: Record<string, unknown> = {
    model,
    instructions: options.instructions,
    input: options.input,
    max_output_tokens: options.maxOutputTokens ?? 4000,
    store: false
  };

  if (options.reasoningEffort) {
    payload.reasoning = {
      effort: options.reasoningEffort
    };
  }

  if (options.textFormat) {
    payload.text = {
      format: options.textFormat
    };
  }

  const response = await fetch(resolveApiUrl("/responses"), {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const body = (await safeParseJson(response)) as OpenAIErrorResponse | undefined;
    const message = body?.error?.message ?? `HTTP ${response.status}`;
    throw new Error(`OpenAI API request failed: ${message}`);
  }

  return safeParseJson(response);
}

function resolveApiUrl(pathname: string) {
  const baseUrl = process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  return `${baseUrl.replace(/\/$/, "")}${pathname}`;
}

async function safeParseJson(response: Response) {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return undefined;
  }
}

function extractResponseText(response: Record<string, unknown> | undefined) {
  if (!response) {
    throw new Error("OpenAI API returned an empty response body.");
  }

  if (typeof response.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  const chunks: string[] = [];
  const outputs = Array.isArray(response.output) ? response.output : [];

  for (const output of outputs) {
    if (!output || typeof output !== "object") {
      continue;
    }

    const content = Array.isArray((output as { content?: unknown[] }).content)
      ? ((output as { content: unknown[] }).content as unknown[])
      : [];

    for (const part of content) {
      if (!part || typeof part !== "object") {
        continue;
      }

      const typedPart = part as { type?: unknown; text?: unknown };
      if (typedPart.type !== "output_text" && typedPart.type !== "text") {
        continue;
      }

      if (typeof typedPart.text === "string") {
        chunks.push(typedPart.text);
        continue;
      }

      if (
        typedPart.text &&
        typeof typedPart.text === "object" &&
        typeof (typedPart.text as { value?: unknown }).value === "string"
      ) {
        chunks.push((typedPart.text as { value: string }).value);
      }
    }
  }

  const text = chunks.join("\n").trim();
  if (!text) {
    throw new Error("OpenAI API returned no text output.");
  }

  return text;
}
