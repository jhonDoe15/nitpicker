import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { JSON_NULL } from '../analysis/typed/json-null.mts';
import type {
  AliasEntry,
  ClassesReport,
  ImportsByFile,
} from '../analysis/typed/python-graph-types.mts';
import { pythonPersistence } from './python-persistence.mts';
import { useGitFixtures } from '../../../../core/diff/git/test-support/git-repository.mts';

const { temporaryRoot } = useGitFixtures();

function projectWith(files: Readonly<Record<string, string>>): string {
  const root = temporaryRoot('nitpicker-python-persistence-');
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function from(module: string, ...names: string[]): AliasEntry[] {
  return names.map((name) => ({ level: 0, module, name, asname: JSON_NULL }));
}

function moduleOf(file: string): string {
  return file.replace(/\.py$/u, '').replaceAll('/', '.');
}

function persistenceOf(
  files: ClassesReport,
  {
    statements = {},
    sources = {},
  }: { statements?: ImportsByFile; sources?: Readonly<Record<string, string>> } = {},
) {
  const modules = Object.keys(files).map((file) => ({
    module: moduleOf(file),
    file,
    isPackage: false,
  }));
  return Object.fromEntries(
    pythonPersistence(
      { modules, imports: statements },
      { classes: files, projectRoot: projectWith(sources) },
    ),
  );
}

describe('pythonPersistence', () => {
  it('finds entity classes through ORM bases, project base classes and declarative bases', () => {
    const files = {
      'app/orders/models.py': {
        classes: [{ name: 'Order', bases: ['models.Model'] }],
        imports: from('django.db', 'models'),
      },
      'app/db.py': {
        classes: [{ name: 'Base', bases: ['DeclarativeBase'] }],
        imports: from('sqlalchemy.orm', 'DeclarativeBase'),
      },
      'app/billing/invoice.py': {
        classes: [{ name: 'Invoice', bases: ['Base'] }],
        imports: from('app.db', 'Base'),
      },
      'app/legacy_db.py': { classes: [], imports: from('sqlalchemy.orm', 'declarative_base') },
      'app/legacy/payment.py': {
        classes: [{ name: 'Payment', bases: ['legacy_db.Base'] }],
        imports: [{ level: 2, module: null, name: 'legacy_db', asname: null }],
      },
      'app/billing/dto.py': {
        classes: [{ name: 'InvoiceDto', bases: ['BaseModel'] }],
        imports: from('pydantic', 'BaseModel'),
      },
      'app/billing/errors.py': {
        classes: [{ name: 'DuplicateInvoice', bases: ['Exception'] }],
        imports: from('sqlalchemy.exc', 'IntegrityError'),
      },
    };

    expect(persistenceOf(files)).toEqual({
      'app/orders/models.py': 'entity',
      'app/db.py': 'entity',
      'app/billing/invoice.py': 'entity',
      'app/legacy/payment.py': 'entity',
    });
  });

  it('counts a SQLModel class as an entity only with table=True', () => {
    const files = {
      'app/heroes.py': {
        classes: [
          { name: 'HeroBase', bases: ['SQLModel'] },
          { name: 'Hero', bases: ['HeroBase'] },
        ],
        imports: from('sqlmodel', 'SQLModel', 'Field'),
      },
      'app/tables.py': {
        classes: [{ name: 'Team', bases: ['SQLModel'] }],
        imports: from('sqlmodel', 'SQLModel'),
      },
      'app/players.py': {
        classes: [
          { name: 'PlayerBase', bases: ['SQLModel'] },
          { name: 'Player', bases: ['PlayerBase'] },
        ],
        imports: from('sqlmodel', 'SQLModel'),
      },
    };
    const sources = {
      'app/heroes.py': 'class HeroBase(SQLModel):\n    pass\n\nclass Hero(HeroBase):\n    pass\n',
      'app/tables.py': 'class Team(SQLModel, table=True):\n    id: int\n',
      'app/players.py':
        'class PlayerBase(SQLModel):\n    pass\n\nclass Player(PlayerBase, table=True):\n    id: int\n',
    };

    expect(persistenceOf(files, { sources })).toEqual({
      'app/tables.py': 'entity',
      'app/players.py': 'entity',
    });
  });

  it('marks runtime imports of drivers and ORM session APIs as data access', () => {
    const files = Object.fromEntries(
      ['repo', 'raw', 'queries', 'service', 'typed', 'views', 'settings', 'engine'].map((name) => [
        `app/${name}.py`,
        { classes: [], imports: [] },
      ]),
    );
    const statements = {
      'app/repo.py': [{ level: 0, module: 'sqlalchemy.orm', names: ['Session'], typeOnly: false }],
      'app/raw.py': [{ level: 0, module: null, names: ['psycopg'], typeOnly: false }],
      'app/queries.py': [{ level: 0, module: 'django.db', names: ['connection'], typeOnly: false }],
      'app/service.py': [
        { level: 0, module: 'django.db', names: ['transaction'], typeOnly: false },
      ],
      'app/typed.py': [{ level: 0, module: 'sqlalchemy.orm', names: ['Session'], typeOnly: true }],
      'app/views.py': [{ level: 1, module: 'repo', names: ['Session'], typeOnly: false }],
      'app/settings.py': [{ level: 0, module: null, names: ['django.conf'], typeOnly: false }],
      'app/engine.py': [{ level: 0, module: null, names: ['sqlalchemy'], typeOnly: false }],
    };

    expect(persistenceOf(files, { statements })).toEqual({
      'app/repo.py': 'data-access',
      'app/raw.py': 'data-access',
      'app/queries.py': 'data-access',
      'app/engine.py': 'data-access',
    });
  });
});
