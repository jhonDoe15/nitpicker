import { describe, expect, it } from 'vitest';
import { useScripts, pythonLines as code } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env['NITPICKER_PYTHON_E2E'] === '1';
const { findingsOf } = useScripts({ enabled, hidden: ['test-without-assertion'] });

const MODELS = code(
  'from django.db import models',
  '',
  '',
  'class Item(models.Model):',
  '    name = models.CharField(max_length=5)',
);
const OTHER = code(
  'from django.db import models',
  '',
  '',
  'class Part(models.Model):',
  '    name = models.CharField(max_length=5)',
);
const REPORT = 'django-types-missing app/models.py:4 django';

describe.skipIf(!enabled)('django-types-missing', () => {
  it('reports once on the first model when Django has no type plugin', () => {
    const files = {
      'requirements.txt': 'Django>=4.2\npytest\n',
      'app/models.py': MODELS,
      'app/parts.py': OTHER,
    };
    expect(findingsOf(files)).toEqual([REPORT]);
  });

  it('reads Django from pyproject.toml', () => {
    const files = {
      'pyproject.toml': '[project]\ndependencies = ["django>=4.2"]\n',
      'app/models.py': MODELS,
    };
    expect(findingsOf(files)).toEqual([REPORT]);
  });

  it('stays quiet when django-stubs is listed', () => {
    const files = {
      'requirements.txt': 'django\ndjango-stubs[compatible-mypy]\n',
      'app/models.py': MODELS,
    };
    expect(findingsOf(files)).toEqual([]);
  });

  it('stays quiet when the mypy plugin is configured', () => {
    const files = {
      'requirements.txt': 'django\n',
      'mypy.ini': '[mypy]\nplugins = mypy_django_plugin.main\n',
      'app/models.py': MODELS,
    };
    expect(findingsOf(files)).toEqual([]);
  });

  it('stays quiet when django-types is listed', () => {
    const files = { 'requirements.txt': 'django\ndjango-types\n', 'app/models.py': MODELS };
    expect(findingsOf(files)).toEqual([]);
  });

  it('stays quiet when Django is not a dependency', () => {
    const files = { 'requirements.txt': 'flask\n', 'app/models.py': MODELS };
    expect(findingsOf(files)).toEqual([]);
  });

  it('stays quiet when the project has no models', () => {
    const files = { 'requirements.txt': 'django\n', 'app/views.py': 'def view():\n    return 1\n' };
    expect(findingsOf(files)).toEqual([]);
  });
});
