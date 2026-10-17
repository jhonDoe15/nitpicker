const CONTINUATION_STEPS = 4;

export function wrappedCall({ step, last }) {
  const outer = ' '.repeat(step * 2);
  const inner = ' '.repeat(step * CONTINUATION_STEPS);
  return [
    'class A {',
    `${' '.repeat(step)}void run() {`,
    `${outer}service.process(`,
    `${inner}${'x'.repeat(last - 2)});`,
    `${' '.repeat(step)}}`,
    '}',
    '',
  ].join('\n');
}
