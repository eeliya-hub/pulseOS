import { api } from '../api/backendClient.js';

// A step is one model turn. Reading the calendar, searching, then acting on what
// came back is three on its own — six left complex requests cut off half-done,
// which is what "it misses things" looked like from the outside.
const MAX_STEPS = 12;

/**
 * Run the read/write agent loop: send the conversation to the model with tools;
 * while it returns tool calls, execute them and feed the results back; stop when
 * it returns a text answer.
 *
 * @param {object} p
 * @param {Array<{role:'user'|'assistant', content:string}>} p.messages
 * @param {(calls:Array<{name,args}>)=>Promise<Array<{call,result}>>} p.executeBatch
 *        runs every call the model made in one step together
 * @param {string} [p.userName]
 * @param {string} [p.instructions] the user's persona preferences for Pulse
 * @param {(calls:Array<{name,args}>)=>void} [p.onTools] called as each step's calls start
 * @returns {Promise<string>} the assistant's final text
 */
export async function runAgent({ messages, executeBatch, userName, instructions, onTools }) {
  const convo = [...messages];

  for (let step = 0; step < MAX_STEPS; step += 1) {
    // Ask for plenty of output room so long answers (daily briefs, etc.) aren't
    // cut off mid-sentence. The backend still clamps this to its own cap.
    const res = await api.ai.chat({ messages: convo, tools: true, userName, instructions, maxTokens: 4096 });

    if (res.toolCalls?.length) {
      convo.push({ role: 'assistant', toolCalls: res.toolCalls });
      onTools?.(res.toolCalls);
      // Several calls in one step are several parts of one request — run them
      // together, and hand the results back in the order they were asked for.
      const outcomes = await executeBatch(res.toolCalls);
      for (const { call, result } of outcomes) {
        convo.push({ role: 'tool', name: call.name, content: JSON.stringify(result ?? {}) });
      }
      continue;
    }

    return res.text?.trim() || 'Done.';
  }

  // Out of steps: ask the model to answer from what it already gathered rather
  // than throwing the work away.
  const summary = await api.ai
    .chat({
      messages: [...convo, { role: 'user', content: 'Answer now with everything you have gathered so far.' }],
      tools: false,
      userName,
      instructions,
      maxTokens: 2048,
    })
    .catch(() => null);
  return summary?.text?.trim() || "That took more steps than I have — could you narrow it down a little?";
}
