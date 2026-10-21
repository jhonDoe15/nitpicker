import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';
import { ingestRulesReport } from '../../../ingest/rules-report.mjs';
import { compareFindings } from '../../../../../core/diff/comparison/compare.mjs';
import { applyFindingPolicy } from '../../../../../shared/findings/finding-policy.mjs';
import { applyRuleHints } from '../../rule-hints.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const target = 'def normalize(value):\n    return value.strip()\n';
const wrapper = '\n\ndef _normalize(value):\n    return normalize(value)\n';
const diagnostic = 'no-forwarding-wrapper formatting.py:5 _normalize -> formatting.normalize';

function forwarding(files, settings) {
  return findingsOf(files, settings).filter((finding) =>
    finding.startsWith('no-forwarding-wrapper '),
  );
}

describe.skipIf(!enabled)('precise Python forwarding wrappers', () => {
  it('reports a private wrapper of a directly accessible function', () => {
    expect(forwarding({ 'formatting.py': target + wrapper })).toEqual([diagnostic]);
  });

  it.each([
    ['public facade', target + wrapper.replaceAll('_normalize', 'display_name')],
    [
      'private target',
      target.replace('normalize', '_target') +
        wrapper.replace('return normalize', 'return _target'),
    ],
    ['callback parameter', 'def _normalize(normalize):\n    return normalize(normalize)\n'],
    ['unknown callable', wrapper],
    [
      'wrapper type comment',
      target + wrapper.replace('_normalize(value):', '_normalize(value):  # type: (str) -> str'),
    ],
    [
      'target type comment',
      target.replace('normalize(value):', 'normalize(value):  # type: (str) -> str') + wrapper,
    ],
    [
      'assigned alias',
      target + '\nclean = normalize\n' + wrapper.replace('return normalize', 'return clean'),
    ],
    [
      'conditional target',
      'if enabled:\n    def normalize(value):\n        return value.strip()\n' + wrapper,
    ],
    [
      'exception binding',
      target + wrapper + '\ntry:\n    operation()\nexcept ValueError as normalize:\n    raise\n',
    ],

    ['decorated wrapper', target + wrapper.replace('def _normalize', '@decorate\ndef _normalize')],
    ['decorated target', '@decorate\n' + target + wrapper],
    ['annotated wrapper', target + wrapper.replace('_normalize(value)', '_normalize(value: str)')],
    ['annotated target', target.replace('normalize(value)', 'normalize(value: str)') + wrapper],
    [
      'return annotation',
      target + wrapper.replace('_normalize(value):', '_normalize(value) -> str:'),
    ],
    ['default value', target + wrapper.replace('_normalize(value)', '_normalize(value="")')],
    ['target default', target.replace('normalize(value)', 'normalize(value="")') + wrapper],
    [
      'different keyword contract',
      target
        .replace('normalize(value)', 'normalize(text)')
        .replace('value.strip()', 'text.strip()') + wrapper,
    ],
    ['type adaptation', target + wrapper.replace('normalize(value)', 'normalize(str(value))')],
    ['discarded result', target + wrapper.replace('return normalize', 'normalize')],
    [
      'extra policy',
      target + wrapper.replace('    return normalize', '    validate(value)\n    return normalize'),
    ],
    [
      'docstring contract',
      target +
        wrapper.replace(
          '    return normalize',
          '    """Compatibility hook."""\n    return normalize',
        ),
    ],
    ['async wrapper', target + wrapper.replace('def _normalize', 'async def _normalize')],
    ['async target', 'async ' + target + wrapper],
    ['generator target', target.replace('return value.strip()', 'yield value.strip()') + wrapper],
    ['rebinding', target + wrapper + '\nnormalize = decorated\n'],
    [
      'global mutation',
      target + wrapper + '\ndef install():\n    global normalize\n    normalize = decorated\n',
    ],
    ['star import', 'from extension import *\n' + target + wrapper],
    ['explicit exports', '__all__ = ["_normalize"]\n' + target + wrapper],
    [
      'method',
      target +
        '\nclass Formatter:\n    def _normalize(self, value):\n        return normalize(value)\n',
    ],
    [
      'varargs',
      'def normalize(*values):\n    return values\n\ndef _normalize(*values):\n    return normalize(*values)\n',
    ],
  ])('preserves %s', (_name, code) => {
    expect(forwarding({ 'formatting.py': code })).toEqual([]);
  });

  it('resolves imported aliases and module aliases to public project functions', () => {
    expect(
      forwarding({
        'formatting.py': target,
        'consumer.py':
          'from formatting import normalize as clean\n\ndef _clean(value):\n    return clean(value)\n',
        'other.py':
          'import formatting as fmt\n\ndef _clean(value):\n    return fmt.normalize(value)\n',
      }),
    ).toEqual([
      'no-forwarding-wrapper consumer.py:3 _clean -> formatting.normalize',
      'no-forwarding-wrapper other.py:3 _clean -> formatting.normalize',
    ]);
  });

  it('leaves duplicate module ownership across source roots unresolved', () => {
    expect(
      forwarding(
        {
          'first/formatting.py': target,
          'second/formatting.py': target,
          'consumer.py': 'from formatting import normalize\n' + wrapper,
        },
        { sourceRoots: ['first', 'second', '.'] },
      ),
    ).toEqual([]);
  });

  it('resolves relative imports and respects configured source roots', () => {
    expect(
      forwarding(
        {
          'src/catalog/formatting.py': target,
          'src/catalog/consumer.py':
            'from .formatting import normalize as clean\n\ndef _clean(value):\n    return clean(value)\n',
        },
        { sourceRoots: ['src'] },
      ),
    ).toEqual([
      'no-forwarding-wrapper src/catalog/consumer.py:3 _clean -> catalog.formatting.normalize',
    ]);
  });

  it.each([
    ['private module', '_formatting.py', 'from _formatting import normalize'],
    ['unresolved module', 'different.py', 'from missing import normalize'],
    ['rebound import', 'formatting.py', 'from formatting import normalize\nnormalize = other'],
  ])('preserves %s boundaries', (_name, file, imports) => {
    expect(forwarding({ [file]: target, 'consumer.py': imports + wrapper })).toEqual([]);
  });

  it('keeps module mutation and parameter shadowing unresolved', () => {
    const imports =
      'import formatting as fmt\n\ndef _clean(value):\n    return fmt.normalize(value)\n';
    expect(
      forwarding({
        'formatting.py': target,
        'consumer.py': imports + '\nfmt.normalize = replacement\n',
      }),
    ).toEqual([]);
    expect(
      forwarding({ 'formatting.py': target, 'consumer.py': imports.replaceAll('value', 'fmt') }),
    ).toEqual([]);
  });

  it('checks positional-only and required keyword-only parameter kinds and forwarding order', () => {
    const code =
      'def normalize(value, /, *, mode):\n    return value.strip()\n\ndef _normalize(value, /, *, mode):\n    return normalize(value, mode=mode)\n';
    expect(forwarding({ 'formatting.py': code })).toEqual([
      'no-forwarding-wrapper formatting.py:4 _normalize -> formatting.normalize',
    ]);
    expect(
      forwarding({
        'formatting.py': code.replace('_normalize(value, /, *, mode)', '_normalize(value, mode)'),
      }),
    ).toEqual([]);
    expect(forwarding({ 'formatting.py': code.replace('mode=mode', 'mode=value') })).toEqual([]);
  });

  it('preserves test and configured entry roles', () => {
    expect(forwarding({ 'tests/test_formatting.py': target + wrapper })).toEqual([]);
    expect(
      forwarding({ 'formatting.py': target + wrapper }, { entryPoints: ['formatting.py'] }),
    ).toEqual([]);
  });

  it('keeps finding identity stable when lines move and supplies reviewed-exception guidance', () => {
    const read = (code) => forwarding({ 'formatting.py': code });
    expect(read('\n' + target + wrapper)).toEqual([diagnostic.replace(':5 ', ':6 ')]);
    const raw = (line) =>
      JSON.stringify([
        {
          rule: 'no-forwarding-wrapper',
          path: 'formatting.py',
          subject: '_normalize -> formatting.normalize',
          line,
        },
      ]);
    const [finding] = applyRuleHints(ingestRulesReport(raw(5)));
    const [moved] = applyRuleHints(ingestRulesReport(raw(6)));
    expect(finding.identity).toBe(moved.identity);
    expect(finding.classification).toBe('enforceable');
    expect(compareFindings({ baseFindings: [finding], headFindings: [moved] }).newFindings).toEqual(
      [],
    );
    expect(compareFindings({ baseFindings: [], headFindings: [finding] }).newFindings).toEqual([
      finding,
    ]);
    expect(
      applyFindingPolicy([finding], {
        exceptions: [{ rule: 'no-forwarding-wrapper', glob: 'formatting.py' }],
      }),
    ).toEqual([]);
    expect(applyFindingPolicy([finding], { exclude: ['formatting.py'] })).toEqual([]);
    expect(finding.message).toBe(
      'Private wrapper `_normalize -> formatting.normalize` forwards the same callable contract without adding behavior. Call the public target directly and remove the private wrapper; keep a wrapper when it adapts the contract or owns policy. To allow it for some paths, add a "python.exceptions" entry for no-forwarding-wrapper in nitpicker.config.json.',
    );
  });
});
