import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { detectFrameworks, withoutFrameworkForms } from './python-frameworks.mjs';

const roots = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

function project(files = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-frameworks-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

const module = (file, name) => ({ file, module: name, isPackage: false });
const finding = (rule, file) => ({ tool: 'x', rule, path: file });

describe('Python frameworks', () => {
  it('detects Django, FastAPI and Flask from the dependencies or the production imports', () => {
    const root = project({ 'requirements.txt': 'djangorestframework\n' });
    const imports = {
      modules: [module('src/app/a.py', 'app.a')],
      imports: { 'src/app/a.py': [{ level: 0, module: null, names: ['flask'] }] },
    };

    expect([...detectFrameworks(root, imports)].sort()).toEqual(['django', 'flask']);
  });
  it('allows environment reads, import-time effects and star imports in Django settings, and the same plus missing tests in its entry points', () => {
    const root = project({
      'pyproject.toml': '[project]\ndependencies = ["Django"]\n',
      'manage.py': 'os.environ.setdefault("DJANGO_SETTINGS_MODULE", "site_conf.prod")\n',
    });
    const imports = {
      modules: [
        module('site_conf/prod.py', 'site_conf.prod'),
        module('mysite/settings/base.py', 'mysite.settings.base'),
        module('mysite/views.py', 'mysite.views'),
        module('mysite/wsgi.py', 'mysite.wsgi'),
      ],
      imports: {},
    };
    const findings = [
      finding('process-env-access', 'site_conf/prod.py'),
      finding('import-time-effect', 'site_conf/prod.py'),
      finding('F403', 'mysite/settings/base.py'),
      finding('process-env-access', 'mysite/views.py'),
      finding('import-time-effect', 'mysite/views.py'),
      finding('crap-coverage-unknown', 'mysite/wsgi.py'),
      finding('import-time-effect', 'mysite/wsgi.py'),
      finding('crap-coverage-unknown', 'mysite/views.py'),
    ];

    expect(withoutFrameworkForms(findings, root, imports)).toEqual([
      finding('process-env-access', 'mysite/views.py'),
      finding('import-time-effect', 'mysite/views.py'),
      finding('crap-coverage-unknown', 'mysite/views.py'),
    ]);
  });
  it('allows pydantic in FastAPI routers and the modules they import directly', () => {
    const root = project({ 'requirements.txt': 'fastapi\n' });
    const imports = {
      modules: [
        module('app/routes.py', 'app.routes'),
        module('app/schemas.py', 'app.schemas'),
        module('app/domain.py', 'app.domain'),
      ],
      imports: {
        'app/routes.py': [
          { level: 0, module: 'fastapi', names: ['APIRouter'] },
          { level: 0, module: 'app.schemas', names: ['Order'] },
        ],
      },
    };
    const findings = ['app/routes.py', 'app/schemas.py', 'app/domain.py'].map((file) =>
      finding('pydantic-boundary', file),
    );

    expect(withoutFrameworkForms(findings, root, imports)).toEqual([
      finding('pydantic-boundary', 'app/domain.py'),
    ]);
  });
  it('changes nothing without a framework', () => {
    const findings = [finding('process-env-access', 'settings.py')];

    expect(
      withoutFrameworkForms(findings, project(), {
        modules: [module('settings.py', 'settings')],
        imports: {},
      }),
    ).toEqual(findings);
  });
});
