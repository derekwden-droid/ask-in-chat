// Runs scripts/ask-in-chat.mjs the way Claude Code does: PreToolUse input as JSON on stdin,
// reply as JSON on stdout. Transcript rows are shaped like the ones Claude Code 2.1.299 writes.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { choicesOf, handle, questionOf, settings } from '../scripts/lib/hook.mjs';
import { sentBackThisPrompt } from '../scripts/lib/transcript.mjs';

const SCRIPT = fileURLToPath(new URL('../scripts/ask-in-chat.mjs', import.meta.url));
const TOOL = 'mcp__ccd_turn__wrap_up';
const MARKER = '[ask-in-chat]';
const PROMPT = '6f1c2a54-9d3e-4b7a-8c21-0e5f3d9b7a10';
const OTHER_PROMPT = '0b8e7d65-1f2a-4c3b-9d4e-5a6b7c8d9e0f';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ask-in-chat-test-'));
test.after(() => fs.rmSync(root, { recursive: true, force: true }));

let counter = 0;
function transcript(rows) {
  counter += 1;
  const file = path.join(root, 'session-' + counter + '.jsonl');
  fs.writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return file;
}

const prompt = (text, promptId = PROMPT) => ({ type: 'user', promptId, message: { role: 'user', content: text } });
const call = (id, name, input, promptId = PROMPT) => ({
  type: 'assistant',
  promptId,
  message: { id: 'msg_' + id, role: 'assistant', content: [{ type: 'tool_use', id, name, input }] },
});
const result = (id, content, isError, promptId = PROMPT) => ({
  type: 'user',
  promptId,
  message: { role: 'user', content: [{ tool_use_id: id, type: 'tool_result', content, is_error: isError }] },
});
const sentBack = (id, promptId = PROMPT) =>
  result(id, 'PreToolUse:' + TOOL + ' hook error: ' + MARKER + ' The question box is off in this session.', true, promptId);
const withoutPromptId = (row) => {
  const copy = { ...row };
  delete copy.promptId;
  return copy;
};

const BOX = {
  recap: 'Drafted the refund reply. Nothing is sent yet.',
  ask: 'Send this reply?',
  actions: [{ label: 'Send it', message: 'Send the reply as drafted.' }, { label: 'Not yet' }],
  blocked: true,
};

function input(toolInput, transcriptPath, extra = {}) {
  return {
    session_id: 'session',
    transcript_path: transcriptPath,
    cwd: root,
    prompt_id: PROMPT,
    hook_event_name: 'PreToolUse',
    tool_name: TOOL,
    tool_input: toolInput,
    tool_use_id: 'toolu_now',
    ...extra,
  };
}

function run(hookInput, args = []) {
  const res = spawnSync(process.execPath, [SCRIPT, ...args], {
    input: typeof hookInput === 'string' ? hookInput : JSON.stringify(hookInput),
    encoding: 'utf8',
    env: { SystemRoot: process.env.SystemRoot },
  });
  return { status: res.status, stderr: res.stderr, reply: res.stdout ? JSON.parse(res.stdout) : null };
}

// A transcript as it stands when Claude calls wrap_up with a question for the first time.
function firstAsk(promptId = PROMPT) {
  return transcript([
    prompt('Draft a refund reply and ask me before sending it.', promptId),
    call('toolu_read', 'Read', { file_path: 'policy.md' }, promptId),
    result('toolu_read', 'Refunds within 30 days.', false, promptId),
    call('toolu_now', TOOL, BOX, promptId),
  ]);
}

test('sends a question back once by default and says how to ask in the chat instead', () => {
  const { status, reply } = run(input(BOX, firstAsk()));
  assert.equal(status, 0);
  const out = reply.hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.equal(out.permissionDecision, 'deny');
  assert.equal(out.updatedInput, undefined);
  assert.ok(out.permissionDecisionReason.startsWith(MARKER));
  assert.match(out.permissionDecisionReason, /Call wrap_up again now with the same recap and no ask, actions or blocked/);
  assert.match(out.permissionDecisionReason, /Write no text before that call/);
  assert.match(out.permissionDecisionReason, /closing message/);
  assert.match(out.permissionDecisionReason, /102132/);
});

test('takes the question out instead when it was already sent back this prompt', () => {
  const file = transcript([
    prompt('Draft a refund reply and ask me before sending it.'),
    call('toolu_first', TOOL, BOX),
    sentBack('toolu_first'),
    call('toolu_now', TOOL, BOX),
  ]);
  const { reply } = run(input(BOX, file));
  const out = reply.hookSpecificOutput;
  assert.equal(out.permissionDecision, undefined);
  assert.deepEqual(out.updatedInput, { recap: BOX.recap });
  assert.ok(out.additionalContext.startsWith(MARKER));
  assert.match(out.additionalContext, /Took the question "Send this reply\?" out of the next-step box/);
  assert.match(out.additionalContext, /The choices you offered: "Send it", "Not yet"\./);
  assert.match(out.additionalContext, /Do not call wrap_up again this turn/);
});

test('a question sent back during an earlier prompt does not count', () => {
  const file = transcript([
    prompt('First request.', OTHER_PROMPT),
    call('toolu_old', TOOL, BOX, OTHER_PROMPT),
    sentBack('toolu_old', OTHER_PROMPT),
    call('toolu_old2', TOOL, { recap: 'Done.' }, OTHER_PROMPT),
    result('toolu_old2', 'Nothing is pending, so the app draws no box.', false, OTHER_PROMPT),
    prompt('Second request.'),
    call('toolu_now', TOOL, BOX),
  ]);
  assert.equal(run(input(BOX, file)).reply.hookSpecificOutput.permissionDecision, 'deny');
});

test('with buttons=keep the question is taken out at once and nothing is sent back', () => {
  const { reply } = run(input(BOX, firstAsk()), ['--buttons=keep']);
  const out = reply.hookSpecificOutput;
  assert.equal(out.permissionDecision, undefined);
  assert.deepEqual(out.updatedInput, { recap: BOX.recap });
  assert.match(out.additionalContext, /The box may still show its buttons/);
});

test('a recap alone, other tools and other events pass through untouched', () => {
  const file = firstAsk();
  assert.equal(run(input({ recap: 'All done.' }, file)).reply, null);
  assert.equal(run(input({ recap: 'All done.', ask: '   ' }, file)).reply, null);
  assert.equal(run(input(BOX, file, { tool_name: 'mcp__ccd_turn__update_plan' })).reply, null);
  assert.equal(run(input(BOX, file, { tool_name: 'AskUserQuestion' })).reply, null);
  assert.equal(run(input(BOX, file, { hook_event_name: 'PostToolUse' })).reply, null);
});

test('handles the older next_ field names and keeps every other field', () => {
  const old = { recap: 'Done.', next_ask: 'Push now?', next_actions: [{ label: 'Push' }], status: 'ok', extra: { a: 1 } };
  const { reply } = run(input(old, firstAsk()), ['--buttons=keep']);
  assert.deepEqual(reply.hookSpecificOutput.updatedInput, { recap: 'Done.', status: 'ok', extra: { a: 1 } });
  assert.match(reply.hookSpecificOutput.additionalContext, /"Push now\?"/);
  assert.match(reply.hookSpecificOutput.additionalContext, /"Push"/);
  assert.equal(questionOf({ next_brief: ' Ship it? ' }), 'Ship it?');
});

test('buttons without a question are taken out too', () => {
  const { reply } = run(input({ recap: 'Done.', actions: [{ label: 'Commit' }] }, firstAsk()), ['--buttons=keep']);
  assert.deepEqual(reply.hookSpecificOutput.updatedInput, { recap: 'Done.' });
  assert.match(reply.hookSpecificOutput.additionalContext, /Took the answer buttons out/);
  assert.deepEqual(choicesOf({ actions: [{ label: ' A ' }, {}, null, { label: 'B' }] }), ['A', 'B']);
});

test('never sends back when the transcript is missing or unreadable', () => {
  const missing = path.join(root, 'no-such-session.jsonl');
  const { reply } = run(input(BOX, missing));
  assert.equal(reply.hookSpecificOutput.permissionDecision, undefined);
  assert.deepEqual(reply.hookSpecificOutput.updatedInput, { recap: BOX.recap });
  assert.equal(run(input(BOX, undefined)).reply.hookSpecificOutput.permissionDecision, undefined);
});

test('a transcript without prompt ids is judged by its latest tool result', () => {
  const fresh = transcript([prompt('Ask me.'), call('toolu_r', 'Read', {}), result('toolu_r', 'text', false), call('toolu_now', TOOL, BOX)].map(withoutPromptId));
  assert.equal(run(input(BOX, fresh)).reply.hookSpecificOutput.permissionDecision, 'deny');
  const retry = transcript([prompt('Ask me.'), call('toolu_first', TOOL, BOX), sentBack('toolu_first'), call('toolu_now', TOOL, BOX)].map(withoutPromptId));
  assert.equal(run(input(BOX, retry)).reply.hookSpecificOutput.permissionDecision, undefined);
});

test('a file that merely quotes the marker does not count as a send-back', () => {
  const file = transcript([
    prompt('Show me the hook script.'),
    call('toolu_read', 'Read', { file_path: 'hook.mjs' }),
    result('toolu_read', "const reason = 'hook error: " + MARKER + " ...';", false),
    call('toolu_now', TOOL, BOX),
  ]);
  assert.equal(sentBackThisPrompt(file, PROMPT, MARKER), false);
  assert.equal(run(input(BOX, file)).reply.hookSpecificOutput.permissionDecision, 'deny');
});

test('reads tool results given as content blocks', () => {
  const file = transcript([
    prompt('Ask me.'),
    call('toolu_first', TOOL, BOX),
    { ...sentBack('toolu_first'), message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_first', is_error: true, content: [{ type: 'text', text: 'PreToolUse:' + TOOL + ' hook error: ' + MARKER + ' sent back' }] }] } },
  ]);
  assert.equal(sentBackThisPrompt(file, PROMPT, MARKER), true);
});

test('settings default to off and ignore unknown values', () => {
  assert.deepEqual(settings([]), { buttons: 'off' });
  assert.deepEqual(settings(['--buttons=KEEP']), { buttons: 'keep' });
  assert.deepEqual(settings(['--buttons=sometimes']), { buttons: 'off' });
  assert.deepEqual(settings(['--buttons=']), { buttons: 'off' });
});

test('handle ignores input that is not an object', () => {
  assert.equal(handle(null), null);
  assert.equal(handle(input('ask', firstAsk())), null);
  assert.equal(handle(input([BOX], firstAsk())), null);
});

test('a long question is shortened in the note', () => {
  const long = 'Is this right? '.repeat(40).trim();
  const { reply } = run(input({ recap: 'Done.', ask: long }, firstAsk()), ['--buttons=keep']);
  const note = reply.hookSpecificOutput.additionalContext;
  assert.ok(note.length < 1200);
  assert.match(note, /\.\.\."/);
});

test('bad input exits 1 and prints nothing, so Claude Code lets the call through', () => {
  const res = run('{ not json');
  assert.equal(res.status, 1);
  assert.equal(res.reply, null);
  assert.match(res.stderr, /^ask-in-chat: /);
});
