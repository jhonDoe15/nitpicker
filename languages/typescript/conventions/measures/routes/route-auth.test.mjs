import { describe, expect, it } from 'vitest';
import { detectConventions } from '../../../../../shared/conventions/detect.mjs';
import { ROUTE_AUTH_CONVENTION, routeAuthEntries } from './route-auth.mjs';

const accepts = (_definition, file) => !/\.test\.|^test\//u.test(file);

function detect(files) {
  const source = {
    paths: () => Object.keys(files),
    readMany: (paths) => new Map(paths.map((file) => [file, files[file]])),
  };
  return detectConventions({ definitions: [ROUTE_AUTH_CONVENTION], source, accepts })[
    ROUTE_AUTH_CONVENTION.id
  ];
}

const nest = (decorators, n) =>
  `import { Controller, Get } from '@nestjs/common';\n@Controller('c${String(n)}')\nclass C${String(n)} { @Get() ${decorators} list() {} }\n`;
const express = (middleware, n) =>
  `import express from 'express';\nconst app = express();\napp.get('/r${String(n)}', ${middleware}(req, res) => {});\n`;

function batch(prefix, count, make) {
  return Object.fromEntries(
    Array.from({ length: count }, (_, index) => [`src/${prefix}${String(index)}.ts`, make(index)]),
  );
}

function nestProject(guarded, other, decorators = '@Authenticated({ permission: P.X })') {
  return {
    ...batch('g', guarded, (index) => nest(decorators, index)),
    ...batch('o', other, (index) => nest('@Authenticated()', 100 + index)),
  };
}

describe('typescript.routeAuth', () => {
  it('follows the decorator shape that 90% of the handlers declare', () => {
    expect(detect(nestProject(19, 1)).choice).toEqual(['nest__Authenticated__permission']);
  });

  it('counts a public marker as declared but never as the shape', () => {
    const files = {
      ...nestProject(15, 0),
      ...batch('p', 3, (index) => nest('@Public()', 200 + index)),
    };

    expect(detect(files).choice).toEqual(['nest__Authenticated__permission']);
    expect(detect(nestProject(2, 0)).choice).toEqual([]);
  });

  it('falls back to the missing guard when guards exist but no shape has a majority', () => {
    const files = {
      ...batch('a', 7, (index) => nest('@UseGuards(JwtGuard)', index)),
      ...batch('b', 5, (index) => nest('', 50 + index)),
    };

    expect(detect(files).choice).toEqual(['nest__fallback']);
  });

  it('stays silent when only a few handlers carry a guard', () => {
    const files = {
      ...batch('a', 2, (index) => nest('@UseGuards(JwtGuard)', index)),
      ...batch('b', 8, (index) => nest('', 50 + index)),
    };

    expect(detect(files).choice).toEqual([]);
  });

  it('ignores throttling and documentation decorators', () => {
    const files = {
      ...batch('a', 8, (index) => nest('@UseGuards(ThrottlerGuard) @ApiBearerAuth()', index)),
      ...batch('b', 2, (index) => nest('', 50 + index)),
    };

    expect(detect(files).choice).toEqual([]);
  });

  it('treats an auth middleware applied to all routes as a global guard', () => {
    const files = nestProject(19, 1);
    files['src/app.module.ts'] =
      'class M { configure(consumer) { consumer.apply(AuthMiddleware).forRoutes("*"); } }\n';

    expect(detect(files).choice).toEqual([]);
  });

  it('stays silent when a global guard exists or no route declares auth', () => {
    const files = {
      ...batch('b', 8, (index) => nest('@UseGuards(G)', index)),
      ...batch('c', 8, (index) => nest('', 50 + index)),
      'src/app.module.ts':
        'import { APP_GUARD } from "@nestjs/core";\nexport const x = APP_GUARD;\n',
    };
    const none = batch('n', 12, (index) => nest('', index));

    expect(detect(files).choice).toEqual([]);
    expect(detect(none).choice).toEqual([]);
  });

  it('follows the auth middleware that 90% of the Express routes use', () => {
    const files = {
      ...batch('r', 19, (index) => express('requireAuth, ', index)),
      'src/health.ts': express('', 99),
    };

    expect(detect(files).choice).toEqual(['route__requireAuth']);
  });

  it('reads the followed entries for the rule options', () => {
    expect(routeAuthEntries({ 'typescript.routeAuth': ['nest__fallback'] })).toEqual([
      'nest__fallback',
    ]);
    expect(routeAuthEntries({})).toEqual([]);
  });
});
