import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { pythonPersistence } from './python-persistence.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

function projectWith(files) {
  const root = mkdtempSync(path.join(tmpdir(), 'nitpicker-python-persistence-'));
  roots.push(root);
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(path.join(root, path.dirname(file)), { recursive: true });
    writeFileSync(path.join(root, file), text);
  }
  return root;
}

function from(module, ...names) {
  return names.map((name) => ({ level: 0, module, name, asname: null }));
}

function moduleOf(file) {
  return file.replace(/\.py$/u, '').replaceAll('/', '.');
}

function persistenceOf(files, { statements = {}, sources = {} } = {}) {
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
    };
    const sources = {
      'app/heroes.py': 'class HeroBase(SQLModel):\n    pass\n\nclass Hero(HeroBase):\n    pass\n',
      'app/tables.py': 'class Team(SQLModel, table=True):\n    id: int\n',
    };

    expect(persistenceOf(files, { sources })).toEqual({ 'app/tables.py': 'entity' });
  });

  it('marks runtime imports of drivers and ORM session APIs as data access', () => {
    const files = Object.fromEntries(
      ['repo', 'raw', 'queries', 'service', 'typed', 'views'].map((name) => [
        `app/${name}.py`,
        { classes: [], imports: [] },
      ]),
    );
    const statements = {
      'app/repo.py': [{ level: 0, module: 'sqlalchemy.orm', names: ['Session'], typeOnly: false }],
      'app/raw.py': [{ level: 0, module: null, names: ['psycopg'], typeOnly: false }],
      'app/queries.py': [{ level: 0, module: 'django.db', names: ['connection'], typeOnly: false }],
      'app/service.py': [{ level: 0, module: 'django.db', names: ['transaction'], typeOnly: false }],
      'app/typed.py': [{ level: 0, module: 'sqlalchemy.orm', names: ['Session'], typeOnly: true }],
      'app/views.py': [{ level: 1, module: 'repo', names: ['Session'], typeOnly: false }],
    };

    expect(persistenceOf(files, { statements })).toEqual({
      'app/repo.py': 'data-access',
      'app/raw.py': 'data-access',
      'app/queries.py': 'data-access',
    });
  });
});
