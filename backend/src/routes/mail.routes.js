import { Router } from 'express';
import { mailController } from '../controllers/mail.controller.js';

export const mailRouter = Router();

// What's set up, which accounts are connected, and what each provider can do.
mailRouter.get('/status', mailController.status);

// The Life Hub card, in one request.
mailRouter.get('/summary', mailController.summary);

// Mailboxes, with unread counts where the provider keeps them.
mailRouter.get('/mailboxes', mailController.mailboxes);

// Reading. The attachment route sits above /messages/:id so its longer path
// isn't swallowed by it.
mailRouter.get('/messages', mailController.list);
mailRouter.get('/messages/:id/attachments/:attachmentId', mailController.attachment);
mailRouter.get('/messages/:id', mailController.message);
mailRouter.get('/threads/:threadId', mailController.thread);

// What the assistant may read — bounded scopes only.
mailRouter.get('/context', mailController.context);

// Changing state. Everything here is reached from a user action.
mailRouter.patch('/messages/:id', mailController.patch);
mailRouter.post('/messages/:id/move', mailController.move);
mailRouter.post('/send', mailController.send);
mailRouter.post('/drafts', mailController.saveDraft);
mailRouter.delete('/drafts/:draftId', mailController.deleteDraft);

/*
 * OAuth, per provider. Last, because `/:provider/auth` would otherwise match
 * the fixed paths above — `/status` would be read as the provider "status".
 */
mailRouter.get('/:provider/auth', mailController.auth);
mailRouter.get('/:provider/callback', mailController.callback);
mailRouter.post('/accounts/:id/disconnect', mailController.disconnect);
