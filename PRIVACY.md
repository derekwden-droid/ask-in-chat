# ask-in-chat plugin privacy policy

Last updated: October 20, 2026

The ask-in-chat plugin for Claude Code collects no data. It has no servers, no accounts, no
analytics and no telemetry, and it never connects to the network.

## What the plugin accesses

Before the Claude desktop app fills its next-step box, Claude Code passes the plugin the box's
contents (the recap, and any question and answer buttons) and the location of the session's
transcript, which Claude Code keeps on your computer. When the box carries a question, the plugin
reads the end of that transcript to see whether it already sent a question back during the
current prompt. It reads no other files.

## What happens to that data

The plugin either says nothing, sends the question back to Claude with a note, or passes the box on
without its question and adds a note for Claude. A note can quote the question and the labels of
the answer buttons. The plugin writes nothing to disk and keeps no logs, caches or copies.

Its notes become part of your conversation with Claude, like any other hook output. How Anthropic
handles your conversations is covered by Anthropic's own privacy policy, not this one.

## Retention

None. Nothing outlives the hook call that read it.

## Changes and contact

Changes to this policy are made in this file and recorded in the repository's history. Questions
go to [github.com/derekwden-droid/ask-in-chat/issues](https://github.com/derekwden-droid/ask-in-chat/issues).
