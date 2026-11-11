interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface WorkerEnvironment {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  GEMINI_API_KEY?: string;
}

const SYSTEM_PROMPT = `
Your name is Ivy. You are an expert regulatory compliance assistant for health, wellness, and CPG brands.
When asked your name or identity, introduce yourself as Ivy.
Workshop marketing copy, claims, and product angles with the marketer.

Rules:
1. Keep replies concise, actionable, and no more than 2-3 sentences.
2. Distinguish structure/function claims from high-risk disease claims under FDA and FTC rules. Do not present this brainstorming as legal advice or guarantee compliance.
3. When a proposed claim is concrete enough for a full regulatory review, evaluate it briefly and offer that review.
4. For a concrete claim, append this exact tag at the very end of your response:
[AUDIT_READY: <clean proposed claim copy>]
Keep the proposed claim copy within 180 characters.
`;

const MAX_BODY_BYTES = 32_000;
const MAX_MESSAGES = 101;
const MAX_CONTEXT_MESSAGES = 6;
const MAX_MESSAGE_LENGTH = 3_000;
const MAX_CONVERSATION_LENGTH = 16_000;

function jsonResponse(body: Record<string, string>, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseMessages(value: unknown): ChatMessage[] | Response {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_MESSAGES) {
    return jsonResponse({ error: `Send between 1 and ${MAX_MESSAGES} chat messages.` }, 400);
  }

  const messages: ChatMessage[] = [];
  let totalLength = 0;
  for (const item of value) {
    if (!isRecord(item) || (item.role !== "user" && item.role !== "assistant") || typeof item.content !== "string") {
      return jsonResponse({ error: "Each chat message needs a valid role and text content." }, 400);
    }

    const content = item.content.trim();
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      return jsonResponse({ error: `Chat messages must contain 1-${MAX_MESSAGE_LENGTH} characters.` }, 400);
    }
    totalLength += content.length;
    if (totalLength > MAX_CONVERSATION_LENGTH) {
      return jsonResponse({ error: "This conversation is too long. Start a new chat." }, 413);
    }
    messages.push({ role: item.role, content });
  }

  if (messages[messages.length - 1].role !== "user") {
    return jsonResponse({ error: "The latest chat message must be from the user." }, 400);
  }

  return messages;
}

function extractReply(value: unknown): string | null {
  if (!isRecord(value) || !Array.isArray(value.candidates)) return null;
  const candidate = value.candidates[0];
  if (!isRecord(candidate) || !isRecord(candidate.content) || !Array.isArray(candidate.content.parts)) return null;
  const textPart = candidate.content.parts.find((part) => isRecord(part) && typeof part.text === "string");
  return isRecord(textPart) && typeof textPart.text === "string" ? textPart.text.trim() : null;
}

async function handleChat(request: Request, env: WorkerEnvironment): Promise<Response> {
  if (request.method !== "POST") {
    return new Response("Method not allowed.", {
      status: 405,
      headers: { Allow: "POST", "Cache-Control": "no-store" },
    });
  }

  if (!env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY is not configured for the chat Worker.");
    return jsonResponse({ error: "The chat service is not configured." }, 500);
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    return jsonResponse({ error: "The chat request is too large." }, 413);
  }

  let body: unknown;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return jsonResponse({ error: "The chat request is too large." }, 413);
    }
    body = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "Send a valid JSON chat request." }, 400);
  }

  if (!isRecord(body)) {
    return jsonResponse({ error: "The chat request must be a JSON object." }, 400);
  }

  const messages = parseMessages(body.messages);
  if (messages instanceof Response) return messages;
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);

  let geminiResponse: Response;
  try {
    geminiResponse = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": env.GEMINI_API_KEY,
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: recentMessages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig: { temperature: 0.3, maxOutputTokens: 400 },
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
  } catch (error) {
    console.error("Gemini chat request failed.", error);
    return jsonResponse({ error: "Gemini could not be reached. Please try again." }, 502);
  }

  let result: unknown;
  try {
    result = await geminiResponse.json();
  } catch (error) {
    console.error("Gemini returned an unreadable response.", error);
    return jsonResponse({ error: "Gemini returned an unreadable response. Please try again." }, 502);
  }

  if (!geminiResponse.ok) {
    console.error("Gemini chat request returned status", geminiResponse.status);
    return jsonResponse({ error: "Gemini could not process this request. Please try again." }, 502);
  }

  const reply = extractReply(result);
  if (!reply) {
    console.error("Gemini chat response did not contain reply text.");
    return jsonResponse({ error: "Gemini did not return a chat reply. Please try again." }, 502);
  }

  return jsonResponse({ reply });
}

export default {
  async fetch(request: Request, env: WorkerEnvironment): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/api/chat") {
      return handleChat(request, env);
    }
    return env.ASSETS.fetch(request);
  },
};
