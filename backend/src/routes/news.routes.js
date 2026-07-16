import { Router } from 'express';
import { newsController } from '../controllers/news.controller.js';

export const newsRouter = Router();

// GET /api/news?category=technology&country=gb
newsRouter.get('/', newsController.headlines);
// GET /api/news/search?q=markets
newsRouter.get('/search', newsController.search);
// GET /api/news/local?q=ashford
newsRouter.get('/local', newsController.local);
