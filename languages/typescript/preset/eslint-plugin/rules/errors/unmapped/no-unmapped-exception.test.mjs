import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll } from 'vitest';
import { typescriptRuleTester } from '../../../test-support/rule-tester.mjs';
import { rule } from './no-unmapped-exception.mjs';

const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'nitpicker-unmapped-exception-')));

function write(file, lines) {
  mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  writeFileSync(path.join(root, file), [...lines, ''].join('\n'));
}

write('tsconfig.json', [
  JSON.stringify({
    compilerOptions: {
      strict: true,
      module: 'esnext',
      moduleResolution: 'bundler',
      experimentalDecorators: true,
      noEmit: true,
      types: [],
      lib: ['ES2022'],
    },
    include: ['src'],
  }),
]);
write('node_modules/@nestjs/common/package.json', [
  '{ "name": "@nestjs/common", "types": "index.d.ts" }',
]);
write('node_modules/@nestjs/common/index.d.ts', [
  'export declare class HttpException extends Error { constructor(message: string, status: number); }',
  'export declare class NotFoundException extends HttpException { constructor(message?: string); }',
  'export declare function Controller(path?: string): ClassDecorator;',
  'export declare function Injectable(): ClassDecorator;',
  'export declare function Get(path?: string): MethodDecorator;',
  'export declare function Post(path?: string): MethodDecorator;',
  'export declare function Catch(...types: Function[]): ClassDecorator;',
  'export declare function UseFilters(...filters: unknown[]): ClassDecorator & MethodDecorator;',
  'export declare const APP_FILTER = "APP_FILTER";',
  'export declare function Module(metadata: object): ClassDecorator;',
]);
write('src/errors.ts', [
  'export class DomainError extends Error {}',
  'export class OrderMissing extends DomainError {}',
  'export class PermissionDenied extends Error {}',
  'export class GloballyMapped extends Error {}',
  'export class NamedByCatchAll extends Error {}',
  'export class MissingResource extends Error {}',
  'export class ShortErr extends Error {}',
  'export class QuotedErr extends Error {}',
  'import { NotFoundException } from "@nestjs/common";',
  'export class ProductMissing extends NotFoundException {}',
]);
write('src/filters.ts', [
  'import { Catch } from "@nestjs/common";',
  'import { DomainError, GloballyMapped, NamedByCatchAll, PermissionDenied, QuotedErr, ShortErr } from "./errors";',
  '@Catch(ShortErr) export class ShortFilter { catch(error: unknown) { return error; } }',
  '@Catch(QuotedErr) export class QuotedFilter { catch(error: unknown) { return error; } }',
  '@Catch(PermissionDenied) export class PermissionFilter { catch(error: unknown) { return error; } }',
  '@Catch(DomainError) export class DomainFilter { catch(error: unknown) { return error; } }',
  '@Catch(GloballyMapped) export class GlobalFilter { catch(error: unknown) { return error; } }',
  '@Catch() export class AllFilter {',
  '  catch(error: unknown) { if (error instanceof NamedByCatchAll) { return 404; } return 500; }',
  '}',
]);
write('src/app.module.ts', [
  'import { APP_FILTER, Module } from "@nestjs/common";',
  'import { GlobalFilter, QuotedFilter, ShortFilter } from "./filters";',
  'const useClass = ShortFilter;',
  '@Module({ providers: [{ provide: APP_FILTER, useClass: GlobalFilter }, { provide: APP_FILTER, useClass }] })',
  'export class AppModule {}',
  '@Module({ providers: [{ "provide": APP_FILTER, "useClass": QuotedFilter }] }) export class OtherModule {}',
]);
write('src/main.ts', [
  'import { AllFilter } from "./filters";',
  'declare const app: { useGlobalFilters(...filters: unknown[]): void };',
  'app.useGlobalFilters(new AllFilter());',
]);
write('src/orders.service.ts', [
  'import { Injectable } from "@nestjs/common";',
  'import { MissingResource, OrderMissing } from "./errors";',
  '@Injectable() export class OrdersService {',
  '  find(id: string): string { if (id === "") { throw new MissingResource(); } return this.load(id); }',
  '  private load(id: string): string { if (id === "x") { throw new OrderMissing(); } return id; }',
  '  safe(id: string): string { try { return this.find(id); } catch { return ""; } }',
  '}',
]);

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

const tester = typescriptRuleTester({ project: './tsconfig.json', tsconfigRootDir: root });
const HEADER = [
  'import { Controller, Get, Post, UseFilters } from "@nestjs/common";',
  'import * as errors from "./errors";',
  'import { DomainFilter, PermissionFilter } from "./filters";',
  'import { OrdersService } from "./orders.service";',
].join('\n');

function typed(body, errors) {
  const code = `${HEADER}\n${body}`;
  const file = path.join(
    root,
    `src/case-${createHash('sha256').update(code).digest('hex').slice(0, 12)}.ts`,
  );
  writeFileSync(file, code);
  return errors === undefined ? { code, filename: file } : { code, filename: file, errors };
}

const unmapped = (handler, error, through = '') => ({
  messageId: 'unmapped',
  data: { handler, error, path: through },
});

tester.run('no-unmapped-exception', rule, {
  valid: [
    typed('@Controller() export class A { @Get() a() { throw new errors.ProductMissing(); } }'),
    typed('@Controller() export class B { @Get() b() { throw new Error("plain"); } }'),
    typed(
      '@Controller() @UseFilters(PermissionFilter) export class C { @Get() c() { throw new errors.PermissionDenied(); } }',
    ),
    typed(
      '@Controller() export class D { @Get() @UseFilters(new DomainFilter()) d() { throw new errors.OrderMissing(); } }',
    ),
    typed('@Controller() export class E { @Get() e() { throw new errors.GloballyMapped(); } }'),
    typed('@Controller() export class F { @Get() f() { throw new errors.NamedByCatchAll(); } }'),
    typed(
      '@Controller() export class G { constructor(private readonly orders: OrdersService) {} @Get() g() { return this.orders.safe("1"); } }',
    ),
    typed(
      '@Controller() export class H { @Get() h() { try { throw new errors.PermissionDenied(); } catch { return 1; } } }',
    ),
    typed('export class NotAController { @Get() i() { throw new errors.PermissionDenied(); } }'),
    typed('@Controller() export class J { helper() { throw new errors.PermissionDenied(); } }'),
    typed(
      '@Controller() export class O { @Get() o() { throw new errors.ShortErr(); } @Post() p() { throw new errors.QuotedErr(); } }',
    ),
    typed(
      'function mixin<T extends new (...args: any[]) => object>(base: T) { return class extends base {}; }\nclass Mixed extends mixin(Error) {}\n@Controller() export class P { @Get() p() { throw new Mixed(); } }',
    ),
    typed(
      '@Controller() export class Q { @Get() q() { const later = () => { throw new errors.PermissionDenied(); }; return later.length; } }',
    ),
    typed(
      '@Controller() export class R { constructor(private readonly orders: OrdersService) {} @Get() r() { return Promise.resolve().then(() => this.orders.find("1")).catch(() => null); } }',
    ),
    typed(
      'import { Catch } from "@nestjs/common";\n@Catch(Error) class ErrorFilter { catch(error: unknown) { if (error instanceof errors.MissingResource) { return 404; } return 500; } }\n@Controller() @UseFilters(ErrorFilter) export class S { @Get() s() { throw new errors.MissingResource(); } }',
    ),
  ],
  invalid: [
    typed('@Controller() export class K { @Get() k() { throw new errors.PermissionDenied(); } }', [
      unmapped('K.k', 'PermissionDenied'),
    ]),
    typed(
      '@Controller() @UseFilters(PermissionFilter) export class L { @Post() l() { throw new errors.OrderMissing(); } }',
      [unmapped('L.l', 'OrderMissing')],
    ),
    typed(
      '@Controller() export class M { constructor(private readonly orders: OrdersService) {} @Get() m() { return this.orders.find("1"); } }',
      [
        unmapped('M.m', 'MissingResource', ' (through `OrdersService.find`)'),
        unmapped('M.m', 'OrderMissing', ' (through `OrdersService.find`, `OrdersService.load`)'),
      ],
    ),
    typed(
      '@Controller() @UseFilters(DomainFilter) export class N { constructor(private readonly orders: OrdersService) {} @Get() n() { return this.orders.find("1"); } }',
      [unmapped('N.n', 'MissingResource', ' (through `OrdersService.find`)')],
    ),
    typed(
      '@Controller() export class T { @Get() t() { return [1].map(() => { throw new errors.PermissionDenied(); }); } }',
      [unmapped('T.t', 'PermissionDenied')],
    ),
    typed(
      'import { Catch } from "@nestjs/common";\n@Catch(Error) class ErrorFilter { catch(error: unknown) { return error; } }\n@Controller() @UseFilters(ErrorFilter) export class U { @Get() u() { throw new errors.PermissionDenied(); } }',
      [unmapped('U.u', 'PermissionDenied')],
    ),
  ],
});
