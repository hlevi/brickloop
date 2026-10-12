import Anthropic from "@anthropic-ai/sdk";
import { COLORS } from "../catalog/colors";
import { env } from "../config";
import type { DesignParams } from "../model/types";
import type { ChatPlan } from "./mockChat";
import { COLOR_OPTIONS, SUPPORTED_EDITS_TEXT, toolDefinitions } from "./tools";

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

function systemPrompt(params: DesignParams): string {
  const opts = Object.entries(COLOR_OPTIONS[params.template])
    .map(([comp, colors]) => `- ${comp}: ${colors.map((c) => `${c} (${COLORS[c].name})`).join(", ")}`)
    .join("\n");
  return [
    "You help a customer customize a brick model kit through a fixed set of edit tools.",
    `Model: ${params.template}. Supported edits: ${SUPPORTED_EDITS_TEXT[params.template]}.`,
    `Current configuration (JSON): ${JSON.stringify(params)}`,
    `Allowed colors per component:\n${opts}`,
    "Rules:",
    "- Make changes only by calling the tools. You can call several tools in one reply.",
    "- If the request is ambiguous (for example a color without saying which part), ask one short clarifying question instead of guessing.",
    "- If the request is outside the supported edits (new parts, structural changes, building from a photo), say it isn't supported yet and list what is.",
    "- Keep replies to one or two short sentences. Never mention prices or delivery promises.",
    "- Your tool calls are re-validated by the application; unsupported values will be rejected.",
  ].join("\n");
}

/** Plan edits with a server-side LLM. The caller validates every tool call deterministically. */
export async function planWithLlm(history: ChatTurn[], message: string, params: DesignParams): Promise<ChatPlan> {
  const client = new Anthropic({ apiKey: env.anthropicKey });
  const response = await client.beta.messages.create({
    model: env.llmModel,
    max_tokens: 2000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: "low" },
    system: systemPrompt(params),
    tools: toolDefinitions(params.template).map((t) => ({ ...t, strict: true })),
    messages: [...history.slice(-10).map((t) => ({ role: t.role, content: t.content })), { role: "user" as const, content: message }],
  });
  if (response.stop_reason === "refusal") {
    return { calls: [], reply: "I can't help with that request. I can help you change this model's colors and size." };
  }
  const calls = response.content.flatMap((b) => (b.type === "tool_use" ? [{ name: b.name, input: (b.input ?? {}) as Record<string, unknown> }] : []));
  const text = response.content
    .flatMap((b) => (b.type === "text" ? [b.text] : []))
    .join(" ")
    .trim();
  return { calls, reply: text || null };
}
