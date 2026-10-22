import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const CONTRACT = 'contract-infrastructure-type';
const HANDLER = 'handler-entity-type';
const ORDERS = 'app/features/orders';
const SESSION = 'from sqlalchemy.orm import Session\n';

function only(rule, files) {
  return findingsOf(files).filter((line) => line.startsWith(`${rule} `));
}

describe.skipIf(!enabled)('persistence and web types in a feature contract', () => {
  it('flags the public functions and methods of a feature face and resolves the import', () => {
    const found = only(CONTRACT, {
      [`${ORDERS}/__init__.py`]: 'from ._service import place_order as place\n',
      [`${ORDERS}/_service.py`]: `${SESSION}\n\ndef place_order(session: Session) -> None:\n    pass\n`,
      [`${ORDERS}/queries.py`]: [
        'import sqlite3',
        'from typing import TypeAlias',
        'from django.db import models',
        'from starlette.requests import Request',
        '',
        'Rows: TypeAlias = list[sqlite3.Connection]',
        '',
        '',
        'def active() -> "models.QuerySet[int]":',
        '    return None',
        '',
        '',
        'class Orders:',
        '    def __init__(self, rows: Rows) -> None:',
        '        self._rows = rows',
        '',
        '    def rows(self) -> Rows:',
        '        return self._rows',
        '',
        '    def total(self, sku: str, request: Request) -> int:',
        '        return 0',
        '',
        '    def _cursor(self) -> sqlite3.Cursor:',
        '        return None',
        '',
      ].join('\n'),
    });

    expect(found).toEqual([
      `${CONTRACT} ${ORDERS}/__init__.py:1 place|persistence|sqlalchemy.orm.Session|orders`,
      `${CONTRACT} ${ORDERS}/queries.py:9 active|persistence|django.db.models.QuerySet|orders`,
      `${CONTRACT} ${ORDERS}/queries.py:17 Orders.rows|persistence|sqlite3.Connection|orders`,
      `${CONTRACT} ${ORDERS}/queries.py:20 Orders.total|transport|starlette.requests.Request|orders`,
    ]);
  });

  it('leaves internal modules, adapters, repositories, handlers and framework classes alone', () => {
    const leak = `${SESSION}\n\ndef rows(session: Session) -> None:\n    pass\n`;
    const found = only(CONTRACT, {
      [`${ORDERS}/__init__.py`]: '',
      [`${ORDERS}/_store.py`]: leak,
      [`${ORDERS}/persistence.py`]: leak,
      [`${ORDERS}/web/handlers.py`]: leak,
      'app/shared/db.py': leak,
      'app/billing.py': leak,
      'tests/features/orders/test_a.py': leak,
      [`${ORDERS}/service.py`]: [
        'from fastapi import APIRouter, Depends',
        'from django.http import HttpRequest, HttpResponse',
        'from django.views import View',
        SESSION,
        'router = APIRouter()',
        '',
        '',
        '@router.get("/orders")',
        'def list_orders(db: Session = Depends()) -> list[int]:',
        '    return []',
        '',
        '',
        'def order_page(request: HttpRequest) -> HttpResponse:',
        '    return HttpResponse()',
        '',
        '',
        'class OrderView(View):',
        '    def get(self, request: HttpRequest) -> HttpResponse:',
        '        return HttpResponse()',
        '',
        '',
        'class OrderRepository:',
        '    def find(self, session: Session) -> None:',
        '        pass',
        '',
        '',
        'def unresolved(session: "Connection") -> None:',
        '    pass',
        '',
      ].join('\n'),
    });

    expect(found).toEqual([]);
  });

  it('still flags a persistence handle in a view module, where a request is expected', () => {
    const found = only(CONTRACT, {
      [`${ORDERS}/views.py`]: [
        'from django.db.models import QuerySet',
        'from django.http import HttpResponse',
        '',
        '',
        'def pending() -> QuerySet:',
        '    return None',
        '',
        '',
        'def render() -> HttpResponse:',
        '    return HttpResponse()',
        '',
      ].join('\n'),
    });

    expect(found).toEqual([
      `${CONTRACT} ${ORDERS}/views.py:5 pending|persistence|django.db.models.QuerySet|orders`,
    ]);
  });
});

const SQLALCHEMY_MODELS = [
  'from sqlalchemy.orm import DeclarativeBase, Mapped, declarative_base',
  '',
  'Legacy = declarative_base()',
  '',
  '',
  'class Base(DeclarativeBase):',
  '    pass',
  '',
  '',
  'class Order(Base):',
  '    __tablename__ = "orders"',
  '    id: Mapped[int]',
  '',
  '',
  'class Rush(Order):',
  '    pass',
  '',
  '',
  'class Line(Legacy):',
  '    __tablename__ = "lines"',
  '',
].join('\n');

describe.skipIf(!enabled)('ORM entities in route handlers', () => {
  it('flags SQLAlchemy and SQLModel entities that a handler takes or returns', () => {
    const found = only(HANDLER, {
      'app/models.py': SQLALCHEMY_MODELS,
      'app/api.py': [
        'from fastapi import FastAPI',
        'from sqlmodel import SQLModel',
        'from app.models import Line, Order, Rush',
        '',
        'app = FastAPI()',
        '',
        '',
        'class Hero(SQLModel, table=True):',
        '    id: int',
        '',
        '',
        'class HeroIn(SQLModel):',
        '    name: str',
        '',
        '',
        '@app.get("/orders/{order_id}", response_model=Order)',
        'def read_order(order_id: int):',
        '    return None',
        '',
        '',
        '@app.post("/heroes")',
        'def create_hero(hero: Hero, rush: "Rush") -> list[Line]:',
        '    return []',
        '',
        '',
        '@app.post("/heroes/new")',
        'def add_hero(hero: HeroIn) -> int:',
        '    return 1',
        '',
        '',
        'def load(order_id: int) -> Order:',
        '    return Order()',
        '',
      ].join('\n'),
    });

    expect(found).toEqual([
      `${HANDLER} app/api.py:17 read_order|response_model=|Order|SQLAlchemy`,
      `${HANDLER} app/api.py:22 create_hero|parameter hero|Hero|SQLModel`,
      `${HANDLER} app/api.py:22 create_hero|parameter rush|Rush|SQLAlchemy`,
      `${HANDLER} app/api.py:22 create_hero|return type|Line|SQLAlchemy`,
    ]);
  });

  it('flags Django models in django-ninja and Flask handlers, but not abstract ones', () => {
    const found = only(HANDLER, {
      'shop/models.py': [
        'from django.db import models',
        '',
        '',
        'class Stamped(models.Model):',
        '    class Meta:',
        '        abstract = True',
        '',
        '',
        'class Order(Stamped):',
        '    sku = models.CharField(max_length=20)',
        '',
      ].join('\n'),
      'shop/api.py': [
        'from flask import Flask',
        'from ninja import NinjaAPI',
        'from shop.models import Order, Stamped',
        '',
        'api = NinjaAPI()',
        'web = Flask(__name__)',
        '',
        '',
        '@api.get("/orders", response=list[Order])',
        'def orders(request):',
        '    return []',
        '',
        '',
        '@web.route("/stamped")',
        'def stamped() -> Stamped:',
        '    return None',
        '',
      ].join('\n'),
    });

    expect(found).toEqual([`${HANDLER} shop/api.py:10 orders|response=|Order|Django`]);
  });
});
