import { aiService } from '../services/ai/ai.service.js';
import { ttsService } from '../services/ai/tts.service.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const aiController = {
  // POST /api/ai/chat  { prompt | messages, system?, provider?, model?, maxTokens?,
  //                      tools?, userName?, instructions?, thinking?, json? }
  chat: asyncHandler(async (req, res) => {
    const { prompt, messages, system, provider, model, maxTokens, tools, userName, instructions, thinking, json } =
      req.body ?? {};
    res.json(
      await aiService.chat({
        prompt, messages, system, provider, model, maxTokens, tools, userName, instructions, thinking, json,
      }),
    );
  }),

  // POST /api/ai/voice-preview  { voice, text? } → { audio (base64 wav), mimeType }
  voicePreview: asyncHandler(async (req, res) => {
    const { voice, text } = req.body ?? {};
    res.json(await ttsService.preview({ voice, text }));
  }),
};
