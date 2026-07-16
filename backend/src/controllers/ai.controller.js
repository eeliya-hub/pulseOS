import { aiService } from '../services/ai/ai.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const aiController = {
  // POST /api/ai/chat  { prompt | messages, system?, provider?, model?, maxTokens?, tools?, userName? }
  chat: asyncHandler(async (req, res) => {
    const { prompt, messages, system, provider, model, maxTokens, tools, userName } = req.body ?? {};
    res.json(await aiService.chat({ prompt, messages, system, provider, model, maxTokens, tools, userName }));
  }),
};
