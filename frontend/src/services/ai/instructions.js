// Build the full instruction string sent to Pulse (text + voice): the user's
// persona preferences, plus their saved custom prompts described as named
// commands the assistant can trigger whenever the user references one by name.
export function buildAiInstructions(settings) {
  const parts = [];

  // Memories go FIRST. They are standing rules that change what Pulse does, and
  // when the whole block gets capped it is the tail that is lost — with them last,
  // a long persona or a few saved prompts silently pushed them out of the prompt.
  const memories = (settings?.memories || []).filter((m) => (m?.text || '').trim());
  if (memories.length) {
    const list = memories
      .slice(-60)
      .map((m) => `- ${m.text.trim()}`)
      .join('\n');
    parts.push(
      'WHAT YOU KNOW ABOUT THEM — facts and standing preferences learned in past conversations. Treat every one ' +
        'as a rule that is already in force, not as background reading. Apply them WITHOUT being asked, including ' +
        'when you are filling in the details of an action: which calendar something belongs on, what to put in the ' +
        'location, how long that kind of event runs, how to address them. If a preference here answers a question ' +
        'the user did not spell out, use it rather than falling back to a default. Do not recite them unprompted:\n' +
        list,
    );
  }


  const persona = (settings?.aiInstructions || '').trim();
  if (persona) parts.push(persona);

  const prompts = (settings?.customPrompts || []).filter((p) => (p?.prompt || '').trim());
  if (prompts.length) {
    const list = prompts
      .map((p) => `- "${(p.title || '').trim() || p.prompt.trim().slice(0, 30)}": ${p.prompt.trim()}`)
      .join('\n');
    parts.push(
      'THEIR SAVED COMMANDS. Each is a named command: when the user asks for one by its name — however they ' +
        'phrase it, typed or spoken (e.g. "give me my daily brief") — carry out its full instruction below, every ' +
        'part of it, exactly as if they had typed the whole thing:\n' +
        list,
    );
  }

  return parts.join('\n\n');
}
