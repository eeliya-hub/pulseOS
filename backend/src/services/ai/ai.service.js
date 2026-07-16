import { config } from '../../config/env.js';
import { ApiError } from '../../utils/ApiError.js';
import { claudeProvider } from './claude.provider.js';
import { geminiProvider } from './gemini.provider.js';
import { openaiProvider } from './openai.provider.js';
import { assertQuota, recordRequest, recordTokens } from './quota.js';
import { systemPrompt, TOOLS } from './tools.js';

// Provider registry. Swap the default with AI_PROVIDER in .env, or override
// per-request with { provider } — so the UI can pick Gemini / OpenAI / Claude
// without any backend change.
const providers = {
  gemini: geminiProvider,
  openai: openaiProvider,
  claude: claudeProvider,
};

function resolveProvider(name) {
  const key = (name || config.ai.provider || 'gemini').toLowerCase();
  const provider = providers[key];
  if (!provider) {
    throw ApiError.badRequest(`Unknown AI provider "${key}". Use one of: ${Object.keys(providers).join(', ')}.`);
  }
  return provider;
}

export const aiService = {
  providers,

  /**
   * @param {object} params
   * @param {Array<{role:'user'|'assistant', content:string}>} [params.messages]
   * @param {string} [params.prompt] convenience: single-shot user prompt
   * @param {string} [params.system]
   * @param {string} [params.provider] override the default provider
   * @param {string} [params.model]
   * @param {number} [params.maxTokens]
   */
  async chat({ messages, prompt, system, provider, model, maxTokens, tools, userName }) {
    const convo = messages?.length ? messages : prompt ? [{ role: 'user', content: prompt }] : null;
    if (!convo) throw ApiError.badRequest('Provide `prompt` or a non-empty `messages` array.');

    // When `tools` is requested, hand the model the tool schemas + the agent
    // system prompt so it can read/write the user's data.
    const toolSchemas = tools ? TOOLS : undefined;
    const useSystem = system ?? (tools ? systemPrompt(userName) : undefined);

    const chosen = resolveProvider(provider);

    // Usage cap first: a provider that has spent its budget never gets called,
    // so a cap can be reached but not exceeded. The attempt is counted before it
    // goes out, so an upstream failure still spends its share of the budget.
    assertQuota(chosen.id);
    recordRequest(chosen.id);

    const result = await chosen.chat({
      messages: convo,
      system: useSystem,
      model,
      // A request can ask for fewer tokens than the cap, never more.
      maxTokens: Math.min(maxTokens || 1024, config.ai.maxTokensCap),
      tools: toolSchemas,
    });

    recordTokens(chosen.id, result.usage);
    return result;
  },
};
