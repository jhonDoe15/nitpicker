# Layout and boundaries

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

- Each feature lives in `src/main/features/<name>/` and exposes a public `index.ts`. Other code
  imports a feature only through that file. A new feature is a new directory, not a new branch in a
  shared entry point.
- `features/<name>/domain/` holds pure logic: functional core, imperative shell, using hexagonal
  architecture's folder names. It may not import `adapters/`, Node I/O modules (the pure ones
  `path`, `url`, `util`, `assert`, `buffer`, `events`, `string_decoder`, `punycode`, `querystring`
  and subpaths like `path/posix` and `assert/strict` are fine), network or database clients, the
  logger, module state, or ID and random-data libraries (`uuid`, `nanoid`, `cuid`, `ulid`, `faker`).
  Date libraries (`dayjs`, `luxon`, `date-fns`) are fine for arithmetic on a given value; reading
  the clock through them (`dayjs()`, `dayjs.utc()`, `moment()`, `DateTime.now()`, `Temporal.Now`,
  `.fromNow()`, and date-fns `isToday`, `isPast`, `startOfToday` or `formatDistanceToNow`) is reported
  like `Date.now()`.
  It may not reach Node I/O or a client through a `shared/` module it imports
  (`domain-does-not-reach-io-through-shared`; an `import type` does not count). Time, IDs, and randomness arrive as parameters. A
  dependency-cruiser rule that flags legitimate code is lifted with an `exceptions` entry that names
  the rule (for example `domain-does-not-import-node-io`), where `paths` are the importing files.
- `features/<name>/adapters/` performs I/O and calls `domain/`. A feature with neither I/O nor UI
  has no `adapters/` folder. React components and hooks live in `adapters/` (the UI is I/O with the
  user), or in `shared/ui/` when several features use them. `domain/` may not import a UI
  framework or UI state package: `react`, `react-*`, `*-react` (`lucide-react`), `@*/react` and
  `@*/react-*` (TanStack Query), `preact` and `@preact/*` (`@preact/signals`), `next` and `next/*`,
  `expo`, `expo-*` and `@expo/*`, `vue`, `svelte`, `solid-js`, `@angular/*`, `redux` and
  `@reduxjs/*`, `zustand`, `jotai`, `valtio`, `mobx`, `recoil`, `swr`, `motion` and
  `framer-motion`, `styled-components` and `@emotion/*`, the component kits (`@mui/*`,
  `@chakra-ui/*`, `@mantine/*`, `@radix-ui/*`, `@headlessui/*`, `antd`, `@ant-design/*`) and the
  icon packages (`@fortawesome/*`, `@iconify/*`, `@mdi/*`), also through `require`,
  `import = require` or a `shared/` module that imports or re-exports one. JSX is not written in
  `domain/` at all, even with the automatic runtime and no import: a component that renders the
  domain's result lives in `adapters/` or `shared/ui` (`nitpicker/no-ui-framework-in-domain`, so
  an exception lifts only this ban). The list is `uiFrameworks` in
  `architecture/domain-packages.mjs`, beside the network, database, logger and ID packages the
  dependency rules keep out of `domain/`.
- Shared code does not import features. Features do not import the composition root. Import cycles
  are not allowed.
- A feature's `index.ts` is its contract, so it does not hand out a persistence handle or a web
  request or response object (`nitpicker/contract-infrastructure-type`, type-aware): an exported
  variable that holds one (`export const db = new PrismaClient()`), an exported function, a public
  method of an exported class, a callable member of an exported interface or type, or a member of
  the object an exported factory returns may not take or return a Prisma client or transaction, a
  Knex, `pg`, `mysql`/`mysql2`, MongoDB, Mongoose, TypeORM (`DataSource`, `EntityManager`,
  `Repository`, `QueryRunner`), Sequelize, Drizzle (`*Database`, `*Transaction`), Kysely, SQLite,
  libSQL, `postgres` or MikroORM handle, or an Express, Fastify, Koa, Hono, Next.js or Node `http`
  request, response or context. The type is resolved by the checker through generics, unions,
  aliases, `Promise` and re-exports (`export *`), and its package is read from the declaration file,
  so a project type with the same name never counts; a Prisma client generated to a custom `output`
  counts as `@prisma/client` (the rule reads `generator` blocks with `provider = "prisma-client-js"`
  or `"prisma-client"` in `prisma/schema.prisma`, `schema.prisma` or `prisma/schema/*.prisma` of the
  folders above the generated file, and also knows a generated client folder by the `schema.prisma`
  Prisma copies into it). Take a repository or a port interface, return a domain type or a plain
  record and take plain values; keep the handle in the feature's `adapters/`. Only members the
  project declares are read: the methods of an Express `Router` or app, a Hono app, a tRPC router
  (`appRouter.createCaller`, `AppRouter`) and other library types are the library's signatures, so
  exporting `router`, `app` or `AppRouter` is fine. Left out: a handler signature with a request or
  context among its parameters (route handlers, middleware, and Express error middleware
  `(err, req, res, next)`), the methods of a NestJS `@Controller`, constructors, and the parameters
  of a factory: a function or static method that returns an object synchronously (not a `Promise`,
  an array or a function) that holds no handle itself, such as `createOrders(db)` or
  `authConfig(prisma)`; the composition root passes the handle in, and the methods of the object it
  returns are checked. A function that returns a `Promise` is a query, so
  `findUsers(db: PrismaClient): Promise<User[]>` is reported; a synchronous query that returns a record
  (`getUser(db: Database, id): User` with `better-sqlite3`) looks like a factory and is not. An
  optional transaction parameter (`insert(order, trx?: Knex.Transaction)`) is reported like any
  other: a unit of work is an object the feature defines that holds the transaction and its
  repositories. Exported class properties are not read, only methods.
- A route handler does not take or return an ORM entity (`nitpicker/handler-entity-type`,
  type-aware): the parameters and return type of a NestJS route method (`@Get`, `@Post`, ... in a
  `@Controller`), also when the return type is inferred, the exported HTTP-verb functions of a
  Next.js `route.ts`, the argument of `res.json`/`res.send`, `NextResponse.json` or `Response.json`,
  and a Koa `ctx.body =`. Entities are TypeORM and MikroORM `@Entity` classes (also inherited),
  Sequelize `Model` and Mongoose `Document` subclasses (a `HydratedDocument<Cat>` is named `Cat`),
  and Prisma models: `User`, `Prisma.UserGetPayload<...>` and what `prisma.user.findMany()` returns,
  recognized by their fields coming from Prisma's generated `$UserPayload`, also in a client
  generated to a custom `output` (found as for `contract-infrastructure-type`). A Prisma `select`
  projection is not an entity. Take and return a plain record (DTO) and map the entity to it in the
  service.
- Code under `src/main/` lives in `features/`, `shared/` or the composition root
  (`nitpicker/no-unknown-main-folder`): a `services/`, `utils/` or `models/` folder there is
  reported on every file, with the layout in the message, and so is a file directly in `src/main/`
  other than the composition root and `index.ts` (`src/main/helpers.ts`). Inside
  `features/<name>/` only `domain/`, `adapters/` and the public `index.ts` are allowed
  (`features/auth/services/` and `features/auth/helpers.ts` are reported). Put the code in the
  feature that uses it (`domain/` for pure logic, `adapters/` for I/O) or in `shared/` when several
  features need it. A React project may also have UI folders directly under `src/main/` (`ui/`,
  `components/`, `pages/`, `app/`, `routes/`, `views/`, `layouts/`, `screens/`, `hooks/`, `styles/`,
  `assets/`) and `App.tsx`, and a `ui/` folder in a feature; any other folder, such as
  `src/main/services/`, is reported there too. The rule reports on line 1,
  so it is not strict: editing a legacy file in `utils/` does not fail, only a new file does.
- Objects are constructed only in the composition root. Dependencies are passed explicitly. No
  module-level `let`, and no module-level collection or object that the module mutates
  (`nitpicker/no-module-level-mutable-state`: `const cache = new Map()` with `cache.set(...)`,
  `const state = { count: 0 }` with `state.count++` or `state.items.push(x)`, a `Set`, `WeakMap`,
  typed array or `Object.create(null)` that is written to, an array with `push`, and
  `Object.assign`, `Object.defineProperty` or `Reflect.set` onto it, also through a `const`
  alias such as `const registry = cache`). An exported `Map`, `Set`, `WeakMap`, `WeakSet`, typed
  array or `Object.create(null)` is reported where it is declared, since another module can
  mutate it, unless it is annotated with a readonly type (`ReadonlySet<T>`, `ReadonlyMap<K, V>`,
  `readonly number[]`). Build a lookup table inside a
  function and return it; create a store in the composition root and pass it in. `domain/` is
  covered by `functional/prefer-immutable-types` instead.
- The composition root is `src/main/composition-root.ts`, `src/main/main.ts`,
  `src/main/server.ts`, `src/main.ts`, `src/server.ts` or `src/composition-root.ts` (any
  TypeScript or JavaScript extension) or a file under `src/main/composition-root/`. A `server.ts`
  or `main.ts` in another folder is not a root. The `compositionRootPattern` option
  adds roots to this list.
- `nitpicker/no-managed-resource-construction-outside-composition-roots` reports `new` on names
  that end in `Service`, `Client`, `Pool`, `Cache`, `Store`, `Scheduler`, `Transport`, `Adapter`,
  `Server`, `Worker`, `Connection`, `Queue`, `Producer`, `Consumer`, `Broker`, `Gateway`, `Database`
  or `Emitter`, on `Redis`, `Stripe`, `Octokit`, `OpenAI`, `Socket` and `WebSocket`, and the factory
  calls `createServer`, `createClient`, `createPool`, `createConnection`, `createWorker` and
  `axios.create`. Value types (`Map`, `Set`, `URL`, `Date`, `Error`, `RegExp`, `*Request`,
  `*Response`, `*Command`) are fine anywhere.
- `nitpicker/no-service-locator` (type-aware): a dependency is received as a parameter, not looked
  up in a dependency-injection container. It reports a call that resolves a service from the
  container APIs it models, wherever the code is not composition: inversify `Container`
  (`get`, `getAsync`, `getAll`, `getAllAsync`, `getNamed`, `getTagged` and their async forms,
  `resolve`; `@inversifyjs/container` as well), tsyringe `container.resolve` and `resolveAll`,
  typedi `Container.get` and `getMany` (also `Container.of(id)`), awilix `container.resolve` and
  `container.cradle`, and NestJS `ModuleRef` (`get`, `resolve`, `create`) and the application
  context (`app.get`, `app.resolve`). The receiver is resolved by the type checker, so it counts
  however it is reached (`import { container as c }`, a re-export, a `new Container()` from the
  library, a parameter, `this.moduleRef`, `container.createChildContainer()`), and a method that is
  only named `get` or `resolve` on another type is not evidence. A lookup method read as a value
  counts too (`items.map(container.resolve)`, `container.resolve.bind(container)`,
  `const { resolve } = container`, `({ resolve } = container)`, `const { cradle } = c`,
  `c['cradle']`). A project helper that looks up the token it is given (`resolve<T>(token)` calling
  `container.resolve(token)`, or one that hands out the lookup method itself) counts as a lookup at
  its call sites, through helpers of helpers that pass their own parameter on, imports, namespace
  imports, re-exports and aliases (`const p = plain`); the helper may be a function, an arrow (also
  `export default`, `as` or `satisfies`, or wrapped in a call such as `once((token) => ...)`), a
  method, a class property arrow (also `static`), a getter, a constructor (`new Svc(token)`) or a
  default parameter value, and it counts when passed as a callback (`items.map(plain)`,
  `plain.call(...)`). A helper that looks up a fixed token (`() => container.resolve(Mailer)`) is
  reported once, at its own lookup, and its callers are not, so one exception on that file covers
  it. A call through an interface method is not followed, since an interface has no body. The
  message names the library as the project imports it (`inversify` when it re-exports
  `@inversifyjs/container`) and the call, and for a helper also the helper and the project-relative
  file that does the lookup. Allowed: lookups in the composition root (the files above; any
  `main`, `server`, `composition-root`, `app`, `application`, `cli`, `bootstrap`, `worker`, `manage`
  and the other entry names the Python preset accepts, outside `domain/`; the
  `compositionRootPattern` option; and `layout.entryPoints`, which is where a Nest `main.ts` calls
  `app.get`), and inside a registration factory: `useFactory` of a provider, inversify's
  `toDynamicValue`, `toFactory`, `toProvider` and `onActivation`, typedi's `factory` given to
  `Container.set({ id, factory })` or `@Service({ factory })`, and awilix's `asFunction`, `asClass`
  and `asValue` (each resolved to its library's declarations, so a same-named method of another
  library, or a `factory` property elsewhere, is not one), also when the factory is wrapped in a
  call (`instanceCachingFactory((c) => ...)`) or passed by name (`toDynamicValue(build)`,
  `asClass(Orders)`). A helper declared in a root file counts when it is called from outside the
  roots; the lookup inside the root stays allowed. Tests are not checked, and a program where no
  file imports one of these libraries is skipped without building the call summaries. It needs the
  container library installed, since the types come from it, and models the libraries above only:
  a project container of its own is not found. An invalid `compositionRootPattern` fails with an
  error that names the option. A Nest provider that must resolve a provider by a token known only
  at run time (`this.moduleRef.resolve(token)` in `onModuleInit`, a request-scoped strategy) is a
  real exception: add `{"rule":"nitpicker/no-service-locator","paths":["src/payments/strategies.ts"],"reason":"..."}`
  to `exceptions` in `nitpicker.config.json` for that file, as the finding's message says.
- `nitpicker/no-process-access-outside-composition-root`: environment variables (`process.env`,
  `import.meta.env`, `Deno.env`) are read only in the composition root, parsed once with a zod
  schema, and the typed config is passed down. `process.exit` is called only in the composition
  root or a main guard. However `process` is reached, it counts: `import { env }` from
  `node:process`, a namespace, default or `require` import, `const { env, exit } = process`, a
  `const` alias and `globalThis.process`. Entry scripts listed in `layout.entryPoints` and config
  files (`*.config.*`, `.*rc.*`) are exempt. In a React project `import.meta.env` is allowed
  anywhere: Vite replaces it with public build-time values (`import.meta.env.DEV`, `VITE_*`). So
  are `process.env.NODE_ENV`, `process.env.NEXT_PUBLIC_*`, `process.env.EXPO_PUBLIC_*` and
  `process.env.REACT_APP_*` written exactly that way, which Next.js, Expo and Create React App
  replace the same way.
- `shared-used-by-one-feature` (the `coupling` check): `src/main/shared/` holds code that two or
  more features use. A production module there that exactly one feature reaches, directly or through
  other shared modules only, and that nothing else imports, is reported on the module with the
  feature's folder to move it to. Type-only imports count as use, and so does an import through a
  workspace package linked into `node_modules`. The composition root, any other production module
  (`main.ts`, a module of another source root) and a second feature each count as another consumer;
  test files, stories (`*.stories.*`, `*.story.*`) and files under `__mocks__/`, `__fixtures__/`,
  `fixtures/` and `stories/` do not, and are not reported. A module no feature reaches is left to
  the dead-code check. The feature and shared folders are the ones the architecture rules use
  (`architecture/strict-layout.mjs`), under every `layout.sourceRoots` entry; a feature of another
  source root is another feature. A module that is shared on purpose before a second feature uses it
  needs an exception for this rule in `nitpicker.config.json`.
- `foreign-feature-persistence` (the `structure` check): a production module of one feature that
  imports another feature's persistence, directly or through a name its `index.ts` re-exports
  (re-exports are followed by name, so `import { bill } from '../billing'` passes while
  `import { invoices } from '../billing'` fails when `invoices` comes from its repository). A
  module is an entity when it imports `Entity` from TypeORM or MikroORM, `Table` from
  sequelize-typescript, `Model` from Sequelize, `Schema` or `model` from Mongoose, or a Drizzle
  table builder (`pgTable`, `mysqlTable`, `sqliteTable`); it is data access when it imports a
  database client or ORM at run time (`pg`, `mysql2`, `mongodb`, `ioredis`, `knex`, `kysely`,
  `@prisma/client`, `drizzle-orm`, TypeORM's `DataSource` or `Repository`, `@nestjs/typeorm`,
  DynamoDB and Firestore clients, ...). Mapping-only imports (`Column` without `Entity`), a
  TypeORM `@ViewEntity` read model and `import type` do not count. The finding is on the importing
  module, identity `foreign-persistence:<persistent module>`; the exception may name the importer
  or the persistent module. The feature folders are `layout.featureRoots` (default
  `<sourceRoot>/main/features`).
- `layout.sharedRoots` and `layout.featureRoots` (folder globs, default `<sourceRoot>/main/shared` and
- `stability-direction` (the `coupling` check) measures each feature folder as one unit: `index.ts`
  is its face, edges between the face and the feature's own folders do not count, an edge between
  two folders of one feature (`domain` to `adapters`) compares those folders, and an edge between
  two features, or between a feature and `main/shared/`, compares the whole units. Outside the
  features `main/shared/` is one unit and each other folder under `main/` is one, and the
  composition root and `main.ts` are wiring that is never reported. See
  [Stability direction](../usage.md#stability-direction).
- `nitpicker/no-branch-in-composition-root`: the composition root (`composition-root.ts`, `main.ts`,
  `server.ts`, plus the `compositionRootPattern` option shared with
  `no-managed-resource-construction-outside-composition-roots`) only wires features with named
  functions that pass things in. It reports `if`, `?:`, `switch`, `??`, optional chaining (`?.`),
  loops, and `||` with a literal, object, array or call on its right (`env['PORT'] || 3000`, the
  `??` swap), inside functions and at module level, except the main guard (an `if` whose condition
  uses `import.meta` or `require.main`, as for `no-process-globals-outside-main-guard`) and
  branches in its condition, and a guard that only throws (an `if` with no `else` whose body is a
  single `throw`): `if (container === null) { throw new Error('#root is missing'); }` before
  `createRoot(container)` is how the entry file checks its mount node. `&&` and `||` between plain values, and `try`/`catch`, are not
  reported. A lookup or missing-value
  check moves into the feature's `adapters/` (or `domain/`). Existing branches are baselined, and a
  function that gains one fails; a branch that belongs in the root needs an exception for this
  rule in `nitpicker.config.json`.
