import { beforeAll, describe, expect, it } from 'vitest';
import { analyzeFiles, findingsIn } from '../test-support/project.mjs';

const WRAPPERS = {
  'src/wrappers/ui/button.tsx': `import type { ButtonHTMLAttributes } from 'react';
type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  tone?: string;
  dense?: boolean;
  onClose?: () => void;
};
export function Button({ label, tone, dense, onClose, ...rest }: ButtonProps) {
  return <button {...rest} onClick={() => onClose?.()}>{label}{tone}{dense}</button>;
}
`,
  'src/wrappers/ui/card.tsx': `import { memo, forwardRef } from 'react';
type BaseProps = { title: string; subtitle?: string };
type CardProps = BaseProps & { elevated?: boolean; footer?: string };
export const Card = memo(function Card({ title, elevated }: CardProps) {
  return <section>{title}{elevated}</section>;
});
export const Field = forwardRef<HTMLInputElement, { name: string; hint?: string; mask?: boolean }>(
  function Field({ name, hint }, ref) { return <input ref={ref} name={name} title={hint} />; },
);
`,
  'src/wrappers/ui/plain.tsx': `type PlainProps = { a?: number; b?: number };
function Plain(props: PlainProps) { return <i>{props.a}</i>; }
export default Plain;
`,
  'src/wrappers/ui/index.ts': `export * from './button';
export { Card as Panel, Field } from './card';
export { default as Plain } from './plain';
`,
  'src/wrappers/app.tsx': `import { Button, Field, Plain } from './ui';
import * as ui from './ui';
import { Button as Btn } from './ui/button';
export const App = () => (
  <div>
    <Button label="x" tone="a" />
    <Btn label="y" onClose={() => undefined} />
    <ui.Panel title="t" elevated>kids</ui.Panel>
    <Field name="n" hint="h" />
    <Plain a={1} />
  </div>
);
`,
};

const PASSING = {
  'src/passing/parts.tsx': `import type { ReactNode } from 'react';
export function Literal(props: { a?: number; b?: number; c?: number; children?: ReactNode }) {
  return <i>{props.a}</i>;
}
export function Opaque(props: { a?: number; b?: number }) { return <i>{props.a}</i>; }
export function Mixed(props: { a?: number; b?: number }) { return <i>{props.a}</i>; }
export function Kids(props: { a?: number; b?: number; children?: ReactNode }) {
  return <i>{props.a}</i>;
}
`,
  'src/passing/use.tsx': `import { Literal, Opaque, Mixed, Kids } from './parts';
export function Use(rest: { a?: number }) {
  return (
    <div>
      <Literal a={1} {...{ b: 2 }} />
      <Opaque {...rest} />
      <Mixed {...{ a: 1, ...rest }} />
      <Kids a={1}>
        text
      </Kids>
    </div>
  );
}
`,
};

const RENDERED = {
  'src/rendered/orphan.tsx': `export function Orphan(props: { value?: number }) { return <i>{props.value}</i>; }
`,
  'src/rendered/tree.tsx': `type TreeProps = { depth?: number; label?: string };
export function Tree({ depth = 0 }: TreeProps) {
  return depth > 2 ? <i /> : <Tree depth={depth + 1} />;
}
`,
  'src/rendered/root.tsx': `import { Tree } from './tree';
export const Root = () => <Tree />;
`,
};

const REEXPORTED = {
  'src/reexported/gauge.tsx': `export function Gauge(props: { value?: number; unit?: string }) {
  return <i>{props.value}</i>;
}
`,
  'src/reexported/dial.tsx': `export function Dial(props: { angle?: number; snap?: boolean }) {
  return <i>{props.angle}</i>;
}
`,
  'src/reexported/knob.tsx': `export function Knob(props: { grip?: number; tilt?: number }) {
  return <i>{props.grip}</i>;
}
`,
  'src/reexported/entry.ts': `import { Knob } from './knob';
export { Gauge } from './gauge';
export * from './dial';
export default Knob;
`,
  'src/reexported/use.tsx': `import Knob, { Dial, Gauge } from './entry';
export const Use = () => <><Gauge value={1} /><Dial angle={2} /><Knob grip={3} /></>;
`,
};

let findings;

beforeAll(() => {
  findings = analyzeFiles({ ...WRAPPERS, ...PASSING, ...RENDERED, ...REEXPORTED });
});

describe('unused component props', () => {
  it('reports props no caller passes, through aliases, barrels, namespaces and wrappers', () => {
    expect(findingsIn(findings, 'src/wrappers')).toEqual([
      'unused-prop src/wrappers/ui/button.tsx Button.dense',
      'unused-prop src/wrappers/ui/card.tsx Card.footer',
      'unused-prop src/wrappers/ui/card.tsx Card.subtitle',
      'unused-prop src/wrappers/ui/card.tsx Field.mask',
      'unused-prop src/wrappers/ui/plain.tsx Plain.b',
    ]);
  });

  it('counts attributes, object-literal spreads and children, and treats other spreads as passing all', () => {
    expect(findingsIn(findings, 'src/passing')).toEqual([
      'unused-prop src/passing/parts.tsx Kids.b',
      'unused-prop src/passing/parts.tsx Literal.c',
      'unused-prop src/passing/parts.tsx Literal.children',
    ]);
  });

  it('judges only components something renders and ignores a recursive render of an unpassed prop', () => {
    expect(findingsIn(findings, 'src/rendered')).toEqual([
      'unused-prop src/rendered/tree.tsx Tree.label',
    ]);
  });

  it('does not take a re-export for a caller or for a value use', () => {
    expect(findingsIn(findings, 'src/reexported')).toEqual([
      'unused-prop src/reexported/dial.tsx Dial.snap',
      'unused-prop src/reexported/gauge.tsx Gauge.unit',
      'unused-prop src/reexported/knob.tsx Knob.tilt',
    ]);
  });

  it('does nothing outside the React scope', () => {
    expect(
      analyzeFiles(PASSING, {
        manifest: { name: 'plain', private: true },
        policy: { react: { enabled: false } },
      }),
    ).toEqual([]);
  });
});
