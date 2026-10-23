import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-script-helpers.mjs';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const HANDLER = 'handler-entity-type';

function only(rule, files) {
  return findingsOf(files).filter((line) => line.startsWith(`${rule} `));
}

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

  it('leaves FastAPI dependencies out and reads the response model before the return type', () => {
    const found = only(HANDLER, {
      'app/models.py': SQLALCHEMY_MODELS,
      'app/deps.py': [
        'from typing import Annotated',
        'from fastapi import Depends',
        'from app.models import Order',
        '',
        '',
        'def current_order() -> Order:',
        '    return Order()',
        '',
        '',
        'CurrentOrder = Annotated[Order, Depends(current_order)]',
        '',
      ].join('\n'),
      'app/api.py': [
        'from typing import Annotated',
        'from fastapi import APIRouter, Depends',
        'from app.deps import CurrentOrder, current_order',
        'from app.models import Order',
        '',
        'router = APIRouter()',
        '',
        '',
        '@router.get("/me", response_model=int)',
        'def me(order: CurrentOrder, other: Annotated[Order, Depends(current_order)]) -> Order:',
        '    return order',
        '',
        '',
        '@router.get("/one")',
        'def one(order: Order = Depends(current_order)):',
        '    return order',
        '',
        '',
        '@router.get("/raw", response_model=None)',
        'def raw() -> Order:',
        '    return Order()',
        '',
      ].join('\n'),
    });

    expect(found).toEqual([
      `${HANDLER} app/api.py:15 one|returned value|Order|SQLAlchemy`,
      `${HANDLER} app/api.py:20 raw|return type|Order|SQLAlchemy`,
    ]);
  });

  it('flags Django function views and DRF views that hand out a model', () => {
    const found = only(HANDLER, {
      'shop/models.py': [
        'from django.db import models',
        '',
        '',
        'class Order(models.Model):',
        '    sku = models.CharField(max_length=20)',
        '',
      ].join('\n'),
      'shop/views.py': [
        'from django.http import JsonResponse',
        'from rest_framework import viewsets',
        'from rest_framework.response import Response',
        'from rest_framework.views import APIView',
        'from shop.models import Order',
        'from shop.serializers import OrderSerializer',
        '',
        '',
        'def latest(request) -> Order:',
        '    return Order.objects.latest("id")',
        '',
        '',
        'def count(request):',
        '    return JsonResponse(Order.objects.values("sku"))',
        '',
        '',
        'class OrderView(APIView):',
        '    def get(self, request, pk):',
        '        order = Order.objects.get(pk=pk)',
        '        return Response(order)',
        '',
        '    def post(self, request):',
        '        return Response(OrderSerializer(Order.objects.first()).data)',
        '',
        '',
        'class OrderViewSet(viewsets.ViewSet):',
        '    def list(self, request):',
        '        return Response(Order.objects.all())',
        '',
      ].join('\n'),
    });

    expect(found).toEqual([
      `${HANDLER} shop/views.py:9 latest|return type|Order|Django`,
      `${HANDLER} shop/views.py:18 OrderView.get|response body|Order|Django`,
      `${HANDLER} shop/views.py:27 OrderViewSet.list|response body|Order|Django`,
    ]);
  });
});
