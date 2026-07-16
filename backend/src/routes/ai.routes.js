import { Router } from 'express';
import { aiController } from '../controllers/ai.controller.js';

export const aiRouter = Router();

// POST /api/ai/chat
aiRouter.post('/chat', aiController.chat);
