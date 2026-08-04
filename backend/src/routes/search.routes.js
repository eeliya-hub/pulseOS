import { Router } from 'express';
import { searchController } from '../controllers/search.controller.js';

export const searchRouter = Router();

// GET /api/search?q=who won the game last night
searchRouter.get('/', searchController.web);
// GET /api/search/status
searchRouter.get('/status', searchController.status);
