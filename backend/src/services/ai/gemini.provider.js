import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

// Google Gemini — the most generous free tier of the three. Supports function
// calling, which powers the read/write assistant.
const INTEGRATION = 'Gemini';

// Normalized messages → Gemini `contents`. Handles plain text plus tool calls
// (assistant.toolCalls) and tool results (role:'tool').
function toContents(messages) {
  return messages.map((m) => {
    if (m.role === 'tool') {
      let response = {};
      try {
        const parsed = JSON.parse(m.content);
        response = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { result: parsed };
      } catch {
        response = { result: m.content };
      }
      return { role: 'user', parts: [{ functionResponse: { name: m.name, response } }] };
    }
    if (m.role === 'assistant' && m.toolCalls?.length) {
      return {
        role: 'model',
        // Gemini 3 is a thinking model — the functionCall's thoughtSignature must
        // be echoed back or the follow-up turn is rejected.
        parts: m.toolCalls.map((tc) => ({
          functionCall: { name: tc.name, args: tc.args ?? {} },
          ...(tc.thoughtSignature ? { thoughtSignature: tc.thoughtSignature } : {}),
        })),
      };
    }
    return { role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content ?? '' }] };
  });
}

/**
 * How much deliberation a request is worth.
 *
 * Gemini 3 takes a level; 2.5 took a numeric budget, and `thinkingBudget: 0`
 * remains the way to turn it off outright, so both are sent for "none".
 */
const thinkingFor = (level) =>
  level === 'none' ? { thinkingBudget: 0 } : { thinkingLevel: level === 'high' ? 'high' : 'low' };

export const geminiProvider = {
  id: 'gemini',
  isConfigured: () => Boolean(config.ai.geminiKey),

  async chat({ messages, system, model, maxTokens = 1024, tools, thinking, json }) {
    if (!config.ai.geminiKey) throw ApiError.notConfigured(INTEGRATION);
    const useModel = model || config.ai.geminiModel;

    const body = {
      contents: toContents(messages),
      generationConfig: {
        maxOutputTokens: maxTokens,
        /*
         * Gemini 3 thinks before it answers, and `maxOutputTokens` is the
         * budget for the thinking AND the answer together. That caught the mail
         * feature out badly: asking for a small JSON object inside a 700-token
         * budget spent ~670 of it reasoning and then stopped mid-string, so
         * every extraction came back as `{"title": "Design review", "date": "2` —
         * unparseable, and reported to the user as "Pulse could not read
         * anything definite out of that".
         *
         * A caller that knows the shape of what it wants can say how much
         * deliberation it is worth. "low" leaves room for the answer in a small
         * budget; "none" turns thinking off for work that is pure transcription.
         */
        ...(thinking ? { thinkingConfig: thinkingFor(thinking) } : {}),
        /*
         * And a caller that wants JSON can have it guaranteed rather than asked
         * for: a response schema makes the model emit exactly this shape, so
         * there is no fenced code block or "Here you go" to scrape off.
         */
        ...(json ? { responseMimeType: 'application/json', ...(json === true ? {} : { responseSchema: json }) } : {}),
      },
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
      ...(tools?.length ? { tools: [{ functionDeclarations: tools }] } : {}),
    };

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${useModel}:generateContent?key=${config.ai.geminiKey}`;
    const data = await fetchJson(url, {
      integration: INTEGRATION,
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });

    const parts = data.candidates?.[0]?.content?.parts ?? [];
    // Reported back to the quota meter, which enforces the daily/monthly token cap.
    const usage = { totalTokens: data.usageMetadata?.totalTokenCount ?? 0 };

    const toolCalls = parts
      .filter((p) => p.functionCall)
      .map((p) => ({
        name: p.functionCall.name,
        args: p.functionCall.args ?? {},
        ...(p.thoughtSignature ? { thoughtSignature: p.thoughtSignature } : {}),
      }));

    if (toolCalls.length) return { toolCalls, model: useModel, provider: this.id, usage };

    const text = parts.filter((p) => p.text).map((p) => p.text).join('');
    return { text, model: useModel, provider: this.id, usage };
  },
};
