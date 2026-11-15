import { afterEach, describe, expect, it } from 'vitest';
import { createScripts } from '../../test-support/python-rule-scripts.mts';

const enabled = process.env.NITPICKER_PYTHON_E2E === '1';
const { cleanup, findingsOf } = createScripts();
afterEach(cleanup);

const RULE = 'resolver-query-per-parent';
const code = (...lines) => `${lines.join('\n')}\n`;
const STRAWBERRY = code(
  'import strawberry',
  'from strawberry.dataloader import DataLoader',
  'from shop.db import session',
  'from shop.models import Customer',
  'from shop import services',
  'import httpx',
  '',
  '',
);
const GRAPHENE = code(
  'import graphene',
  'from graphene_django import DjangoObjectType',
  'from shop.db import session',
  'from shop.models import Customer',
  '',
  '',
);

function ruleFindings(files) {
  return findingsOf(files)
    .filter((item) => item.startsWith(`${RULE} `))
    .map((item) => item.slice(RULE.length + 1));
}

const strawberry = (body, extra = {}) =>
  ruleFindings({ 'shop/schema.py': `${STRAWBERRY}${body}`, ...extra });
const graphene = (body) => ruleFindings({ 'shop/schema.py': `${GRAPHENE}${body}` });

const LISTED = code(
  '',
  '',
  '@strawberry.type',
  'class Query:',
  '    @strawberry.field',
  '    def orders(self) -> list[Order]:',
  '        return []',
);
const type = (field, extra = '') =>
  code(
    '@strawberry.type',
    'class Order:',
    '    customer_id: int',
    '',
    '    @strawberry.field',
    ...field.split('\n'),
  ) + extra;

describe.skipIf(!enabled)('resolver-query-per-parent on Strawberry', () => {
  it('reports a database query in a field of a type returned as a list', () => {
    const found = strawberry(
      type(
        '    async def customer(self) -> Customer:\n        return await session.get(Customer, self.customer_id)',
        LISTED,
      ),
    );

    expect(found).toEqual(['shop/schema.py:15 Order.customer|strawberry|database|session.get()']);
  });

  it('reports a remote request and a query reached through a project helper', () => {
    const body = type(
      '    async def rate(self) -> float:\n        return (await httpx.AsyncClient().get("http://rates/x")).json()\n\n    @strawberry.field\n    def lines(self) -> int:\n        return services.count_lines(self.customer_id)',
      LISTED,
    );
    const helper = code(
      'from shop.db import session',
      '',
      '',
      'def count_lines(order_id):',
      '    return session.execute("select 1").all()',
    );

    expect(strawberry(body, { 'shop/services.py': helper })).toEqual([
      'shop/schema.py:15 Order.rate|strawberry|remote|httpx.AsyncClient().get()',
      'shop/schema.py:19 Order.lines|strawberry|database|services.count_lines() > session.execute()',
    ]);
  });

  it('reads a list in a string annotation, a connection and an optional list', () => {
    const connection = code(
      '',
      '',
      '@strawberry.type',
      'class Query:',
      '    orders: "list[Order]"',
    );
    const found = strawberry(
      type(
        '    def customer(self) -> Customer:\n        return session.get(Customer, self.customer_id)',
        connection,
      ),
    );

    expect(found).toHaveLength(1);
  });

  it('stays quiet for a type that is never returned as a list', () => {
    const singular = code(
      '',
      '',
      '@strawberry.type',
      'class Query:',
      '    @strawberry.field',
      '    def order(self) -> Order:',
      '        return Order()',
    );

    expect(
      strawberry(
        type(
          '    def customer(self) -> Customer:\n        return session.get(Customer, self.customer_id)',
          singular,
        ),
      ),
    ).toEqual([]);
  });

  it('stays quiet for a root type, a loader, a cache and data on the parent', () => {
    const body = code(
      '@strawberry.type',
      'class Order:',
      '    customer_id: int',
      '    name: str',
      '',
      '    @strawberry.field',
      '    async def customer(self, info) -> Customer:',
      '        return await info.context.customer_loader.load(self.customer_id)',
      '',
      '    @strawberry.field',
      '    async def cached(self, info) -> Customer:',
      '        return info.context.cache.get(self.customer_id)',
      '',
      '    @strawberry.field',
      '    def title(self) -> str:',
      '        return self.name.title()',
      '',
      '',
      '@strawberry.type',
      'class Query:',
      '    @strawberry.field',
      '    async def orders(self) -> list[Order]:',
      '        return list(await session.scalars("select"))',
    );

    expect(strawberry(body)).toEqual([]);
  });

  it('stays quiet for a plain class and for a method that is not a field', () => {
    const body = code(
      'class Order:',
      '    def customer(self):',
      '        return session.get(Customer, 1)',
      '',
      '',
      '@strawberry.type',
      'class Line:',
      '    def helper(self):',
      '        return session.get(Customer, 1)',
      '',
      '',
      '@strawberry.type',
      'class Query:',
      '    orders: list[Order]',
      '    lines: list[Line]',
    );

    expect(strawberry(body)).toEqual([]);
  });

  it('stays quiet for a type that only an unrelated function returns as a list', () => {
    const service = code(
      'from shop.models import Order',
      '',
      '',
      'def export_all() -> list[Order]:',
      '    return []',
    );
    const body = type(
      '    def customer(self) -> Customer:\n        return session.get(Customer, self.customer_id)',
    );

    expect(strawberry(body, { 'shop/service.py': service })).toEqual([]);
  });

  it('stays quiet in tests', () => {
    const body = type(
      '    def customer(self) -> Customer:\n        return session.get(Customer, 1)',
      LISTED,
    );

    expect(ruleFindings({ 'tests/test_schema.py': `${STRAWBERRY}${body}` })).toEqual([]);
  });
});

describe.skipIf(!enabled)('resolver-query-per-parent on Graphene', () => {
  const listed = (name) =>
    code('', '', 'class Query(graphene.ObjectType):', `    orders = graphene.List(${name})`);

  it('reports a query in a resolver of a type listed with List, NonNull or DjangoListField', () => {
    const resolver = (name) =>
      code(
        `class ${name}(graphene.ObjectType):`,
        '    def resolve_customer(parent, info):',
        '        return Customer.objects.get(pk=parent.customer_id)',
      );

    expect(graphene(resolver('OrderType') + listed('OrderType'))).toEqual([
      'shop/schema.py:9 OrderType.customer|graphene|database|Customer.objects.get()',
    ]);
    expect(
      graphene(
        resolver('OrderType') + code('', '', 'items = graphene.List(graphene.NonNull(OrderType))'),
      ),
    ).toHaveLength(1);
    expect(
      graphene(resolver('OrderType') + code('', '', 'items = DjangoListField(lambda: OrderType)')),
    ).toHaveLength(1);
  });

  it('reads the node of a connection and a DjangoObjectType', () => {
    const body = code(
      'class OrderType(DjangoObjectType):',
      '    def resolve_customer(parent, info):',
      '        return session.get(Customer, parent.customer_id)',
      '',
      '',
      'class OrderConnection(graphene.relay.Connection):',
      '    class Meta:',
      '        node = OrderType',
    );

    expect(graphene(body)).toHaveLength(1);
  });

  it('stays quiet for a singular type and for a loader', () => {
    const singular = code(
      'class OrderType(graphene.ObjectType):',
      '    def resolve_customer(parent, info):',
      '        return Customer.objects.get(pk=parent.customer_id)',
      '',
      '',
      'class Query(graphene.ObjectType):',
      '    order = graphene.Field(OrderType)',
    );
    const loader = code(
      'class OrderType(graphene.ObjectType):',
      '    def resolve_customer(parent, info):',
      '        return info.context.customer_loader.load(parent.customer_id)',
    );

    expect(graphene(singular)).toEqual([]);
    expect(graphene(loader + listed('OrderType'))).toEqual([]);
  });
});
