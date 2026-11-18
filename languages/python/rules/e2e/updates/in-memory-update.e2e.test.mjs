import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const RULE = 'in-memory-update';
const code = (...lines) => `${lines.join('\n')}\n`;
const DJANGO_MODELS = code(
  'from django.db import models',
  'from django.db.models.signals import post_save',
  'from django.dispatch import receiver',
  'from simple_history.models import HistoricalRecords',
  '',
  '',
  'class Order(models.Model):',
  '    status = models.CharField(max_length=20)',
  '    total = models.IntegerField()',
  '',
  '    @property',
  '    def label(self):',
  '        return self.status.title()',
  '',
  '',
  'class Saved(models.Model):',
  '    status = models.CharField(max_length=20)',
  '',
  '    def save(self, *args, **kwargs):',
  '        super().save(*args, **kwargs)',
  '',
  '',
  'class Signaled(models.Model):',
  '    status = models.CharField(max_length=20)',
  '',
  '',
  '@receiver(post_save, sender=Signaled)',
  'def audit(sender, instance, **kwargs):',
  '    pass',
  '',
  '',
  'class Stamped(models.Model):',
  '    status = models.CharField(max_length=20)',
  '    updated = models.DateTimeField(auto_now=True)',
  '',
  '',
  'class Versioned(models.Model):',
  '    status = models.CharField(max_length=20)',
  '    version = models.IntegerField()',
  '',
  '',
  'class Recorded(models.Model):',
  '    status = models.CharField(max_length=20)',
  '    history = HistoricalRecords()',
);
const ALCHEMY_MODELS = code(
  'from sqlalchemy import event',
  'from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
  'class Order(Base):',
  '    __tablename__ = "orders"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    status: Mapped[str]',
  '    total: Mapped[int]',
  '',
  '',
  'class Listened(Base):',
  '    __tablename__ = "listened"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    status: Mapped[str]',
  '',
  '',
  '@event.listens_for(Listened, "before_update")',
  'def audit(mapper, connection, target):',
  '    pass',
  '',
  '',
  'class Locked(Base):',
  '    __tablename__ = "locked"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    status: Mapped[str]',
  '    rev: Mapped[int]',
  '    __mapper_args__ = {"version_id_col": rev}',
  '',
  '',
  'class Counted(Base):',
  '    __tablename__ = "counted"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    status: Mapped[str]',
  '    version: Mapped[int]',
);
const DJANGO_HEAD =
  'from .models import Order, Saved, Signaled, Stamped, Versioned, Recorded\n\n\n';
const ALCHEMY_HEAD =
  'from sqlalchemy import select\n\nfrom .models import Order, Listened, Locked, Counted\n\n\n';
const django = (body) => ({
  files: { 'shop/models.py': DJANGO_MODELS, 'shop/orders.py': `${DJANGO_HEAD}${body}` },
});
const alchemy = (body) => ({
  files: { 'shop/models.py': ALCHEMY_MODELS, 'shop/orders.py': `${ALCHEMY_HEAD}${body}` },
});
const djangoJob = (model, loop = ['        order.status = "done"']) =>
  django(
    code(
      'def run():',
      `    rows = list(${model}.objects.filter(status="open"))`,
      '    for order in rows:',
      ...loop,
      `    ${model}.objects.bulk_update(rows, ["status"])`,
    ),
  );

function ruleOutcomes(rows) {
  const [actual, expected] = outcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [
      name,
      found.filter((item) => item.startsWith(`${RULE}:`)),
    ]),
  );
  return [own, expected];
}

describe.skipIf(!enabled)('in-memory-update on Django', () => {
  it('reports rows set to a fixed value and written back with bulk_update', () => {
    const [actual, expected] = ruleOutcomes([
      ['a fixed value', djangoJob('Order'), ['in-memory-update:6 Order|status|django']],
      [
        'values from parameters and attributes',
        django(
          code(
            'def run(settings, label):',
            '    rows = Order.objects.filter(status="open")',
            '    for order in rows:',
            '        order.status = label',
            '        order.total = settings.LIMIT',
            '    Order.objects.bulk_update(rows, ["status", "total"])',
          ),
        ),
        ['in-memory-update:6 Order|status,total|django'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet when the loop reads the row, the rows are used again or no bulk write follows', () => {
    const [actual, expected] = ruleOutcomes([
      [
        'a value read from the row',
        djangoJob('Order', ['        order.total = order.total + 1']),
        [],
      ],
      [
        'a value generated per row',
        djangoJob('Order', ['        order.status = secrets.token_hex(8)']),
        [],
      ],
      ['a timestamp read per row', djangoJob('Order', ['        order.status = now()']), []],
      [
        'a method called on the row',
        djangoJob('Order', ['        order.status = order.label']),
        [],
      ],
      ['a property assigned', djangoJob('Order', ['        order.label = "x"']), []],
      [
        'a call in the loop body',
        djangoJob('Order', ['        order.status = "done"', '        notify(order)']),
        [],
      ],
      [
        'rows used again',
        django(
          code(
            'def run():',
            '    rows = list(Order.objects.filter(status="open"))',
            '    for order in rows:',
            '        order.status = "done"',
            '    Order.objects.bulk_update(rows, ["status"])',
            '    return len(rows)',
          ),
        ),
        [],
      ],
      [
        'no bulk write after the loop',
        django(
          code(
            'def run():',
            '    rows = list(Order.objects.filter(status="open"))',
            '    for order in rows:',
            '        order.status = "done"',
          ),
        ),
        [],
      ],
      [
        'rows of unknown origin',
        django(
          code(
            'def run(rows):',
            '    for order in rows:',
            '        order.status = "done"',
            '    Order.objects.bulk_update(rows, ["status"])',
          ),
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet for models with hooks that a bulk statement skips', () => {
    const [actual, expected] = ruleOutcomes([
      ['a save override', djangoJob('Saved'), []],
      ['a post_save receiver', djangoJob('Signaled'), []],
      ['an auto_now field', djangoJob('Stamped'), []],
      ['a version column', djangoJob('Versioned'), []],
      ['a history table', djangoJob('Recorded'), []],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet when a receiver listens to every sender, and in tests', () => {
    const everyone = code(
      'from django.db.models.signals import pre_save',
      '',
      '',
      'def audit(sender, **kwargs):',
      '    pass',
      '',
      '',
      'pre_save.connect(audit)',
    );
    const job = djangoJob('Order').files['shop/orders.py'];
    const [actual, expected] = ruleOutcomes([
      [
        'a receiver without a sender',
        { files: { ...djangoJob('Order').files, 'shop/signals.py': everyone } },
        [],
      ],
      ['a test file', { files: { 'shop/models.py': DJANGO_MODELS, 'shop/tests.py': job } }, []],
    ]);

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('in-memory-update on SQLAlchemy', () => {
  const job = (model, loop = ['        row.status = "done"'], tail = '    session.commit()') =>
    alchemy(
      code(
        'def run(session):',
        `    for row in session.scalars(select(${model}).where(${model}.status == "open")):`,
        ...loop,
        tail,
      ),
    );

  it('reports rows set to a fixed value and committed', () => {
    const [actual, expected] = ruleOutcomes([
      ['a direct loop and a commit', job('Order'), ['in-memory-update:7 Order|status|sqlalchemy']],
      [
        'a list kept in a variable and a flush',
        alchemy(
          code(
            'def run(session):',
            '    rows = session.scalars(select(Order)).all()',
            '    for row in rows:',
            '        row.status = "done"',
            '    session.flush()',
          ),
        ),
        ['in-memory-update:8 Order|status|sqlalchemy'],
      ],
      [
        'a query object and an awaited commit',
        alchemy(
          code(
            'async def run(session):',
            '    for row in session.query(Order).filter(Order.total > 1):',
            '        row.status = "done"',
            '    await session.commit()',
          ),
        ),
        ['in-memory-update:7 Order|status|sqlalchemy'],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet when the loop reads the row, no commit follows or the rows are used again', () => {
    const [actual, expected] = ruleOutcomes([
      ['a value read from the row', job('Order', ['        row.status = row.status.upper()']), []],
      ['a value from another column', job('Order', ['        row.status = str(row.total)']), []],
      ['no commit', job('Order', undefined, '    log("done")'), []],
      [
        'rows used again',
        alchemy(
          code(
            'def run(session):',
            '    rows = session.scalars(select(Order)).all()',
            '    for row in rows:',
            '        row.status = "done"',
            '    session.commit()',
            '    return rows',
          ),
        ),
        [],
      ],
    ]);

    expect(actual).toEqual(expected);
  });

  it('stays quiet for models with listeners or version columns', () => {
    const [actual, expected] = ruleOutcomes([
      ['a before_update listener', job('Listened'), []],
      ['version_id_col', job('Locked'), []],
      ['a column named version', job('Counted'), []],
    ]);

    expect(actual).toEqual(expected);
  });
});
