import { typescriptRuleTester } from '../../test-support/rule-tester.mjs';
import { rule } from './no-repeated-string-literal.mjs';

const tester = typescriptRuleTester();
const filename = '/repo/src/main/orders/order-labels.ts';

const repeated = (text) => ({ messageId: 'repeated', data: { text: JSON.stringify(text) } });

tester.run('no-repeated-string-literal', rule, {
  valid: [
    'const a = "pending order"; const b = "pending order";',
    'const a = "tiny"; const b = "tiny"; const c = "tiny"; const d = "tiny";',
    'const a = "-----"; const b = "-----"; const c = "-----";',
    'const a = "UTF-8"; f("utf-8"); g("utf-8"); h("utf-8");',
    'f("POST"); g("POST"); h("POST");',
    'f("application/json"); g("application/json"); h("application/json");',
    'f("%Y-%m-%d"); g("%Y-%m-%d"); h("%Y-%m-%d");',
    'import a from "node:path"; import b from "node:path"; export * from "node:path";',
    'const a = require("node:path"); const b = require("node:path"); const c = require("node:path");',
    'const a = await import("./order.mjs"); const b = await import("./order.mjs"); const c = await import("./order.mjs");',
    '"use strict"; "use strict"; "use strict";',
    'const x = { orderLabel: 1 }; const y = { "orderLabel": 2 }; const z = { "orderLabel": 3 };',
    'const a = { type: "order-created" }; const b = { type: "order-created" }; const c = { kind: "order-created" };',
    'const a = { tag: "order-created" }; const b = { variant: "order-created" }; const c = { type: "order-created" };',
    'const a = row["customer_id"]; const b = other["customer_id"]; const c = third["customer_id"];',
    'function f(x) { switch (x) { case "pending": return 1; case "pending": return 2; case "pending": return 3; } }',
    'type Status = "pending" | "paid"; type Other = "pending" | "paid"; type Third = "pending";',
    'const a = <div className="order-card" />; const b = <div className="order-card" />; const c = <div className="order-card" />;',
    'const a = t("orders.title"); const b = t("orders.title"); const c = t("orders.title");',
    'const a = i18n.t("orders.title"); const b = i18n.t("orders.title"); const c = i18n.t("orders.title");',
    'const ORDER_PENDING = "pending order"; const ORDER_OPEN = "pending order"; const ORDER_WAIT = "pending order";',
    'enum Status { A = "pending order", B = "pending order", C = "pending order" }',
    'const a = typeof x === "undefined"; const b = typeof y !== "undefined"; const c = "undefined" === typeof z;',
    'const a = typeof x === "function"; const b = typeof y == "function"; const c = typeof z === "function";',
    'const a = n.type === "MemberExpression"; const b = m.type !== "MemberExpression"; const c = "MemberExpression" == k.type;',
    'const a = n?.kind === "MemberExpression"; const b = n.tag != "MemberExpression"; const c = n.variant === "MemberExpression";',
    'const a = ["MemberExpression", "CallExpression"].includes(n.type); const b = ["MemberExpression"].includes(m.kind);',
    'const a = new Set(["MemberExpression"]).has(n.type); const b = new Set(["MemberExpression"]).has(m.kind); const c = ["MemberExpression"].includes(k.tag);',
    'const a = { "nitpicker/first-rule": "error", "nitpicker/second-rule": "error", "no-third-rule": "error" };',
    'const a = { "@scope/first-rule": ["error", { max: 1 }], "second-rule": ["error"], "nitpicker/third-rule": "error" };',
    '@Column("varchar") class A { @Column("varchar") a; @Column("varchar") b; }',
    '@Entity("order_items") class A { @OneToMany(() => B, { cascade: ["insert-all"] }) a; @Index(["insert-all"]) b; @Index(["insert-all"]) c; }',
    'class A { "orderLabel" = 1; "orderLabel2" = 2; }',
    'const a = "one value"; const b = "other value"; const c = "third value";',
    'const a = tag`pending order`; const b = tag`pending order`; const c = tag`pending order`;',
    'a.on("order-changed", f); b.once("order-changed", f); c.emit("order-changed");',
    'const a = "orderLabel" in x; const b = "orderLabel" in y; const c = "orderLabel" in z;',
    'const a = cn("order-card", "order-card"); const b = clsx("order-card"); const c = twMerge("order-card");',
    'const a = <div className={ok ? "order-card" : "order-list"} />; const b = <div className={ok ? "order-card" : "order-list"} />; const c = <div className={ok ? "order-card" : "order-list"} />;',
    'vi.mock("./order-store"); jest.mock("./order-store"); vi.doMock("./order-store");',
    'declare module "orders-ui" {} declare module "orders-ui" {} declare module "orders-ui" {}',
    'type A = import("./orders-types").A; type B = import("./orders-types").B; type C = import("./orders-types").C;',
  ].map((code) =>
    code.includes('<div')
      ? {
          filename: `${filename}x`,
          code,
          languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
        }
      : { filename, code },
  ),
  invalid: [
    {
      code: 'function f() { log("order not found"); throw new Error("order not found"); return "order not found"; }',
      errors: [repeated('order not found')],
    },
    {
      code: 'const a = f("order not found"); const b = f("order not found"); const c = f("order not found"); const d = f("order not found");',
      errors: [repeated('order not found'), repeated('order not found')],
    },
    {
      code: 'f(`order not found`); f("order not found"); f(`order not found`);',
      errors: [repeated('order not found')],
    },
    {
      code: 'const a = x === "pending order"; const b = y === "pending order"; const c = z !== "pending order";',
      errors: [repeated('pending order')],
    },
    {
      code: 'const a = n.name === "pending order"; const b = m.name === "pending order"; const c = k.name === "pending order";',
      errors: [repeated('pending order')],
    },
    {
      code: 'const a = ["pending order"].includes(n.name); const b = ["pending order"].includes(m.name); const c = ["pending order"].includes(k.name);',
      errors: [repeated('pending order')],
    },
    {
      code: 'const a = { status: "error" }; const b = { state: "error" }; const c = { "nitpicker/rule": "error", level: "error" };',
      errors: [repeated('error')],
    },
    {
      code: 'const a = { "nitpicker/first-rule": "always" }; const b = { "nitpicker/second-rule": "always" }; const c = { "no-third-rule": "always" };',
      errors: [repeated('always')],
    },
    {
      code: 'const a = f("one"); const b = ["alpha beta", "alpha beta"]; const c = { reason: "alpha beta" };',
      errors: [repeated('alpha beta')],
    },
    {
      code: 'const a = f("x".repeat(40)); const b = f("some long message that never ends here"); const c = f("some long message that never ends here"); const d = f("some long message that never ends here");',
      errors: [repeated('some long message that never e...')],
    },
  ].map((test) => ({ filename, ...test })),
});
