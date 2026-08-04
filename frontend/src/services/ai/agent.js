import { api } from '../api/backendClient.js';

const MAX_STEPS = 6;

/**
 * Run the read/write agent loop: send the conversation to the model with tools;
 * while it returns tool calls, execute them and feed the results back; stop when
 * it returns a text answer.
 *
 * @param {object} p
 * @param {Array<{role:'user'|'assistant', content:string}>} p.messages
 * @param {(name:string, args:object)=>Promise<object>} p.execute
 * @param {string} [p.userName]
 * @param {string} [p.instructions] the user's persona preferences for Pulse
 * @param {(name:string, args:object)=>void} [p.onTool] called as each tool runs
 * @returns {Promise<string>} the assistant's final text
 */
export async function runAgent({ messages, execute, userName, instructions, onTool }) {
  const convo = [...messages];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    // Ask for plenty of output room so long answers (daily briefs, etc.) aren't
    // cut off mid-sentence. The backend still clamps this to its own cap.
    const res = await api.ai.chat({ messages: convo, tools: true, userName, instructions, maxTokens: 4096 });

    if (res.toolCalls?.length) {
      convo.push({ role: 'assistant', toolCalls: res.toolCalls });
      for (const call of res.toolCalls) {
        onTool?.(call.name, call.args);
        const result = await execute(call.name, call.args);
        convo.push({ role: 'tool', name: call.name, content: JSON.stringify(result ?? {}) });
      }
      continue;
    }

    return res.text?.trim() || 'Done.';
  }

  return "That needed too many steps — mind rephrasing what you'd like me to do?";
}
