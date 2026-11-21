import { typescriptRuleTester } from '../../../../test-support/rule-tester.mts';
import { rule } from '../no-costly-collection-form.mts';

const tester = typescriptRuleTester();

const SCAN = (name: string, method: string, value: string) => ({
  messageId: 'scanInLoop',
  data: { name, method, value },
});
const GROUP = (name: string, key: string) => ({ messageId: 'groupInLoop', data: { name, key } });

tester.run('no-costly-collection-form repeated scans', rule, {
  valid: [
    'export function f(xs: string[], rs: R[], o: R) { for (const x of xs) { use(x, rs.filter((r) => r.id === o.id)); } }\ndeclare function use(a: unknown, b: unknown): void;\ntype R = { id: string };',
    'export class C { id = "a"; f(os: R[], rs: R[]) { return os.map(() => rs.filter((r) => r.id === this.id)); } }\ntype R = { id: string };',
    'export function f(os: R[], rs: R[]) { return os.map((o) => rs.filter((r) => r.id === os[0]!.id)); }\ntype R = { id: string };',
    'export function f(os: R[], rs: R[], xs: string[]) { for (const o of os) { const seen = rs.map((r) => r.id); for (const x of xs) { if (seen.includes(o.id)) console.log(x); } } }\ntype R = { id: string };',
    'export function f(os: R[], rs: R[]) { const seen = rs.map((r) => r.id); return os.some((o, i, all) => seen.includes(all[0]!.id)); }\ntype R = { id: string };',
    'export function f(os: R[], rs: R[]) { const seen = rs.map((r) => r.id); for (const o of os) { if (seen.includes(o.id)) [seen[0]] = ["a"]; } }\ntype R = { id: string };',
    'export function f(os: R[], rs: R[]) { const seen = rs.map((r) => r.id); for (const o of os) { if (seen.includes(o.id)) for (seen[0] of ["a"]) { console.log(o); } } }\ntype R = { id: string };',
    'export function f(orders: Order[], ids: readonly string[]) { return orders.filter((order) => ids.includes(order.customerId)); }\ntype Order = { customerId: string };',
    'export function f(orders: Order[]) { const ids: Array<string> = load(); return orders.some((order) => ids.includes(order.id)); }\ndeclare function load(): string[];\ntype Order = { id: string };',
    'export function f(orders: Order[], text: string) { const ids = text.split(","); return orders.filter((order) => ids.includes(order.id)); }\ntype Order = { id: string };',
    'export function f(orders: Order[], ids: string[]) { return ids.includes(orders[0]?.id ?? ""); }\ntype Order = { id: string };',
    'export function f(orders: Order[], name: string) { for (const order of orders) { if (name.includes(order.id)) return order; } return undefined; }\ntype Order = { id: string };',
    'export function f(orders: Order[]) { const ids = ["a", "b"]; return orders.filter((order) => ids.includes(order.id)); }\ntype Order = { id: string };',
    'const IDS = "a,b,c".split(","); export function f(orders: Order[]) { return orders.filter((order) => IDS.includes(order.id)); }\ntype Order = { id: string };',
    'export function f(orders: Order[], ids: string[]) { return orders.filter((order) => ids.includes("fixed")); }\ntype Order = { id: string };',
    'export function f(orders: Order[], ids: string[]) { for (const order of orders) { ids.push(order.id); if (ids.includes(order.id)) return order; } return undefined; }\ntype Order = { id: string };',
    'export function f(ids: string[]) { for (const id of ["a", "b", "c"]) { if (ids.includes(id)) return id; } return undefined; }',
    'export function f(ids: string[]) { for (let i = 0; i < 3; i += 1) { if (ids.includes(String(i))) return i; } return undefined; }',
    'export function f(ids: string[]) { return ids.filter((id, index) => ids.indexOf(id) === index); }',
    'export function f(orders: Order[], ids: string[]) { return orders.filter((order) => ids.includes(order.id, 2)); }\ntype Order = { id: string };',
    'export function f(orders: Order[], ids: Set<string>) { return orders.filter((order) => ids.has(order.id)); }\ntype Order = { id: string };',
    'export function f(orders: Order[], ids) { return orders.filter((order) => ids.includes(order.id)); }\ntype Order = { id: string };',
    'export function f(orders: Order[], rows: Row[]) { return orders.map((order) => rows.filter((row) => row.total > order.total)); }\ntype Order = { total: number }; type Row = { total: number };',
    'export function f(rows: Row[]) { return ["a", "b"].map((kind) => rows.filter((row) => row.kind === kind)); }\ntype Row = { kind: string };',
    'export function f(orders: Order[], rows: Row[]) { for (const order of orders) { const mine = rows.filter((row) => row.id === order.id); rows.push(...mine); } }\ntype Order = { id: string }; type Row = { id: string };',
  ],
  invalid: [
    {
      code: 'export function f(orders: Order[], customers: Customer[]) { const ids = customers.map((customer) => customer.id); return orders.filter((order) => ids.includes(order.customerId)); }\ntype Order = { customerId: string }; type Customer = { id: string };',
      errors: [SCAN('ids', 'includes', 'order.customerId')],
    },
    {
      code: 'export function f(orders: Order[], rows: Row[]) { const ids = rows.map((row) => row.id); for (const order of orders) { if (ids.indexOf(order.id) >= 0) return order; } return undefined; }\ntype Order = { id: string }; type Row = { id: string };',
      errors: [SCAN('ids', 'indexOf', 'order.id')],
    },

    {
      code: 'export function f(orders: Order[], set: Set<string>) { const ids = [...set]; return orders.filter((order) => ids.includes(order.id)); }\ntype Order = { id: string };',
      errors: [SCAN('ids', 'includes', 'order.id')],
    },
    {
      code: 'export function f(orders: Order[], lines: Line[]) { return orders.map((order) => lines.filter((line) => line.orderId === order.id)); }\ntype Order = { id: string }; type Line = { orderId: string };',
      errors: [GROUP('lines', 'orderId')],
    },
    {
      code: 'export function f(orders: Order[], lines: Line[]) { for (const order of orders) { send(lines.filter((line) => order.id === line.orderId)); } }\ndeclare function send(lines: Line[]): void;\ntype Order = { id: string }; type Line = { orderId: string };',
      errors: [GROUP('lines', 'orderId')],
    },
  ],
});
