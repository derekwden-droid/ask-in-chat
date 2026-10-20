# Changelog

## 1.0.0 - 2026-10-20

- PreToolUse hook on the Claude desktop app's next-step box (`mcp__ccd_turn__wrap_up`). A box that
  carries a question is sent back once, and Claude calls it again with the recap alone, then asks
  in the chat after its full reply (anthropics/claude-code#102132, #102273).
- `buttons` option: `off` (the default) or `keep`, which keeps the box's question and buttons and
  takes the question out of what the app receives, so the turn doesn't end at the box.
- Never sends a question back twice in one prompt, and never sends one back when the transcript
  can't be read.
