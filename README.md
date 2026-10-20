# ask-in-chat

In the Claude desktop app's Code tab, Claude ends many turns with a next-step box: a short recap, a question, and one or two answer buttons. When the box carries a question, two things go wrong:

- **The turn ends at the box.** Since desktop 2.42304.0, a box with a question stops the turn right there, so the reply Claude meant to write after it never appears.
- **The reply before the box can be swapped out.** Text Claude writes just before the box can be replaced by a one-line summary.

So you get asked to approve a draft you never saw, or to pick between options that were never listed ([anthropics/claude-code#102132](https://github.com/anthropics/claude-code/issues/102132), [#103169](https://github.com/anthropics/claude-code/issues/103169), [#103036](https://github.com/anthropics/claude-code/issues/103036), [#103084](https://github.com/anthropics/claude-code/issues/103084)). If you follow the session from the iOS app, the box isn't shown at all, so Claude waits for an answer to a question you never saw. And many people would simply rather talk a decision through in the chat than click one of two buttons ([#102273](https://github.com/anthropics/claude-code/issues/102273)).

It isn't rare. In one real Code tab session on Windows (Claude Code 2.1.299), 3 of the 4 question boxes Claude ended a turn with came with no reply text at all after its last tool call, and all 3 ended the turn at the box.

ask-in-chat is a hook that keeps Claude on the one order that never loses a reply: the box with the recap alone, then the full reply, ending with the question, in the chat. Because the question is in the chat, you see it on your phone too.

## How it works

Before the box is filled, the hook looks at the call. A box that asks nothing goes through untouched. For a box with a question:

- **`off` (the default).** The call is sent back once. Claude calls it again with the recap alone, then writes its full reply as its last message, ending with the question and the choices written out. The box shows only the recap.
- **`keep`.** The question is taken out of what the app receives, so the turn doesn't end at the box, and Claude writes its full reply and the question as its last message. The app draws the box from Claude's own call, which a hook can't change, so the question and buttons still show, and clicking one still works.

If Claude puts a question in the box again in the same turn anyway, the hook takes it out instead of sending it back a second time, so it never loops.

This is what Claude sees when a question is sent back:

```
[ask-in-chat] The question box is off in this session. A wrap_up that carries a question ends the turn at the box, and the reply around it can be lost (anthropics/claude-code#102132). Do this instead, in this order:
1. Call wrap_up again now with the same recap and no ask, actions or blocked. Write no text before that call.
2. After its result, write your full reply as your closing message: what you found or did, everything the question is about (the draft, the options, the findings) written out in full, and then the question itself, with the choices spelled out.
Nothing is wrong with your work; only where the question goes changes.
```

## Install

In a Claude Code session (2.1.275 or later):

```
/plugin install ask-in-chat --marketplace derekwden-droid/ask-in-chat
```

Or from a terminal:

```bash
claude plugin marketplace add derekwden-droid/ask-in-chat
```

```bash
claude plugin install ask-in-chat@ask-in-chat
```

The desktop app's Code tab loads the same plugins as the terminal, so new Code tab sessions pick it up.

## Try it

In the desktop app's Code tab:

1. "Draft a short reply to a customer who wants a refund, then ask me whether to send it."
2. "Suggest three names for this project and ask me which one to use."
3. "Run `git status` here and ask me whether to commit."

Each time, the draft, the names or the list of changes appears in the chat, followed by the question.

## Settings

There is one option, **Question buttons** (`buttons`):

- `off` (the default): Claude asks in the chat, and the box shows only its recap.
- `keep`: the box keeps Claude's question and buttons, and Claude also writes its full reply and the question in the chat.

Claude Code asks for it when you enable the plugin. It's saved under `pluginConfigs` in your user `settings.json`, and you can change it there or with `/config` in a terminal session.

## What's included

- **One hook.** PreToolUse on `mcp__ccd_turn__wrap_up`, the desktop app's next-step box tool. It runs `node scripts/ask-in-chat.mjs` from this plugin. Every other tool passes by without it.

## What it reads, runs and sends

- **Reads** the box call's input. When the call asks a question, it also reads the last 768 KB of the session's transcript, which Claude Code keeps on your computer, to see whether it already sent a question back during this prompt.
- **Writes** nothing, and keeps no logs or state.
- **Runs** `node scripts/ask-in-chat.mjs` before each next-step box, about once a turn.
- **Sends** nothing over the network. There is no telemetry and no account. See [PRIVACY.md](PRIVACY.md).

Its notes go into your conversation with Claude, like any other hook output.

## Limits

- Only the desktop app's Code tab has the next-step box. In the terminal, an IDE, or a session started from your phone, the hook never runs.
- Sending a question back costs Claude one extra short call.
- With `keep`, the box still shows the question and buttons, because the app draws them from Claude's own call.
- It relies on the box tool's current name and fields. If the app renames them, the hook stops matching and does nothing; it can't break the box.
- It doesn't cover AskUserQuestion, where text written before the question can go missing too ([#103084](https://github.com/anthropics/claude-code/issues/103084)). [unsaid](https://github.com/derekwden-droid/unsaid) catches the case where that text went into a hidden thinking block.
- Once the desktop app gets a setting for the box, or #102132 is fixed, you won't need this plugin.

## Requirements

- The Claude desktop app's Code tab with the next-step box. Verified with Claude Code 2.1.299 in the Windows desktop app.
- Node.js 20 or later on your `PATH`.

## Development

`node --test` runs the tests. They need nothing beyond Node.

## License

MIT. See [LICENSE](LICENSE).
