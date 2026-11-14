import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, outcomes } = createScripts();
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const DJANGO_MODELS = code(
  'from django.db import models',
  '',
  '',
  'class Team(models.Model):',
  '    name = models.CharField(max_length=20)',
  '',
  '',
  'class User(models.Model):',
  '    email = models.CharField(max_length=80)',
  '    age = models.IntegerField()',
  '    team = models.ForeignKey(Team, on_delete=models.CASCADE)',
  '',
  '    @property',
  '    def label(self):',
  '        return self.email.title()',
);
const ALCHEMY_MODELS = code(
  'from sqlalchemy import ForeignKey',
  'from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
  'class Team(Base):',
  '    __tablename__ = "team"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '',
  '',
  'class User(Base):',
  '    __tablename__ = "user"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    email: Mapped[str]',
  '    team_id: Mapped[int] = mapped_column(ForeignKey("team.id"))',
  '    team: Mapped[Team] = relationship()',
);
const DJANGO = 'from django.db.models import Count\n\nfrom .models import Team, User\n\n\n';
const ALCHEMY =
  'from sqlalchemy import exists, func, select\n\nfrom .models import Team, User\n\n\n';
const django = (body) => ({
  files: { 'shop/models.py': DJANGO_MODELS, 'shop/users.py': `${DJANGO}${body}` },
});
const alchemy = (body) => ({
  files: { 'shop/models.py': ALCHEMY_MODELS, 'shop/users.py': `${ALCHEMY}${body}` },
});

function ruleOutcomes(rows, rule) {
  const [actual, expected] = outcomes(rows);
  const own = Object.fromEntries(
    Object.entries(actual).map(([name, found]) => [
      name,
      found.filter((item) => item.startsWith(`${rule}:`)),
    ]),
  );
  return [own, expected];
}

const COLUMN = 'row-for-one-column';
const EXISTENCE = 'row-for-existence';

describe.skipIf(!enabled)('row-for-one-column', () => {
  it('reports rows loaded to read one known column', () => {
    const [actual, expected] = ruleOutcomes(
      [
        [
          'a Django comprehension',
          django(
            'def emails(team):\n    return [u.email for u in User.objects.filter(team=team)]\n',
          ),
          [`${COLUMN}:7 User|email|django`],
        ],
        [
          'a set over a list kept in a variable',
          django(
            code(
              'def ages():',
              '    users = list(User.objects.all())',
              '    return {u.age for u in users}',
            ),
          ),
          [`${COLUMN}:8 User|age|django`],
        ],
        [
          'a SQLAlchemy scalars result',
          alchemy(
            'def emails(session):\n    return [u.email for u in session.scalars(select(User).where(User.id > 1))]\n',
          ),
          [`${COLUMN}:7 User|email|sqlalchemy`],
        ],
        [
          'a SQLAlchemy list',
          alchemy(
            'def emails(session):\n    return [u.email for u in session.scalars(select(User)).all()]\n',
          ),
          [`${COLUMN}:7 User|email|sqlalchemy`],
        ],
      ],
      COLUMN,
    );

    expect(actual).toEqual(expected);
  });

  it('stays quiet for narrowed queries, relations, properties, conditions and other uses', () => {
    const [actual, expected] = ruleOutcomes(
      [
        [
          'values_list',
          django('def emails():\n    return list(User.objects.values_list("email", flat=True))\n'),
          [],
        ],
        [
          'only',
          django('def emails():\n    return [u.email for u in User.objects.only("email")]\n'),
          [],
        ],
        [
          'a relation',
          django('def teams():\n    return [u.team for u in User.objects.all()]\n'),
          [],
        ],
        [
          'a property',
          django('def labels():\n    return [u.label for u in User.objects.all()]\n'),
          [],
        ],
        [
          'a condition on the row',
          django('def emails():\n    return [u.email for u in User.objects.all() if u.age > 3]\n'),
          [],
        ],
        [
          'another column in the element',
          django('def pairs():\n    return [(u.email, u.age) for u in User.objects.all()]\n'),
          [],
        ],
        [
          'rows used again',
          django(
            code(
              'def run():',
              '    users = list(User.objects.all())',
              '    return [u.email for u in users], len(users)',
            ),
          ),
          [],
        ],
        [
          'rows of unknown origin',
          django('def emails(users):\n    return [u.email for u in users]\n'),
          [],
        ],
        [
          'a column select',
          alchemy(
            'def emails(session):\n    return [r.email for r in session.execute(select(User.email, User.id))]\n',
          ),
          [],
        ],
        [
          'load_only',
          alchemy(
            'def emails(session):\n    return [u.email for u in session.scalars(select(User).options(load_only(User.email)))]\n',
          ),
          [],
        ],
      ],
      COLUMN,
    );

    expect(actual).toEqual(expected);
  });
});

describe.skipIf(!enabled)('row-for-existence', () => {
  it('reports a count or a row loaded only to test for existence', () => {
    const [actual, expected] = ruleOutcomes(
      [
        [
          'count above zero',
          django('def any_user():\n    return User.objects.filter(age=3).count() > 0\n'),
          [`${EXISTENCE}:7 User|count|django`],
        ],
        [
          'count equal to zero and at least one',
          django(
            'def none():\n    return User.objects.count() == 0\n\n\ndef some():\n    return User.objects.count() >= 1\n',
          ),
          [`${EXISTENCE}:7 User|count|django`, `${EXISTENCE}:11 User|count|django`],
        ],
        [
          'a count as a truth test',
          django('def any_user():\n    if User.objects.count():\n        return 1\n    return 0\n'),
          [`${EXISTENCE}:7 User|count|django`],
        ],
        [
          'first compared with None',
          django('def any_user():\n    return User.objects.filter(age=3).first() is not None\n'),
          [`${EXISTENCE}:7 User|first|django`],
        ],
        [
          'first kept in a variable that is only tested',
          django(
            code(
              'def any_user():',
              '    found = User.objects.filter(age=3).first()',
              '    if found is None:',
              '        return 0',
              '    return 1',
            ),
          ),
          [`${EXISTENCE}:8 User|first|django`],
        ],
        [
          'a SQLAlchemy query count',
          alchemy(
            'def any_user(session):\n    return session.query(User).filter(User.id > 1).count() > 0\n',
          ),
          [`${EXISTENCE}:7 User|count|sqlalchemy`],
        ],
        [
          'a SQLAlchemy count select',
          alchemy(
            'def any_user(session):\n    return session.scalar(select(func.count()).select_from(User)) > 0\n',
          ),
          [`${EXISTENCE}:7 User|count|sqlalchemy`],
        ],
        [
          'a SQLAlchemy executed count select',
          alchemy(
            'def none(session):\n    return session.execute(select(func.count(User.id))).scalar() == 0\n',
          ),
          [`${EXISTENCE}:7 User|count|sqlalchemy`],
        ],
        [
          'a SQLAlchemy first compared with None',
          alchemy(
            'def any_user(session):\n    return session.scalars(select(User)).first() is not None\n',
          ),
          [`${EXISTENCE}:7 User|first|sqlalchemy`],
        ],
      ],
      EXISTENCE,
    );

    expect(actual).toEqual(expected);
  });

  it('stays quiet for exists, other thresholds, related managers and rows that are used', () => {
    const [actual, expected] = ruleOutcomes(
      [
        ['exists', django('def any_user():\n    return User.objects.filter(age=3).exists()\n'), []],
        ['another threshold', django('def many():\n    return User.objects.count() > 5\n'), []],
        ['a related manager', django('def has(team):\n    return team.user_set.count() > 0\n'), []],
        [
          'a first that is used',
          django(
            code(
              'def run():',
              '    found = User.objects.first()',
              '    if found is None:',
              '        return 0',
              '    return found.age',
            ),
          ),
          [],
        ],
        ['a count that is returned', django('def total():\n    return User.objects.count()\n'), []],
        [
          'a SQLAlchemy exists select',
          alchemy(
            'def any_user(session):\n    return session.scalar(select(exists().where(User.id > 1)))\n',
          ),
          [],
        ],
        [
          'a count of a column select',
          alchemy(
            'def any_user(session):\n    return session.execute(select(User.email)).first() is not None\n',
          ),
          [],
        ],
        [
          'a model the project does not declare',
          {
            files: {
              'shop/users.py':
                'from lib import Widget\n\n\ndef any_widget():\n    return Widget.objects.count() > 0\n',
            },
          },
          [],
        ],
      ],
      EXISTENCE,
    );

    expect(actual).toEqual(expected);
  });
});
