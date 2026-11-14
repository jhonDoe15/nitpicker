import { describe, expect, it } from 'vitest';
import { JSON_NULL } from '../analysis/typed/json-null.mts';
import type { ImportsReport, PythonModule } from '../analysis/typed/python-graph-types.mts';
import { detectFrameworks as untypedDetect, withoutFrameworkForms } from './python-frameworks.mjs';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mjs';
import { writeFiles } from '../../../../core/diff/git/test-support/fixture-files.mjs';

const { temporaryRoot } = useGitFixtures();

const detectFrameworks: (projectRoot: string, imports: ImportsReport) => Set<string> =
  untypedDetect;

function project(files: Readonly<Record<string, string>> = {}) {
  const root = temporaryRoot('nitpicker-python-frameworks-');
  writeFiles(root, files);
  return root;
}

const module = (file: string, name: string): PythonModule => ({
  file,
  module: name,
  isPackage: false,
});
const finding = (rule: string, file: string) => ({ tool: 'x', rule, path: file });

describe('Python frameworks', () => {
  it('detects Django, FastAPI and Flask from the dependencies or the production imports', () => {
    const root = project({ 'requirements.txt': 'djangorestframework\n' });
    const imports = {
      modules: [module('src/app/a.py', 'app.a')],
      imports: { 'src/app/a.py': [{ level: 0, module: JSON_NULL, names: ['flask'] }] },
    };

    expect(
      [...detectFrameworks(root, imports)].sort((left, right) => left.localeCompare(right)),
    ).toEqual(['django', 'flask']);
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
