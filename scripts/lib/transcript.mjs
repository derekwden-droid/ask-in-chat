// Reads the session transcript to see whether ask-in-chat already sent a question back during
// the current prompt. A sent-back call is recorded as a user row holding an error tool_result
// whose text is "PreToolUse:<tool> hook error: <reason>", and every row carries the promptId of
// the user prompt being processed, which hooks receive as prompt_id.

import fs from 'node:fs';

const TAIL_BYTES = 768 * 1024;

// The last TAIL_BYTES of the file, starting at a whole line, or null when it can't be read.
function readTail(file) {
  if (typeof file !== 'string' || file === '') return null;
  try {
    const size = fs.statSync(file).size;
    const length = Math.min(size, TAIL_BYTES);
    const fd = fs.openSync(file, 'r');
    try {
      const buf = Buffer.alloc(length);
      fs.readSync(fd, buf, 0, length, size - length);
      const text = buf.toString('utf8');
      return length < size ? text.slice(text.indexOf('\n') + 1) : text;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return null;
  }
}

function parse(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function resultText(block) {
  if (typeof block.content === 'string') return block.content;
  if (Array.isArray(block.content)) return block.content.map((b) => (b && typeof b.text === 'string' ? b.text : '')).join('\n');
  return '';
}

// True for the tool result of a call ask-in-chat sent back: an error whose text is the hook's
// reason. A Read or Bash result that merely quotes the marker isn't an error, so it never counts.
function isSendBack(block, marker) {
  return block.type === 'tool_result' && block.is_error === true && resultText(block).includes('hook error: ' + marker);
}

// Whether a call was already sent back during the prompt `promptId`: true or false, or null
// when the transcript can't be read. A transcript whose rows carry no promptId (older Claude
// Code versions) is judged by its most recent tool result alone.
export function sentBackThisPrompt(file, promptId, marker) {
  const text = readTail(file);
  if (text === null) return null;
  let rowsHavePromptIds = false;
  let thisPrompt = false;
  let latest = false;
  for (const line of text.split('\n')) {
    if (!line.includes('"tool_result"')) continue;
    const row = parse(line);
    if (!row || row.type !== 'user' || !row.message || !Array.isArray(row.message.content)) continue;
    const results = row.message.content.filter((b) => b && b.type === 'tool_result');
    if (results.length === 0) continue;
    const sent = results.some((b) => isSendBack(b, marker));
    if (typeof row.promptId === 'string') {
      rowsHavePromptIds = true;
      if (row.promptId === promptId && sent) thisPrompt = true;
    }
    latest = sent;
  }
  return typeof promptId === 'string' && promptId && rowsHavePromptIds ? thisPrompt : latest;
}
