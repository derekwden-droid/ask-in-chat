// What ask-in-chat does before the Claude desktop app fills its next-step box.
//
// In the Code tab, Claude ends a turn by calling the app's wrap_up tool with a recap and, when
// it wants an answer, a question (`ask`) with one or two answer buttons (`actions`). A call
// that carries a question ends the turn at the box, so a reply Claude meant to write after it
// never appears, and a reply written just before it can be swapped for a one-line summary
// (anthropics/claude-code#102132). The order that never loses the reply is a box with the
// recap alone, followed by the reply itself. ask-in-chat keeps Claude on that order:
// - with buttons "off" (the default) a wrap_up that carries a question is sent back once, and
//   Claude calls it again with the recap alone, then writes its reply and the question;
// - with buttons "keep", or when Claude sends the question again anyway, the question is taken
//   out of what the app receives, so the turn goes on past the box, and Claude is told to write
//   its reply and the question as its closing message. The app draws the box from Claude's own
//   call, which a hook can't change, so the buttons still show.

import { sentBackThisPrompt } from './transcript.mjs';

export const MARKER = '[ask-in-chat]';
export const TOOL = 'mcp__ccd_turn__wrap_up';
// Earlier versions of the tool named the question and the buttons with a next_ prefix.
const QUESTION_FIELDS = ['ask', 'next_ask', 'next_brief'];
const BUTTON_FIELDS = ['actions', 'next_actions'];
const BOX_FIELDS = new Set([...QUESTION_FIELDS, ...BUTTON_FIELDS, 'blocked']);
const MODES = new Set(['off', 'keep']);
const QUOTE_MAX = 300;
const ISSUE = 'anthropics/claude-code#102132';

// The options the hook was started with: --buttons=off|keep.
export function settings(argv = []) {
  const arg = argv.find((a) => a.startsWith('--buttons='));
  const mode = arg ? arg.slice('--buttons='.length).trim().toLowerCase() : '';
  return { buttons: MODES.has(mode) ? mode : 'off' };
}

// The question a wrap_up call puts in the box, or '' when it asks nothing.
export function questionOf(args) {
  for (const field of QUESTION_FIELDS) {
    if (typeof args[field] === 'string' && args[field].trim()) return args[field].trim();
  }
  return '';
}

// The labels of the answer buttons a wrap_up call asks for.
export function choicesOf(args) {
  const list = BUTTON_FIELDS.map((field) => args[field]).find((v) => Array.isArray(v) && v.length > 0) || [];
  return list.map((b) => (b && typeof b.label === 'string' ? b.label.trim() : '')).filter(Boolean);
}

function quote(text) {
  const short = text.length > QUOTE_MAX ? text.slice(0, QUOTE_MAX).trimEnd() + '...' : text;
  return JSON.stringify(short);
}

const REPLY = 'write your full reply as your closing message: what you found or did, everything the question is ' +
  'about (the draft, the options, the findings) written out in full, and then the question itself, with the ' +
  'choices spelled out';

function sendBackReason() {
  return MARKER + ' The question box is off in this session. A wrap_up that carries a question ends the turn ' +
    'at the box, and the reply around it can be lost (' + ISSUE + '). Do this instead, in this order:\n' +
    '1. Call wrap_up again now with the same recap and no ask, actions or blocked. Write no text before that call.\n' +
    '2. After its result, ' + REPLY + '.\n' +
    'Nothing is wrong with your work; only where the question goes changes.';
}

function rewrittenNote(question, choices) {
  const asked = question ? 'the question ' + quote(question) : 'the answer buttons';
  const offered = choices.length > 0 ? ' The choices you offered: ' + choices.map((c) => quote(c)).join(', ') + '.' : '';
  return MARKER + ' Took ' + asked + ' out of the next-step box, so this turn does not end there: a box with a ' +
    'question can hide the reply around it (' + ISSUE + '). The box may still show its buttons.' + offered +
    ' Now ' + REPLY + '. Do not call wrap_up again this turn.';
}

// PreToolUse for wrap_up. Returns the hook reply, or null to let the call through unchanged.
export function handle(input, config = { buttons: 'off' }) {
  if (!input || input.hook_event_name !== 'PreToolUse' || input.tool_name !== TOOL) return null;
  const args = input.tool_input;
  if (!args || typeof args !== 'object' || Array.isArray(args)) return null;
  const question = questionOf(args);
  const choices = choicesOf(args);
  if (!question && choices.length === 0) return null;

  // Send the question back only once a prompt, and only when the transcript says so for sure:
  // if it can't be read, a second refusal could follow the first, so take the question out instead.
  if (config.buttons === 'off' && sentBackThisPrompt(input.transcript_path, input.prompt_id, MARKER) === false) {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: sendBackReason(),
      },
    };
  }

  const recapOnly = {};
  for (const [field, value] of Object.entries(args)) {
    if (!BOX_FIELDS.has(field)) recapOnly[field] = value;
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      updatedInput: recapOnly,
      additionalContext: rewrittenNote(question, choices),
    },
  };
}
