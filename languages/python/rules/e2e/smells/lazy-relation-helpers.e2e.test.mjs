import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const code = (...lines) => `${lines.join('\n')}\n`;
const run = (files) => findingsOf(files, { sourceRoots: ['src'] });

const LIBRARY = code(
  'from django.db import models',
  '',
  '',
  'class Author(models.Model):',
  '    name = models.TextField()',
  '',
  '',
  'class Genre(models.Model):',
  '    label = models.TextField()',
  '',
  '',
  'class Book(models.Model):',
  '    author = models.ForeignKey(Author, on_delete=models.PROTECT)',
  '    genres = models.ManyToManyField(Genre)',
);

const RENDER = code(
  'def to_row(book):',
  '    return {"author": book.author.name}',
  '',
  '',
  'def labels(book):',
  '    return [genre.label for genre in book.genres.all()]',
  '',
  '',
  'def ids(book):',
  '    return book.author_id',
  '',
  '',
  'def nested(prefix, *, book):',
  '    return prefix + str(to_row(book))',
);

const library = (body) => ({
  'src/library/models.py': LIBRARY,
  'src/library/render.py': RENDER,
  'src/library/views.py': code(
    'from library.models import Book',
    'from library.render import ids, labels, nested, to_row',
    '',
    '',
    body,
  ),
});

describe.skipIf(!enabled)('lazy-relation-in-loop through a helper with Django', () => {
  it('flags a helper, a comprehension, a map and a keyword helper that read the relation', () => {
    expect(
      run(
        library(
          code(
            'def rows():',
            '    out = []',
            '    for book in Book.objects.all():',
            '        out.append(to_row(book))',
            '    return out',
            '',
            '',
            'def shown():',
            '    return [labels(b) for b in Book.objects.filter(open=True)]',
            '',
            '',
            'def mapped():',
            '    return list(map(to_row, Book.objects.all()))',
            '',
            '',
            'def deeper():',
            '    return [nested("x", book=b) for b in Book.objects.all()]',
          ),
        ),
      ),
    ).toEqual([
      'lazy-relation-in-loop src/library/views.py:8 Book.author|django|Book.objects.all()|to_row()',
      'lazy-relation-in-loop src/library/views.py:13 Book.genres|django|Book.objects.filter()|labels()',
      'lazy-relation-in-loop src/library/views.py:17 Book.author|django|Book.objects.all()|to_row()',
      'lazy-relation-in-loop src/library/views.py:21 Book.author|django|Book.objects.all()|nested()',
    ]);
  });

  it('stays quiet for a fetched relation, a column read or a helper given something else', () => {
    expect(
      run(
        library(
          code(
            'def joined():',
            '    return [to_row(b) for b in Book.objects.select_related("author")]',
            '',
            '',
            'def prefetched():',
            '    return list(map(labels, Book.objects.prefetch_related("genres")))',
            '',
            '',
            'def column():',
            '    return [ids(b) for b in Book.objects.all()]',
            '',
            '',
            'def other(first):',
            '    return [to_row(first) for b in Book.objects.all()]',
          ),
        ),
      ),
    ).toEqual([]);
  });

  it('reports a relation read both inline and through a helper once, at the inline read', () => {
    expect(
      run(
        library(
          code(
            'def both():',
            '    for book in Book.objects.all():',
            '        print(book.author, to_row(book))',
          ),
        ),
      ),
    ).toEqual([
      'lazy-relation-in-loop src/library/views.py:7 Book.author|django|Book.objects.all()',
    ]);
  });
});

const SHELVES = code(
  'from sqlalchemy import ForeignKey',
  'from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
  'class Shelf(Base):',
  '    __tablename__ = "shelf"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '',
  '',
  'class Volume(Base):',
  '    __tablename__ = "volume"',
  '    id: Mapped[int] = mapped_column(primary_key=True)',
  '    shelf_id: Mapped[int] = mapped_column(ForeignKey("shelf.id"))',
  '    shelf: Mapped[Shelf] = relationship()',
);

const shelves = (body) => ({
  'src/stock/models.py': SHELVES,
  'src/stock/report.py': code(
    'from sqlalchemy import select',
    'from sqlalchemy.orm import selectinload',
    '',
    'from stock.models import Volume',
    '',
    '',
    'def place(volume):',
    '    return volume.shelf.id',
    '',
    '',
    body,
  ),
});

describe.skipIf(!enabled)(
  'lazy-relation-in-loop through a helper with SQLAlchemy and SQLModel',
  () => {
    it('flags a module helper, a method on self and a mapped helper', () => {
      expect(
        run(
          shelves(
            code(
              'class Report:',
              '    def line(self, volume):',
              '        return volume.shelf',
              '',
              '    def lines(self, session):',
              '        return [self.line(v) for v in session.scalars(select(Volume))]',
              '',
              '',
              'def places(session):',
              '    for volume in session.scalars(select(Volume)).all():',
              '        print(place(volume))',
              '',
              '',
              'def mapped(session):',
              '    return list(map(place, session.scalars(select(Volume))))',
            ),
          ),
        ),
      ).toEqual([
        'lazy-relation-in-loop src/stock/report.py:16 Volume.shelf|sqlalchemy|select(Volume)|self.line()',
        'lazy-relation-in-loop src/stock/report.py:21 Volume.shelf|sqlalchemy|select(Volume)|place()',
        'lazy-relation-in-loop src/stock/report.py:25 Volume.shelf|sqlalchemy|select(Volume)|place()',
      ]);
    });

    it('stays quiet when the select loads the relation or the helper reads a column', () => {
      expect(
        run(
          shelves(
            code(
              'def loaded(session):',
              '    stmt = select(Volume).options(selectinload(Volume.shelf))',
              '    return [place(v) for v in session.scalars(stmt)]',
              '',
              '',
              'def column(volume):',
              '    return volume.shelf_id',
              '',
              '',
              'def columns(session):',
              '    return list(map(column, session.scalars(select(Volume))))',
            ),
          ),
        ),
      ).toEqual([]);
    });

    it('flags a SQLModel helper over an exec of a select', () => {
      expect(
        run({
          'src/league/models.py': code(
            'from sqlmodel import Field, Relationship, SQLModel',
            '',
            '',
            'class Club(SQLModel, table=True):',
            '    id: int | None = Field(default=None, primary_key=True)',
            '',
            '',
            'class Player(SQLModel, table=True):',
            '    id: int | None = Field(default=None, primary_key=True)',
            '    club_id: int | None = Field(default=None, foreign_key="club.id")',
            '    club: Club | None = Relationship()',
          ),
          'src/league/views.py': code(
            'from sqlmodel import Session, select',
            '',
            'from league.models import Player',
            '',
            '',
            'def club_of(player):',
            '    return player.club',
            '',
            '',
            'def clubs(session: Session):',
            '    return [club_of(p) for p in session.exec(select(Player)).all()]',
          ),
        }),
      ).toEqual([
        'lazy-relation-in-loop src/league/views.py:11 Player.club|sqlalchemy|select(Player)|club_of()',
      ]);
    });
  },
);
