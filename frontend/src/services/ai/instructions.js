// Build the full instruction string sent to Pulse (text + voice): the user's
// persona preferences, plus their saved custom prompts described as named
// commands the assistant can trigger whenever the user references one by name.
export function buildAiInstructions(settings) {
  const parts = [];

  const persona = (settings?.aiInstructions || '').trim();
  if (persona) parts.push(persona);

  const prompts = (settings?.customPrompts || []).filter((p) => (p?.prompt || '').trim());
  if (prompts.length) {
    const list = prompts
      .map((p) => `- "${(p.title || '').trim() || p.prompt.trim().slice(0, 30)}": ${p.prompt.trim()}`)
      .join('\n');
    parts.push(
      'The user has these saved prompts. Treat each as a named command: if the user asks for one by its ' +
        'name/title — however they phrase it, in text OR voice (e.g. "give me my daily brief") — carry out its ' +
        'full instruction below exactly as if they had typed it:\n' +
        list,
    );
  }

  // Long-term memory — durable facts learned in past conversations. Kept last so
  // it's the freshest context; capped so the prompt stays lean.
  const memories = (settings?.memories || []).filter((m) => (m?.text || '').trim());
  if (memories.length) {
    const list = memories
      .slice(-60)
      .map((m) => `- ${m.text.trim()}`)
      .join('\n');
    parts.push(
      "Things you remember about the user from past conversations. Use them naturally to personalize your help; " +
        "don't recite them unprompted:\n" +
        list,
    );
  }

  return parts.join('\n\n');
}
