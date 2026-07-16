import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { fetchJson } from '../../utils/httpClient.js';

// OpenAI — Chat Completions REST endpoint. No free tier (pay-as-you-go), included
// as a swappable option.
const INTEGRATION = 'OpenAI';

export const openaiProvider = {
  id: 'openai',
  isConfigured: () => Boolean(config.ai.openaiKey),

  async chat({ messages, system, model, maxTokens = 1024 }) {
    if (!config.ai.openaiKey) throw ApiError.notConfigured(INTEGRATION);
    const useModel = model || config.ai.openaiModel;

    const body = {
      model: useModel,
      max_tokens: maxTokens,
      messages: [...(system ? [{ role: 'system', content: system }] : []), ...messages],
    };

    const data = await fetchJson('https://api.openai.com/v1/chat/completions', {
      integration: INTEGRATION,
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${config.ai.openaiKey}`,
      },
      body: JSON.stringify(body),
    });

    return {
      text: data.choices?.[0]?.message?.content ?? '',
      model: useModel,
      provider: this.id,
      usage: { totalTokens: data.usage?.total_tokens ?? 0 },
    };
  },
};
