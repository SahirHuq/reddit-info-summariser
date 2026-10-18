import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-5-5";
// The app sends tier "quick" for bulk summarising and "default" for chat and synthesis.
const EFFORT_BY_TIER = { quick: "low", default: "medium" };
const MAX_TURNS = 60;
const MAX_INPUT_CHARS = 400_000;
const MIN_OUTPUT_TOKENS = 256;
const MAX_OUTPUT_TOKENS = 16_000;

function errorResponse(status, code, error) {
  return Response.json({ code, error }, { status });
}

function isValidTurn(turn) {
  return (
    turn !== null &&
    typeof turn === "object" &&
    (turn.role === "user" || turn.role === "assistant") &&
    typeof turn.content === "string" &&
    turn.content.length > 0
  );
}

// Returns either { error } or { system, messages, effort, maxTokens }.
function parseRequest(body) {
  if (body === null || typeof body !== "object") {
    return { error: "Body must be a JSON object" };
  }
  const { system, turns, tier, maxTokens } = body;
  if (system !== undefined && typeof system !== "string") {
    return { error: "system must be a string" };
  }
  if (!Array.isArray(turns) || turns.length === 0 || turns.length > MAX_TURNS) {
    return { error: `turns must be an array of 1-${MAX_TURNS} messages` };
  }
  if (!turns.every(isValidTurn)) {
    return { error: "each turn needs role user|assistant and non-empty string content" };
  }
  if (turns[0].role !== "user") {
    return { error: "the first turn must be from the user" };
  }
  const inputChars = (system ?? "").length + turns.reduce((n, t) => n + t.content.length, 0);
  if (inputChars > MAX_INPUT_CHARS) {
    return { error: `input too large (${inputChars} chars, max ${MAX_INPUT_CHARS})` };
  }
  const requested = Number.isFinite(maxTokens) ? Math.floor(maxTokens) : MAX_OUTPUT_TOKENS;
  return {
    system,
    messages: turns.map(({ role, content }) => ({ role, content })),
    effort: EFFORT_BY_TIER[tier] ?? EFFORT_BY_TIER.default,
    maxTokens: Math.min(MAX_OUTPUT_TOKENS, Math.max(MIN_OUTPUT_TOKENS, requested)),
  };
}

// A visitor's own key (sent from Settings) takes priority over the server key.
function resolveApiKey(request) {
  const visitorKey = request.headers.get("x-anthropic-key")?.trim();
  if (visitorKey) return visitorKey;
  return process.env.ANTHROPIC_API_KEY;
}

function apiErrorResponse(err) {
  if (err instanceof Anthropic.AuthenticationError) {
    return errorResponse(401, "bad_key", "The Anthropic API key was rejected");
  }
  if (err instanceof Anthropic.RateLimitError) {
    return errorResponse(429, "rate_limited", "Rate limited by Anthropic, try again shortly");
  }
  if (err instanceof Anthropic.BadRequestError) {
    return errorResponse(400, "bad_request", `[ai/complete] Anthropic rejected the request: ${err.message}`);
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return errorResponse(502, "upstream_unreachable", `[ai/complete] Could not reach Anthropic: ${err.message}`);
  }
  if (err instanceof Anthropic.APIError) {
    return errorResponse(502, "upstream_error", `[ai/complete] Anthropic API error ${err.status}: ${err.message}`);
  }
  throw err;
}

export async function POST(request) {
  const apiKey = resolveApiKey(request);
  if (!apiKey) {
    return errorResponse(401, "no_key", "No AI key. Paste an Anthropic API key in Settings.");
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return errorResponse(400, "bad_json", "[ai/complete] Request body is not valid JSON");
  }
  const parsed = parseRequest(body);
  if (parsed.error) return errorResponse(400, "bad_request", `[ai/complete] ${parsed.error}`);

  const client = new Anthropic({ apiKey });
  let response;
  try {
    response = await client.messages.create({
      model: MODEL,
      max_tokens: parsed.maxTokens,
      system: parsed.system,
      messages: parsed.messages,
      output_config: { effort: parsed.effort },
    });
  } catch (err) {
    return apiErrorResponse(err);
  }

  if (response.stop_reason === "refusal") {
    return errorResponse(422, "refusal", "Claude declined this request");
  }
  const text = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("");
  if (!text) {
    return errorResponse(502, "empty_response", `[ai/complete] No text returned (stop_reason: ${response.stop_reason})`);
  }
  return Response.json({ text, stopReason: response.stop_reason });
}
