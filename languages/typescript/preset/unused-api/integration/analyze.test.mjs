import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  analyzeFiles,
  analyzeProject,
  createProject,
  removeProject,
} from '../test-support/project.mjs';

const BUTTON = `type ButtonProps = {
  label: string;
  tone?: string;
};
export function Button({ label }: ButtonProps) { return <button>{label}</button>; }
`;
const PROP_MESSAGE =
  'Prop Button.tone is never passed. Remove it, or pass it from a real caller ' +
  '(tests and stories do not count). If this is intended, add ' +
  '{"rule":"unused-prop","paths":["src/button.tsx"],"reason":"..."} ' +
  'to "exceptions" in nitpicker.config.json.';
const FILES = {
  'src/button.tsx': BUTTON,
  'src/use.tsx':
    'import { Button } from \'./button\';\nexport const Use = () => <Button label="x" />;\n',
  'src/run.ts': 'export function run(options: { retries?: number }) { return options.retries; }\n',
  'src/call.ts': "import { run } from './run';\nrun({});\n",
  'tools/other.tsx': BUTTON.replace('Button', 'Other'),
};
const BROKEN_CONFIG = '{ "compilerOptions": { "target": 42 } }';

let root;
let findings;

beforeAll(() => {
  root = createProject(FILES);
  findings = analyzeProject(root);
});

afterAll(() => {
  removeProject(root);
});

describe('unused API findings', () => {
  it('names the symbol, the allowed forms and the exception that would lift the finding', () => {
    expect(findings[0]).toEqual({
      tool: 'structure',
      rule: 'unused-prop',
      path: 'src/button.tsx',
      identity: 'Button.tone',
      symbol: 'Button.tone',
      classification: 'enforceable',
      location: { line: 3 },
      message: PROP_MESSAGE,
      allowedForm: 'Remove it, or pass it from a real caller (tests and stories do not count).',
    });
    expect(findings.map(({ rule, identity }) => `${rule} ${identity}`)).toEqual([
      'unused-prop Button.tone',
      'unused-option run.retries',
    ]);
  });

  it('keeps its identity when the code around the prop moves', () => {
    const moved = analyzeFiles({ ...FILES, 'src/button.tsx': `\n\n\n${BUTTON}` });

    expect(moved.map(({ identity, location }) => [identity, location.line])).toEqual([
      ['Button.tone', 6],
      ['run.retries', 1],
    ]);
  });

  it('drops findings for paths an exception of the rule names, and only for that rule', () => {
    const exceptions = [{ rule: 'unused-prop', paths: ['src/button.tsx'], reason: 'public API' }];

    expect(analyzeProject(root, { exceptions }).map(({ rule }) => rule)).toEqual(['unused-option']);
  });

  it('does not read files outside the layout or under excluded paths', () => {
    expect(analyzeProject(root, { exclude: ['src/button.tsx'] }).map(({ rule }) => rule)).toEqual([
      'unused-option',
    ]);
  });
});

describe('the TypeScript program', () => {
  it('surfaces a config TypeScript cannot read as an error', () => {
    expect(() => analyzeProject(root, {}, { configSource: BROKEN_CONFIG })).toThrow(
      /^The TypeScript config could not be read: /u,
    );
  });

  it('is not built when no source file declares a component or an options parameter', () => {
    const plain = createProject({
      'src/sum.ts': 'export const sum = (a: number, b: number) => a + b;\n',
    });
    try {
      expect(analyzeProject(plain, {}, { configSource: BROKEN_CONFIG })).toEqual([]);
    } finally {
      removeProject(plain);
    }
  });
});
