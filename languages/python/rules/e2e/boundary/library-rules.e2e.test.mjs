import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const imports = (...modules) => modules.map((module) => `import ${module}\n`).join('');
const boundary = (requirements, code, file = 'src/domain/order.py') =>
  findingsOf({ 'requirements.txt': requirements, [file]: code });

describe.skipIf(!enabled)('pydantic-boundary follows the validation library of the project', () => {
  it('guards pydantic when the project declares nothing', () => {
    expect(boundary('requests\n', imports('pydantic', 'marshmallow'))).toEqual([
      'pydantic-boundary src/domain/order.py:1 pydantic',
    ]);
  });

  it.each([
    ['marshmallow', 'marshmallow>=3', 'marshmallow', 'pydantic'],
    ['marshmallow_dataclass', 'marshmallow-dataclass', 'marshmallow_dataclass', 'pydantic'],
    ['msgspec', 'msgspec', 'msgspec', 'pydantic'],
    ['dataclasses_json', 'dataclasses-json', 'dataclasses_json', 'pydantic'],
    ['voluptuous', 'voluptuous', 'voluptuous', 'pydantic'],
    ['cerberus', 'Cerberus', 'cerberus', 'pydantic'],
    ['cattrs', 'attrs\ncattrs', 'cattrs', 'attrs'],
  ])('guards %s once the project declares it', (_name, requirements, flagged, notDeclared) => {
    expect(boundary(requirements, imports(flagged, notDeclared))).toEqual([
      `pydantic-boundary src/domain/order.py:1 ${flagged}`,
    ]);
  });

  it('guards every declared library, from a pyproject dependency list', () => {
    const files = {
      'pyproject.toml': '[project]\ndependencies = ["pydantic", "msgspec"]\n',
      'src/domain/order.py': imports('pydantic.v1', 'msgspec.json', 'marshmallow'),
    };

    expect(findingsOf(files)).toEqual([
      'pydantic-boundary src/domain/order.py:1 pydantic.v1',
      'pydantic-boundary src/domain/order.py:2 msgspec.json',
    ]);
  });

  it('keeps allowing the library in adapters and in tests', () => {
    expect(boundary('marshmallow\n', imports('marshmallow'), 'src/shop/adapters/api.py')).toEqual(
      [],
    );
    expect(boundary('marshmallow\n', imports('marshmallow'), 'tests/test_api.py')).toEqual([]);
  });
});
