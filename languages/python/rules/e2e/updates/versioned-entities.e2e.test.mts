import { expect, it } from 'vitest';
import { useScripts } from '../../test-support/python-rule-scripts.mts';

const { findingsOf, describeRules } = useScripts({
  enabled: process.env['NITPICKER_PYTHON_E2E'] === '1',
});

const RULE = 'unversioned-orm-entity';
const lines = (...rows: string[]) => `${rows.join('\n')}\n`;
const HEAD = [
  'from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
];
const PLAIN = lines(
  ...HEAD,
  'class Account(Base):',
  '    __tablename__ = "accounts"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    balance: Mapped[int]',
);
const VERSIONED = lines(
  ...HEAD,
  'class Account(Base):',
  '    __tablename__ = "accounts"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    version: Mapped[int] = mapped_column(default=1)',
  '    balance: Mapped[int]',
  '    __mapper_args__ = {"version_id_col": version}',
);
const INHERITED = lines(
  ...HEAD,
  'class Versioned(Base):',
  '    __abstract__ = True',
  '    version: Mapped[int] = mapped_column(default=1)',
  '    __mapper_args__ = {"version_id_col": version}',
  '',
  '',
  'class Account(Versioned):',
  '    __tablename__ = "accounts"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    balance: Mapped[int]',
);
const header = ['from sqlalchemy import select', '', 'from .models import Account', '', ''];

const findings = (models: string, service: string) =>
  findingsOf({
    'shop/__init__.py': '',
    'shop/models.py': models,
    'shop/accounts.py': service,
  }).filter((finding) => finding.startsWith(`${RULE} `));

const GET_AND_SAVE = lines(
  ...header,
  'def deposit(session, account_id, amount):',
  '    account = session.get(Account, account_id)',
  '    account.balance += amount',
  '    session.commit()',
);

describeRules(RULE, () => {
  it.each([
    ['a row loaded by key, changed and committed', PLAIN, GET_AND_SAVE, 6],
    [
      'rows of a select changed in a loop and flushed',
      PLAIN,
      lines(
        ...header,
        'def close(session):',
        '    for account in session.scalars(select(Account)):',
        '        account.balance = 0',
        '    session.flush()',
      ),
      6,
    ],
    [
      'a row of the legacy query API',
      PLAIN,
      lines(
        ...header,
        'def close(session, key):',
        '    account = session.query(Account).filter_by(id=key).first()',
        '    account.balance = 0',
        '    session.commit()',
      ),
      6,
    ],
  ])('reports %s', (_name, models, service, line) => {
    expect(findings(models, service)).toEqual([`${RULE} shop/accounts.py:${String(line)} Account`]);
  });

  it.each([
    ['an entity with version_id_col', VERSIONED, GET_AND_SAVE],
    ['an entity that inherits version_id_col', INHERITED, GET_AND_SAVE],
    [
      'an entity that is only read',
      PLAIN,
      lines(
        ...header,
        'def balance(session, account_id):',
        '    account = session.get(Account, account_id)',
        '    return account.balance',
      ),
    ],
    [
      'an entity that is only inserted',
      PLAIN,
      lines(
        ...header,
        'def open_account(session):',
        '    session.add(Account(balance=0))',
        '    session.commit()',
      ),
    ],
    [
      'a changed row that is never saved',
      PLAIN,
      lines(
        ...header,
        'def preview(session, account_id):',
        '    account = session.get(Account, account_id)',
        '    account.balance = 0',
        '    return account',
      ),
    ],
  ])('allows %s', (_name, models, service) => {
    expect(findings(models, service)).toEqual([]);
  });

  it('allows a row loaded under a lock', () => {
    const service = lines(
      ...header,
      'def deposit(session, account_id):',
      '    account = session.scalars(select(Account).where(Account.id == account_id).with_for_update()).one()',
      '    account.balance = 0',
      '    session.commit()',
    );

    expect(findings(PLAIN, service)).toEqual([]);
  });

  it('does not report a Django model', () => {
    const models = lines(
      'from django.db import models',
      '',
      '',
      'class Account(models.Model):',
      '    balance = models.IntegerField()',
    );
    const service = lines(
      'from .models import Account',
      '',
      '',
      'def deposit(account_id, amount):',
      '    account = Account.objects.get(pk=account_id)',
      '    account.balance += amount',
      '    account.save()',
    );

    expect(findings(models, service)).toEqual([]);
  });
});
