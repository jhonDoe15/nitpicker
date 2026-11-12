const TO_THREAD =
  'or move the blocking call to a worker thread with `await asyncio.to_thread(...)`';

export const ASYNC_HINTS = [
  {
    tool: 'ruff',
    rules: ['ASYNC100'],
    allowed:
      'Put an `await` inside the timeout scope (`async with asyncio.timeout(5): await client.get(url)`), or remove the scope: a timeout fires only at a checkpoint.',
  },
  {
    tool: 'ruff',
    rules: ['ASYNC105'],
    allowed: 'Await the trio call: `await trio.sleep(delay)`.',
  },
  {
    tool: 'ruff',
    rules: ['ASYNC109'],
    allowed:
      'Drop the `timeout` parameter; the caller bounds the call with `async with asyncio.timeout(...)` (`trio.fail_after` or `anyio.fail_after` on those backends). A method that overrides a base signature takes `@typing.override`, and a wrapper of `asyncio.timeout` names its parameter `delay`.',
  },
  {
    tool: 'ruff',
    rules: ['ASYNC110'],
    allowed:
      'Wait on an event instead of a sleep loop: `await ready.wait()` on an `asyncio.Event` that the producer sets.',
  },
  {
    tool: 'ruff',
    rules: ['ASYNC115'],
    allowed: 'Yield with `await trio.lowlevel.checkpoint()` (`anyio.lowlevel.checkpoint()`).',
  },
  {
    tool: 'ruff',
    rules: ['ASYNC116'],
    allowed: 'Wait indefinitely with `await trio.sleep_forever()` (`anyio.sleep_forever()`).',
  },
  {
    tool: 'ruff',
    rules: ['ASYNC210', 'ASYNC212'],
    allowed: `Use an async client (\`async with httpx.AsyncClient() as client: await client.get(url)\`), ${TO_THREAD}.`,
  },
  {
    tool: 'ruff',
    rules: ['ASYNC220', 'ASYNC221', 'ASYNC222'],
    allowed: `Run the process with \`await asyncio.create_subprocess_exec(...)\` (\`anyio.run_process\`), ${TO_THREAD}.`,
  },
  {
    tool: 'ruff',
    rules: ['ASYNC230'],
    allowed:
      'Read the file with `await anyio.Path(path).read_text()`, or in a worker thread with `await asyncio.to_thread(path.read_text)`.',
  },
  {
    tool: 'ruff',
    rules: ['ASYNC240'],
    allowed: `Check the path with \`await anyio.Path(path).exists()\`, ${TO_THREAD}.`,
  },
  {
    tool: 'ruff',
    rules: ['ASYNC250'],
    allowed: 'Read input in a worker thread: `await asyncio.to_thread(input, prompt)`.',
  },
  {
    tool: 'ruff',
    rules: ['ASYNC251'],
    allowed:
      "Sleep with `await asyncio.sleep(...)` (the backend's sleep, such as `await trio.sleep(...)`).",
  },
];
