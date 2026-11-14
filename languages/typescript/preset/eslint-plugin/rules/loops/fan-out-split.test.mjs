import { Linter } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';
import { rule as unboundedFanOut } from '../concurrency/unbounded-fan-out.mjs';
import { rule as ioInLoop } from './no-io-in-loop.mjs';

const linter = new Linter();
const config = [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tseslint.parser },
    plugins: { n: { rules: { 'fan-out': unboundedFanOut, 'io-in-loop': ioInLoop } } },
    rules: { 'n/fan-out': 'error', 'n/io-in-loop': 'error' },
  },
];

function reporters(code) {
  return linter
    .verify(code, config, { filename: 'src/job.ts' })
    .map((message) => message.ruleId)
    .toSorted((left, right) => String(left).localeCompare(String(right)));
}

describe('one rule reports each per-item call', () => {
  it.each([
    [
      'a query in Promise.all',
      'await Promise.all(ids.map((id) => repository.findById(id)));',
      ['n/io-in-loop'],
    ],
    ['a request in Promise.all', 'await Promise.all(ids.map((id) => fetch(id)));', ['n/fan-out']],
    [
      'a broker publish in Promise.all',
      "import { Kafka } from 'kafkajs';\nconst producer = new Kafka({}).producer();\nawait Promise.all(ids.map((id) => producer.send({ topic: 't', messages: [id] })));",
      ['n/fan-out'],
    ],
    [
      'a request in a sequential loop',
      'for (const id of ids) { await fetch(id); }',
      ['n/io-in-loop'],
    ],
    [
      'a broker publish in a sequential loop',
      "import { Kafka } from 'kafkajs';\nconst producer = new Kafka({}).producer();\nfor (const id of ids) { await producer.send({ topic: 't', messages: [id] }); }",
      [],
    ],
    [
      'a request in a limited loop of Promise.all',
      "import pLimit from 'p-limit';\nconst limit = pLimit(4);\nawait Promise.all(ids.map((id) => limit(() => fetch(id))));",
      [],
    ],
  ])('%s', (_name, code, expected) => {
    expect(reporters(code)).toEqual(expected);
  });
});
