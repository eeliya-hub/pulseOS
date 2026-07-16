import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

// Anthropic Claude — Messages API. No free tier; defaults to Haiku 4.5, the most
// affordable Claude model, to match the "very affordable" goal. Override with
// CLAUDE_MODEL (e.g. claude-opus-4-8 for the most capable).
const INTEGRATION = 'Claude';

export const claudeProvider = {
  id: 'claude',
  isConfigured: () => Boolean(config.ai.claudeKey),

  async chat({ messages, system, model, maxTokens = 1024 }) {
    if (!config.ai.claudeKey) throw ApiError.notConfigured(INTEGRATION);
    const useModel = model || config.ai.claudeModel;

    const body = {
      model: useModel,
      max_tokens: maxTokens,
      ...(system ? { system } : {}),
      messages: messages.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      })),
    };

    const data = await fetchJson('https://api.anthropic.com/v1/messages', {
      integration: INTEGRATION,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': config.ai.claudeKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    const text = (data.content ?? [])
      .filter((block) => block.type === 'text')
      .map((block) => block.text)
      .join('');
    const usage = { totalTokens: (data.usage?.input_tokens ?? 0) + (data.usage?.output_tokens ?? 0) };
    return { text, model: useModel, provider: this.id, usage };
  },
};
