import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { itOutcomes, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

describeRules('uninjectable-delay', () => {
  itOutcomes('flags a public function that sleeps a module constant it cannot override', [
    [
      'time.sleep on a constant',
      'import time\n\nRETRY_DELAY = 2\n\n\ndef poll():\n    time.sleep(RETRY_DELAY)\n',
      ['uninjectable-delay:7 time.sleep|RETRY_DELAY|2000|poll'],
    ],
    [
      'asyncio.sleep in a method',
      'import asyncio\n\nPAUSE = 5 * 60\n\n\nclass Client:\n    async def run(self):\n        await asyncio.sleep(PAUSE)\n',
      ['uninjectable-delay:8 asyncio.sleep|PAUSE|300000|Client.run'],
    ],
    [
      'an imported sleep and a keyword',
      'from time import sleep\n\nPAUSE: float = 1.5\n\n\ndef poll():\n    sleep(seconds=PAUSE)\n',
      ['uninjectable-delay:7 time.sleep|PAUSE|1500|poll'],
    ],
    [
      'a method that takes unrelated parameters',
      'import time\n\nPAUSE = 1\n\n\nclass Client:\n    def go(self, url):\n        time.sleep(PAUSE)\n',
      ['uninjectable-delay:8 time.sleep|PAUSE|1000|Client.go'],
    ],
  ]);

  itOutcomes('flags a function whose other parameters have defaults or look like context', [
    [
      'an unrelated default',
      'import time\n\nRETRY_DELAY = 2\n\n\ndef poll(retries=3):\n    time.sleep(RETRY_DELAY)\n',
      ['uninjectable-delay:7 time.sleep|RETRY_DELAY|2000|poll'],
    ],
    [
      'a context parameter',
      'import time\n\nRETRY_DELAY = 2\n\n\ndef poll(ctx):\n    time.sleep(RETRY_DELAY)\n',
      ['uninjectable-delay:7 time.sleep|RETRY_DELAY|2000|poll'],
    ],
  ]);

  itOutcomes('leaves a delay a caller can set, a short delay and non-public code alone', [
    [
      'a parameter defaulted to the constant',
      'import time\n\nRETRY_DELAY = 2\n\n\ndef poll(delay=RETRY_DELAY):\n    time.sleep(delay)\n',
      [],
    ],
    [
      'a parameter named for the delay',
      'import time\n\nRETRY_DELAY = 2\n\n\ndef poll(interval):\n    time.sleep(RETRY_DELAY)\n',
      [],
    ],
    [
      'a field set by the constructor',
      'import time\n\nRETRY_DELAY = 2\n\n\nclass Client:\n    def __init__(self, delay=RETRY_DELAY):\n        self.delay = delay\n\n    def run(self):\n        time.sleep(self.delay)\n',
      [],
    ],
    ['a short delay', 'import time\n\nTICK = 0.1\n\n\ndef poll():\n    time.sleep(TICK)\n', []],
    [
      'a private function',
      'import time\n\nRETRY_DELAY = 2\n\n\ndef _poll():\n    time.sleep(RETRY_DELAY)\n',
      [],
    ],
    [
      'a variable that is reassigned',
      'import time\n\nDELAY = 2\nDELAY = 0\n\n\ndef poll():\n    time.sleep(DELAY)\n',
      [],
    ],
    [
      'a literal delay',
      'import time\n\n\ndef poll():\n    time.sleep(2)\n',
      [],
    ],
    [
      'a test file',
      {
        file: 'tests/test_poll.py',
        code: 'import time\n\nRETRY_DELAY = 2\n\n\ndef test_poll():\n    time.sleep(RETRY_DELAY)\n',
      },
      ['test-without-assertion:6 test_poll', 'sleep-in-test:7 time.sleep'],
    ],
  ]);
});
