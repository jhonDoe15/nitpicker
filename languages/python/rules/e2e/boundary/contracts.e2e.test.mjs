import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const CONTRACT = 'contract-infrastructure-type';
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
      `${CONTRACT} ${ORDERS}/__init__.py:1 place|persistence|Session`,
      `${CONTRACT} ${ORDERS}/queries.py:9 active|persistence|QuerySet`,
      `${CONTRACT} ${ORDERS}/queries.py:17 Orders.rows|persistence|Connection`,
      `${CONTRACT} ${ORDERS}/queries.py:20 Orders.total|transport|Request`,
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

    expect(found).toEqual([`${CONTRACT} ${ORDERS}/views.py:5 pending|persistence|QuerySet`]);
  });

  it('follows every re-export of __init__.py, star imports by __all__ included', () => {
    const found = only(CONTRACT, {
      [`${ORDERS}/__init__.py`]: [
        'from ._queries import *',
        'from .repository import open_session',
        '',
      ].join('\n'),
      [`${ORDERS}/_queries.py`]: [
        'from django.db.models import QuerySet',
        '',
        '__all__ = ["recent"]',
        '',
        '',
        'def recent() -> QuerySet:',
        '    return None',
        '',
        '',
        'def drafts() -> QuerySet:',
        '    return None',
        '',
      ].join('\n'),
      [`${ORDERS}/repository.py`]: `${SESSION}\n\ndef open_session() -> Session:\n    return None\n`,
    });

    expect(found).toEqual([
      `${CONTRACT} ${ORDERS}/__init__.py:1 recent|persistence|QuerySet`,
      `${CONTRACT} ${ORDERS}/__init__.py:2 open_session|persistence|Session`,
    ]);
  });

  it('leaves injected parameters and request-first views alone but not a transaction decorator', () => {
    const found = only(CONTRACT, {
      [`${ORDERS}/__init__.py`]: '',
      'app/deps.py': [
        'from typing import Annotated',
        'from fastapi import Depends',
        SESSION,
        'def get_db() -> Session:',
        '    return None',
        '',
        '',
        'SessionDep = Annotated[Session, Depends(get_db)]',
        '',
      ].join('\n'),
      [`${ORDERS}/pages.py`]: [
        'from typing import Annotated',
        'from django.db import models, transaction',
        'from django.http import HttpResponse',
        'from fastapi import Depends',
        SESSION,
        'from app.deps import SessionDep, get_db',
        '',
        '',
        'def index(request) -> HttpResponse:',
        '    return HttpResponse()',
        '',
        '',
        'def owner(session: SessionDep, db: Annotated[Session, Depends(get_db)]) -> int:',
        '    return 0',
        '',
        '',
        'def total(db: Session = Depends(get_db)) -> int:',
        '    return 0',
        '',
        '',
        '@transaction.atomic',
        'def lock(rows: models.QuerySet) -> None:',
        '    pass',
        '',
        '',
        'class OrderManager(models.Manager):',
        '    def pending(self) -> models.QuerySet:',
        '        return self.all()',
        '',
        '',
        'class Order(models.Model):',
        '    def lines(self) -> models.QuerySet:',
        '        return None',
        '',
      ].join('\n'),
    });

    expect(found).toEqual([
      `${CONTRACT} ${ORDERS}/pages.py:23 lock|persistence|QuerySet`,
      `${CONTRACT} ${ORDERS}/pages.py:33 Order.lines|persistence|QuerySet`,
    ]);
  });
});
