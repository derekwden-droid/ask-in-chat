// ask-in-chat's hook entry point. The plugin's hooks.json runs it before the Claude desktop
// app's wrap_up tool fills the next-step box (PreToolUse). It reads the hook input as JSON on
// standard input and prints a JSON reply only when the call puts a question in the box. Any
// error exits with status 1, which Claude Code reports without stopping anything.

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  const raw = await readStdin();
  const { handle, settings } = await import('./lib/hook.mjs');
  const reply = handle(JSON.parse(raw), settings(process.argv.slice(2)));
  if (reply) process.stdout.write(JSON.stringify(reply));
}

main().catch((err) => {
  process.stderr.write('ask-in-chat: ' + (err && err.message ? err.message : String(err)) + '\n');
  process.exitCode = 1;
});
