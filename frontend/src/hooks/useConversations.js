import { useCallback, useEffect, useState } from 'react';

const STORAGE_KEY = 'pulse.conversations.v1';

const greeting = {
  role: 'model',
  text:
    "Hey there. I'm here to help you plan your day, stay on top of your tasks, and catch you up on what matters.\n\nWhat would you like to focus on?",
};

function createConversation() {
  return {
    id: `c-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: 'New chat',
    messages: [greeting],
    updatedAt: Date.now(),
  };
}

function deriveTitle(messages) {
  const firstUser = messages.find((message) => message.role === 'user');
  if (!firstUser) return 'New chat';
  const trimmed = firstUser.text.trim().replace(/\s+/g, ' ');
  return trimmed.length > 42 ? `${trimmed.slice(0, 42)}…` : trimmed;
}

function loadInitial() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed?.conversations) && parsed.conversations.length) {
        const activeId = parsed.conversations.some((c) => c.id === parsed.activeId)
          ? parsed.activeId
          : parsed.conversations[0].id;
        return { conversations: parsed.conversations, activeId };
      }
    }
  } catch {
    // ignore malformed storage and fall through to a fresh conversation
  }
  const first = createConversation();
  return { conversations: [first], activeId: first.id };
}

export function useConversations() {
  const [state, setState] = useState(loadInitial);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // storage may be unavailable (private mode) — degrade to in-memory only
    }
  }, [state]);

  const active =
    state.conversations.find((conversation) => conversation.id === state.activeId) ??
    state.conversations[0];

  const setActiveMessages = useCallback((updater) => {
    setState((prev) => {
      const conversations = prev.conversations.map((conversation) => {
        if (conversation.id !== prev.activeId) return conversation;
        const messages =
          typeof updater === 'function' ? updater(conversation.messages) : updater;
        return {
          ...conversation,
          messages,
          title: deriveTitle(messages),
          updatedAt: Date.now(),
        };
      });
      return { ...prev, conversations };
    });
  }, []);

  const newConversation = useCallback(() => {
    setState((prev) => {
      const conversation = createConversation();
      return {
        conversations: [conversation, ...prev.conversations],
        activeId: conversation.id,
      };
    });
  }, []);

  const selectConversation = useCallback((id) => {
    setState((prev) => ({ ...prev, activeId: id }));
  }, []);

  const deleteConversation = useCallback((id) => {
    setState((prev) => {
      const remaining = prev.conversations.filter((conversation) => conversation.id !== id);
      if (!remaining.length) {
        const conversation = createConversation();
        return { conversations: [conversation], activeId: conversation.id };
      }
      const activeId = prev.activeId === id ? remaining[0].id : prev.activeId;
      return { conversations: remaining, activeId };
    });
  }, []);

  return {
    conversations: state.conversations,
    activeId: state.activeId,
    active,
    setActiveMessages,
    newConversation,
    selectConversation,
    deleteConversation,
  };
}
