import { afterAll } from 'vitest';
import { rule } from './no-service-locator.mjs';
import {
  MAIL,
  createLocatorProject,
  lookup,
  lookups,
  wrapper,
} from './test-support/locator-project.mjs';

const { tester, typed, remove } = createLocatorProject();
afterAll(remove);

tester.run('no-service-locator', rule, {
  valid: [
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      undefined,
      {
        file: 'src/main/main.ts',
      },
    ),
    typed(
      "import { Container } from 'inversify';\nexport const x = new Container().get('a');",
      undefined,
      {
        file: 'src/main/composition-root.ts',
      },
    ),
    typed("import { Container } from 'typedi';\nexport const x = Container.get('a');", undefined, {
      file: 'src/server.ts',
    }),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      undefined,
      { file: 'src/boot/start.ts', options: [{ entryPoints: ['src/boot/start.ts'] }] },
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      undefined,
      { file: 'src/jobs/run.ts', options: [{ compositionRootPattern: '/jobs/run\\.ts$' }] },
    ),
    typed("import { noLookup } from '../shared/mail';\nexport const n = noLookup();"),
    typed("const cache = new Map<string, string>();\nexport const x = cache.get('a');"),
    typed(
      "import { Container } from 'plain-container';\nconst c = new Container();\nexport const x = c.get('a');",
    ),
    typed('export const x = { get(id: string) { return id; } }.get("a");'),
    typed('type Cradle = { mailer: string };\nexport const run = ({ mailer }: Cradle) => mailer;'),
    typed(
      "import { container } from 'tsyringe';\nexport const wire = () => container.register('a', { useFactory: (c) => c.resolve('b') });",
    ),
    typed(
      "import { Container } from 'inversify';\nexport const wire = (c: Container) => c.bind('a').toDynamicValue((context) => context.container.get('b'));",
    ),
    typed(
      "import { Container } from 'inversify';\nexport const provider = { provide: 'a', useFactory(c: Container) { return c.get('b'); } };",
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const reads = container.register;\nexport const own = container.isRegistered;",
    ),
    typed("import { lookupMailer } from '../shared/reexport';\nexport const m = [lookupMailer];"),
    typed("import { rootMailer } from '../main';\nexport const mailer = rootMailer();"),
    typed("import { resolveMailer } from '../shared/mail';\nexport const x = resolveMailer();"),
    typed("import { lookupMailer } from '../shared/reexport';\nexport const x = lookupMailer();"),
    typed(
      "import { mailerOfTheDay, fixedService } from '../shared/two-levels';\nexport const x = [mailerOfTheDay(), fixedService()];",
    ),
    typed("import { ping } from '../shared/cycle';\nexport const x = ping();"),
    typed(
      "import { registerMailer } from '../shared/registry';\nexport const x = registerMailer();",
    ),
    typed(
      "import { container } from 'tsyringe';\nimport { resolveMailer } from '../shared/mail';\nexport const wire = () => container.register('a', { useFactory: () => resolveMailer() });",
    ),
  ],
  invalid: [
    typed(
      "import { rootService } from '../main';\nexport const mailer = rootService('mailer');",
      wrapper('rootService', MAIL, 'src/main.ts'),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolveAll('a');",
      lookup('tsyringe DependencyContainer.resolveAll'),
    ),
    typed(
      "import { container as c } from 'tsyringe';\nexport const x = c.resolve('a');",
      lookup(MAIL),
    ),
    typed(
      "import * as di from 'tsyringe';\nexport const x = di.container.resolve('a');",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.createChildContainer().resolve('a');",
      lookup(MAIL),
    ),
    typed("import { di } from '../di';\nexport const x = di.resolve('a');", lookup(MAIL)),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container?.resolve('a');",
      lookup(MAIL),
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container['resolve']('a');",
      lookup(MAIL),
    ),
    typed(
      "import { Container } from 'inversify';\nconst c = new Container();\nexport const x = c.get('a');",
      lookup('inversify Container.get'),
    ),
    typed(
      "import { local } from '../di';\nexport const x = local.getAll('a');",
      lookup('inversify Container.getAll'),
    ),
    typed(
      "import { Container } from 'inversify';\nexport const x = (c: Container) => c.getAsync('a');",
      lookup('inversify Container.getAsync'),
    ),
    typed(
      "import { Container } from 'inversify';\nexport const x = (c: Container) => [c.getNamed('a', 'n'), c.getTagged('a', 'k', 'v')];",
      lookups('inversify Container.getNamed', 'inversify Container.getTagged'),
    ),
    typed(
      "import { Container } from 'inversify';\nexport class Service { constructor(private readonly c: Container) {}\n  run() { return this.c.resolve(Service); } }",
      lookup('inversify Container.resolve'),
    ),
    typed(
      "import { Container } from 'typedi';\nexport const x = Container.get('a');",
      lookup('typedi Container.get'),
    ),
    typed(
      "import { Container } from 'typedi';\nexport const x = Container.getMany('a');",
      lookup('typedi Container.getMany'),
    ),
    typed(
      "import { Container } from 'typedi';\nexport const x = Container.of('tenant').get('a');",
      lookup('typedi ContainerInstance.get'),
    ),
    typed(
      "import { createContainer } from 'awilix';\nconst c = createContainer();\nexport const x = c.resolve('a');",
      lookup('awilix AwilixContainer.resolve'),
    ),
    typed(
      "import { createContainer } from 'awilix';\nconst c = createContainer();\nexport const x = c.cradle.mailer;",
      lookup('awilix AwilixContainer.cradle'),
    ),
    typed(
      "import { ModuleRef } from '@nestjs/core';\nexport class Mailing { constructor(private readonly moduleRef: ModuleRef) {}\n  mailer() { return this.moduleRef.get('mailer'); } }",
      lookup('@nestjs/core ModuleRef.get'),
    ),
    typed(
      "import { ModuleRef } from '@nestjs/core';\nexport class Mailing { constructor(private readonly moduleRef: ModuleRef) {}\n  mailer() { return this.moduleRef.resolve('mailer'); }\n  fresh() { return this.moduleRef.create(Mailing); } }",
      lookups('@nestjs/core ModuleRef.resolve', '@nestjs/core ModuleRef.create'),
    ),
    typed(
      "import type { INestApplication } from '@nestjs/common';\nexport const x = (app: INestApplication) => app.get('a');",
      lookup('@nestjs/common INestApplicationContext.get'),
    ),
    typed(
      "import { NestFactory } from '@nestjs/core';\nexport async function start() { const app = await NestFactory.create({}); return app.get('a'); }",
      lookup('@nestjs/common INestApplicationContext.get'),
    ),
    typed(
      "import { resolveService } from '../shared/mail';\nexport const x = resolveService('mailer');",
      wrapper('resolveService', MAIL, 'src/shared/mail.ts'),
    ),
    typed(
      "import * as shared from '../shared/mail';\nexport const x = shared.resolveService('mailer');",
      wrapper('resolveService', MAIL, 'src/shared/mail.ts'),
    ),
    typed(
      "import { resolveService } from '../shared';\nexport const x = resolveService('mailer');",
      wrapper('resolveService', MAIL, 'src/shared/mail.ts'),
    ),
    typed(
      "import { lookupService } from '../shared/reexport';\nexport const x = lookupService('mailer');",
      wrapper('lookupService', MAIL, 'src/shared/mail.ts'),
    ),
    typed(
      "import { serviceOfTheDay } from '../shared/two-levels';\nexport const x = serviceOfTheDay('mailer');",
      wrapper('serviceOfTheDay', MAIL, 'src/shared/mail.ts'),
    ),
    typed(
      "import { serviceAgain as again } from '../shared/two-levels';\nexport const x = again('mailer');",
      wrapper('again', MAIL, 'src/shared/mail.ts'),
    ),
    typed(
      "import { resolveService } from '../shared/mail';\nexport const x = () => () => resolveService('mailer');",
      wrapper('resolveService', MAIL, 'src/shared/mail.ts'),
    ),
    typed(
      "import { resolveService } from '../shared/mail';\nexport const x = [resolveService('a'), resolveService('b')];",
      [
        {
          messageId: 'wrapper',
          data: { name: 'resolveService', api: MAIL, file: 'src/shared/mail.ts' },
        },
        {
          messageId: 'wrapper',
          data: { name: 'resolveService', api: MAIL, file: 'src/shared/mail.ts' },
        },
      ],
    ),
    typed(
      "import { container } from 'tsyringe';\nexport const x = container.resolve('a');",
      lookup(MAIL),
      { file: 'src/boot/begin.ts', options: [{ entryPoints: ['src/other/begin.ts'] }] },
    ),
  ],
});
