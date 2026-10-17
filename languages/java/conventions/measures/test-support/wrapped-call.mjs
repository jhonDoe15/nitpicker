export function wrappedCall({ step, last }) {
  const outer = ' '.repeat(step * 2);
  const inner = ' '.repeat(step * 4);
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
