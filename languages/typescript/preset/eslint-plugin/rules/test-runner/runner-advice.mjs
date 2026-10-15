const ADVICE = new Map([
  [
    'vitest',
    {
      sleep: 'wait on a condition with vi.waitFor or expect.poll',
      poll: 'vi.waitFor / expect.poll',
    },
  ],
  [
    'jest',
    {
      sleep:
        "wait on the condition itself: await the event or promise, or use your testing library's waitFor",
      poll: "awaiting the event or promise itself, or your testing library's waitFor,",
    },
  ],
  [
    'node-test',
    {
      sleep:
        'wait on the condition itself: await the event or promise, or drive time with mock.timers',
      poll: 'awaiting the event or promise itself, or driving time with mock.timers,',
    },
  ],
]);

export function testRunnerOf(context) {
  return context.settings?.nitpicker?.testRunner ?? 'vitest';
}

export function sleepAdvice(context) {
  return ADVICE.get(testRunnerOf(context)).sleep;
}

export function pollAdvice(context) {
  return ADVICE.get(testRunnerOf(context)).poll;
}
