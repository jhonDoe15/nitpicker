# Inside `adapters/`

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

- Throw only for unexpected failures, using `Error` subclasses that preserve `cause`. Convert
  library exceptions into domain results at the boundary. `nitpicker/preserve-error-cause` checks
  `Error` and every class whose name ends in `Error`: one thrown in a `catch` is reported unless
  it passes `{ cause: error }` as an option or the caught value itself as an argument (also inside
  an array, as in `new AggregateError([error, closeError], message)`, or through a
  `const cause = error`), whether or not it mentions the caught value (`throw new AppError('range')` and
  `new AppError(String(error))` are both reported).
- `nitpicker/no-silent-catch`: a `catch` must hand the failure on. It passes when it uses the
  caught value (rethrow an `Error` subclass with `{ cause: error }`, log it, or return it in a
  result) or when it returns a failure result object (`catch { return { kind: 'malformed-json' } }`).
  Carry the caught value only where something reads it; a field added just so the binding is read
  is slop. A `catch` that falls through, or returns a non-object such as `undefined` or `[]`, is
  reported. A deliberately dropped error needs an exception in the config file.
- `nitpicker/no-dev-dependency-in-production` (all production code): a value import (`import`,
  `export ... from`, `import()`, `require`) of a package that package.json lists only under
  `devDependencies` is reported. Move the package to `dependencies` (zod included). Type-only imports
  are not reported. An app a bundler builds (a bundler config or `build` script, and no `main`,
  `module`, `exports` or `bin` in package.json) and test support files (`setupTests.*`,
  `test-utils`, `testing/`, `test-support/`, `__mocks__/`, stories) are skipped. The nearest package.json that lists
  dependencies is used; one that is not a JSON object is reported. Unlisted packages and unused dependencies are reported by the
  `dead-code` analyzer, see [Dependency and repository checks](../usage.md#dependency-and-repository-checks).
- `nitpicker/no-unvalidated-schema-field` (all production code): a schema field that accepts any
  value, and an object schema that keeps unknown keys, in every validation library the preset
  knows. A schema that only checks the shape hands the field on unchecked, and `domain/` then
  re-validates it by hand. Validate the field in the schema (`z.string().trim().min(1)`,
  `z.email()`). The library is known from the import or `require`: a namespace or default import,
  a named (also renamed) import and a destructured `require` all count, and the message names that
  library's own allowed form. For zod: no
  `z.unknown()` or `z.any()` (also with `.optional()`, `.nullable()`, `.default()` and similar
  wrappers, `z.optional(...)`, `z.nullable(...)`, `z.nullish(...)` and `z.readonly(...)`) as a field
  of `z.object`, `z.strictObject` or `z.looseObject`, or of a shape passed to `.extend`,
  `.safeExtend` or `.augment`. `z.array(z.unknown())` or `z.unknown()` as a whole schema, and
  `z.unknown().refine(...)`/`.pipe(...)`, are not reported. The check looks through `z.record`,
  `z.array`, `z.set`, `z.map` and `z.tuple` elements and `.array()` (a `z.record` of
  `z.unknown()` and `z.unknown().array()` as a field are reported) and through a same-file `const`
  (`const anything = z.any()`). `z.custom<T>()` without a check function is a cast, and
  `z.looseObject()`, `.loose()`, `.passthrough()` and `.catchall(z.unknown())` let unknown keys
  through: use `z.object({...})` or `z.strictObject({...})`. The other libraries, with the same
  kind of wrappers, containers and aliases (field forms first, then the object forms):
  - valibot: `v.unknown()`, `v.any()` in `v.object`, `v.strictObject`, `v.looseObject` and
    `v.objectWithRest`; `v.looseObject(...)` and `v.objectWithRest(..., v.unknown())`.
  - yup: `mixed()` without a check argument, `.test(...)`, `.oneOf(...)` or another check, in
    `object({...})` or `.shape({...})`.
  - joi: `Joi.any()` without `.valid(...)`, `.custom(...)` or another check, in `Joi.object({...})`,
    `.keys(...)` or `.append(...)`; `.unknown()`, `.unknown(true)`, `.pattern(key, Joi.any())` and
    `allowUnknown: true` in `.prefs`, `.preferences` or `.options`.
  - typebox: `Type.Unknown()`, `Type.Any()` in `Type.Object`; `additionalProperties: true` (or an
    unchecked schema) on `Type.Object`.
  - io-ts: `t.unknown`, `t.any` in `t.type`, `t.strict` and `t.partial`.
  - superstruct: `unknown()`, `any()` in `object`, `type` and `partial`.
  - runtypes: `Unknown` in `Object`, `Record` (with an object) and `Partial`.
  - valita: `v.unknown()` in `v.object`; `.rest(v.unknown())`.
  - effect: `Schema.Unknown`, `Schema.Any` in `Schema.Struct` (also as the `value` of
    `Schema.Record`); a `Schema.Struct` index signature (a `Schema.Record` or a plain
    `{ key, value }`) whose value is `Schema.Unknown` or `Schema.Any`.
  - arktype: `"unknown"`, `"any"` and their arrays as a property of `type({...})`, nested objects
    included (tuple expressions such as `['string', '=', 'any']` are left alone).
  - ajv: a property schema `{}` or `true` in `properties`, and `additionalProperties: true` or `{}`
    or a `patternProperties` entry of `{}` or `true`, anywhere in the schema (through `items`,
    `allOf`, `anyOf`, `oneOf`, `prefixItems`, `$defs` and `definitions`). The schema is a literal,
    or a same-file `const` (also with `as const` or `satisfies`), passed to `compile`,
    `compileAsync`, `compileParser`, `validate` or `addSchema` of a `new Ajv()`, or of an imported
    or parameter receiver whose name contains `ajv`.
  - class-validator: a class property or `accessor` whose only class-validator decorators are `@Allow()`,
    `@IsOptional()`, `@IsDefined()` or `@ValidateIf()`. class-transformer and `@nestjs/swagger`
    decorators are ignored; any other decorator may validate, so the property is left alone.
  - typia: a property typed `unknown` or `any` (also in an array, a union or a `Record`, `Map`,
    `Set` or `Partial`) in the type argument of a typia call whose name starts with `assert`, `is`,
    `equals` or `validate` (or `create` and one of them), `typia.json` and `typia.http` included,
    through same-file interfaces and type aliases, and through arrays, unions and `Record` values
    of them (`typia.assert<Item[]>`).

  An object form is reported only when it is an explicit choice to keep unknown keys and the
  library also offers an object that drops or rejects them. yup `object()`, io-ts `t.type`,
  superstruct `type`, arktype and `typia.assert` keep unknown keys by default, so reporting that
  default would report almost every schema; prefer the stripping or strict form the library offers
  (`.noUnknown()` or `stripUnknown`, `t.exact`/`t.strict`, `object`/`mask`, `"+": "delete"`,
  `typia.assertEquals`). class-validator leaves unknown keys to the `whitelist` options of the
  validation pipe, which the rule cannot see.

- `nitpicker/no-eager-relation` (all production code): a relation mapped to load on every query of
  the entity. TypeORM and MikroORM `eager: true` on `@ManyToOne`, `@OneToOne`, `@OneToMany` and
  `@ManyToMany` (also imported by namespace or under another name, and through a same-file `const`
  or spread of the options), on an `EntitySchema` relation, and MikroORM's `defineEntity`
  `.eager()`; a Sequelize `defaultScope` that `include`s associations (`Model.init`,
  `sequelize.define`, `addScope('defaultScope', ...)` and sequelize-typescript's `@DefaultScope`).
  Load the relation on the queries that need it: TypeORM `relations` or `leftJoinAndSelect`,
  MikroORM `populate`, a Sequelize `include` on the query or a named scope. A small lookup
  relation that every read needs is the exception. Port of the Java and Kotlin `JpaLazyFetching`.
- `nitpicker/no-many-to-many-cascade-remove` (all production code): a cascade that removes on a
  many-to-many relation (TypeORM `cascade: true`, `'remove'` or `'soft-remove'`; MikroORM
  `Cascade.ALL` or `Cascade.REMOVE`, also through `defineEntity` `.cascade(...)`) deletes the
  related rows that other owners still share. Cascade only `['insert', 'update']` (TypeORM) or
  `[Cascade.PERSIST]` (MikroORM); the join rows already go with the owner. Sequelize is not
  checked: `onDelete: 'CASCADE'` on a `belongsToMany` only removes rows of the through table, which
  is the allowed form. Port of `JpaManyToManyCascade`.
- Untrusted input is parsed once, at the boundary, with a schema library (zod by default). Hand-written
  type guards for external data are not allowed (`nitpicker/no-handwritten-boundary-guard`, in `adapters/`, `shared/` and
  the other layers outside `domain/`): a predicate whose parameter is `unknown`, `any`, `object`,
  `{}` or `Record<string, unknown>`, an `unknown` value narrowed inline with `typeof x ===
'object'` or `'key' in x`, and an overload whose implementation returns `unknown` or `any`. A
  predicate over a union (`(result): result is Ok => result.kind === 'ok'`) is fine, and so is
  `error instanceof Error` (or another class named `...Error` or `...Exception`, such as
  `z.ZodError`) on a caught value, including the checks it narrows: later in the same `&&` chain,
  inside the `if` or `?:` it guards, or after an earlier `if (!(error instanceof Error))` exit
  (`error instanceof Error && 'code' in error`). `instanceof Object` or any other class does not
  count as a guard.
  `JSON.parse(JSON.stringify(value))` as a copy is reported: use `structuredClone(value)`.

## Libraries follow the project

The rules keep their reason (validate at the boundary, keep the caught error on the log call) and
only the library follows the project. Nitpicker reads `dependencies`, `peerDependencies`,
`optionalDependencies` and `devDependencies` (presence, not a vote over files).

- **Where it reads.** The head policy carries the libraries of the head checkout:
  `libraries: { validation, logger, packages }`, where `validation` and `logger` come from the root
  `package.json` and `packages` maps each project-relative directory with a `package.json` (`.` for
  the root; `node_modules` and excluded folders are skipped) to the libraries it declares. A base
  run with its own `nitpicker.config.json` still takes the head's libraries, like the other facts of
  the head checkout, so base and head are checked against the same libraries, and the policy hash
  and cache key include them. The rules that report per file (the boundary guard, `unknown` in
  `domain/`, catch logging) pick, from `packages`, the entry of the directory nearest the file and
  every one above it up to the project root, so a monorepo package that declares valibot is
  checked against valibot; they read no `package.json` while linting. Within the list
  `dependencies` come before `devDependencies`, nearest package first; the first entry names the
  library in messages. The static `as`, `any` and JSDoc-cast messages read the root list only, so
  they name the root's library.
- **Validation library.** Recognised: zod, valibot, yup, joi (and `@hapi/joi`), io-ts, arktype,
  class-validator (with class-transformer), ajv, typebox, superstruct, runtypes, typia, effect
  (`effect`, `@effect/schema`) and valita. With none found the preset names zod.
  `nitpicker/no-handwritten-boundary-guard` accepts a parse of any detected library, matched by
  receiver and method. Calls on a schema built from the library (a value whose chain starts at an
  import or `require` of it) count for the library's parse methods: zod `parse`/`safeParse` and
  the async forms, yup `validate`/`validateSync`/`isValid` and the `At` forms, joi `validate`/
  `validateAsync`, io-ts `decode`, arktype `assert` and calling the schema, ajv `validate` and
  calling a function from `compile`, typebox `Decode`/`Parse` on a compiled type, runtypes `check`/
  `parse`/`assert`/`guard`/`validate`, valita `parse`/`try`. Functions of the library namespace or
  named import count too: valibot `parse`/`safeParse`/`assert`/`is` and `parser(schema)(data)`,
  `Joi.attempt`/`Joi.assert`, typebox `Value.Parse`/`Decode`/`Assert`, superstruct `create`/
  `assert`/`validate`/`mask`/`is`, typia `assert`/`is`/`validate`, effect
  `Schema.decodeUnknownSync(schema)(data)` and the other `decode` forms, class-validator
  `validate`/`validateSync`/`validateOrReject` (with `plainToInstance` in between). The forms
  `const { parse } = schema`, `schema['parse']`, `schema.parse.bind(schema)`, `pipe(data, codec.decode)`,
  casts (`as`, `!`) and `await` around the `JSON.parse` call are followed.
  A receiver the file cannot resolve (imported from your own module, a parameter, `this.schema`,
  a class field) counts for those same methods when type information shows a type declared by the
  library, or, without it, when its text matches `schema`, `codec`, `validat`, `type`, `ajv`,
  `struct` or `parser`. Other calls with the same names (`console.assert`, `form.validate`,
  `Value.Check`, yup `cast`) do not count. The guard and `unknown` messages are grammatical
  per library ("an io-ts codec", "an ajv schema") and the guard messages say how to add an
  exception. `nitpicker/no-unvalidated-schema-field` covers the same libraries, each known from its
  import.
- **Logger.** `nitpicker/structured-catch-logging` is never turned off; it checks the shape each
  detected logger reads. pino, nestjs-pino, pino-http and bunyan take the caught value as
  `logger.<level>({ err: error, ...context }, message)`. winston, log4js, loglevel, consola, tslog,
  roarr and signale take the caught value itself, passed as an argument or as a field of an object
  argument (`logger.error('message', error)`, `logger.error('message', { error })`), not its
  `.message` or a template string. With several loggers any of their shapes passes; with none
  found the `err` shape applies. `nitpicker/no-production-console` and `no-silent-catch` apply to
  every logger.
