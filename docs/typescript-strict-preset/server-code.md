# Server code

Part of the [TypeScript strict preset guide](../typescript-strict-preset.md).

The server scope turns on when a server framework (`@nestjs/core`, `express`, `fastify`, `hono`,
`koa`, `@hapi/hapi`, `restify`, `@adonisjs/core`, `@feathersjs/feathers`, `@apollo/server`,
`graphql-yoga`, `elysia` or `h3`) is in `dependencies` or `peerDependencies` of the head
checkout; a dev dependency alone (a test server in a library) does not count. Full-stack
frameworks (Next.js, SvelteKit, Remix) do not turn it on, since most of their code runs in the
browser too. It covers production source, not tests, test support or stories, and in the
JavaScript preset too. When the project also has a browser framework (React, Vue, Svelte, Solid,
Angular, Next.js), `*.tsx` and `*.jsx` files are left out, since component code runs in the
user's browser.

- `nitpicker/no-local-time-zone`: a date computed or formatted in the server's local time zone,
  whose result changes with the host's `TZ`. It reports the local `Date` methods (`getFullYear`,
  `getYear`, `getMonth`, `getDate`, `getDay`, `getHours`, `getMinutes`, `getTimezoneOffset` and
  the matching setters; seconds and milliseconds do not depend on the zone), `toString`,
  `toDateString` and `toTimeString`, `toLocaleDateString`, `toLocaleTimeString`,
  `toLocaleString` and `Intl.DateTimeFormat` without a `timeZone` option,
  `Intl.DateTimeFormat().resolvedOptions().timeZone` (also destructured),
  `new Date(year, month, ...)`, and `new Date(text)` or `Date.parse(text)` of a literal date-time
  with neither an offset nor a zone name such as `GMT` (also a template that ends in a time,
  `` `${day}T00:00:00` ``). The `Date` methods are recognized from the type checker: the called
  method must be the one the built-in `Date` declares, so `Readonly<Date>` and subclasses count
  and `TZDate` from `@date-fns/tz`, which overrides them, passes. In libraries: luxon
  `DateTime.now`, `local`, `fromJSDate`, `fromISO`, `fromFormat`, `fromSQL`, `fromMillis`,
  `fromSeconds`, `fromObject` and `fromRFC2822` without a `zone` (or `setZone`) option; date-fns
  calendar functions (`format`, `parseISO`, `startOfDay`, `addDays`, `add`, `isSameDay`,
  `differenceInCalendarDays` and the rest of the calendar family) without `{ in: tz(...) }`,
  unless the date comes from `@date-fns/tz`, `@date-fns/utc` or `date-fns-tz`; and `dayjs()`,
  `dayjs.unix()`, `moment()` and `moment.unix()` unless `.utc()`, `.tz(zone)` or `.utcOffset()`
  comes first. A chained call that only reads the instant (`toMillis`, `valueOf`, `toISOString`,
  `.isValid`, `isBefore(other)`, `diff(other, 'hour')`) passes, and so do luxon options passed
  as a variable; `{ zone: 'local' }` and `.setZone('system')` count as local. A process-wide
  default (luxon `Settings.defaultZone`, `dayjs.tz.setDefault`) does not make a call pass: it is
  the same hidden global as `TZ`, and the zone belongs at the call. The allowed forms are the UTC
  methods (`getUTCFullYear`), `toISOString()`, `Date.UTC`, and an explicit zone: `{ timeZone }`,
  `{ zone }`, `{ in: tz(zone) }`, `.tz(zone)`. A command-line tool that prints local time on
  purpose needs an exception for the rule in `nitpicker.config.json`. An exception for it is
  skipped while the scope is off.
- `nitpicker/no-uncoerced-request-input`: a number, bigint, boolean or date field read from the
  query string, path parameters, headers or a multipart form without converting the text. These
  values always arrive as strings, so a validator that expects a number rejects every request that
  sets the field, and a cast to boolean turns `"false"` into true. It reads the inputs bound by
  NestJS `@Query()`, `@Param()` and `@Headers()` (from `@nestjs/common`), `@Body()` in a handler
  with `FileInterceptor`, `FilesInterceptor`, `AnyFilesInterceptor`, `FileFieldsInterceptor` or an
  `@UploadedFile(s)` parameter, a zod or valibot schema that parses `req.query`, `req.params` or
  `req.headers` (also `request`, `ctx`, `ctx.request` and Hono's `c.req.query()`, `param()` and
  `header()`), a Hono `zValidator` or `vValidator` for `query`, `param`, `header` or `form`, and
  a Fastify route `schema` whose `querystring`, `params` or `headers` is a zod or valibot schema
  (a JSON schema passes, since Fastify's Ajv converts by default). It reports a class-validator
  DTO field with `@IsInt`, `@IsNumber`, `@IsPositive`, `@IsNegative`, `@Min`, `@Max`,
  `@IsDivisibleBy`, `@IsBoolean`, `@IsDate`, `@MinDate` or `@MaxDate` and no `@Type` or
  `@Transform`; a zod `number`, `int`, `int32`, `uint32`, `float32`, `float64`, `int64`,
  `uint64`, `bigint`, `boolean`, `date` or non-string `literal` field (through `optional`,
  `nullable`, `array`, chained checks and constants), and the valibot `number`, `bigint`,
  `boolean` and `date` fields (through `pipe` and the wrappers); `z.coerce.boolean()` and
  `@Type(() => Boolean)`; and a single NestJS parameter (`@Query('limit') limit: number`) or a
  type literal parameter typed `number`, `bigint`, `boolean` or `Date` without a pipe that
  converts it. DTOs built with `createZodDto`, `PartialType`, `PickType`, `OmitType`,
  `IntersectionType` or `extends` are followed, in other files too when type information is
  available (otherwise only in the same file). The allowed forms are a conversion at the
  declaration: `z.coerce.number()`, `z.coerce.date()`, `z.stringbool()` or
  `z.enum(['true', 'false']).transform((value) => value === 'true')`,
  `v.pipe(v.string(), v.toNumber(), v.number())`, `@Type(() => Number)`, `@Type(() => Date)`,
  `@Transform(({ value }) => value === 'true')`, and `ParseIntPipe`, `ParseFloatPipe`,
  `ParseBoolPipe` or `ParseDatePipe` on a single parameter. A property decorator from another
  package and a pipe the rule does not know (other than `DefaultValuePipe` and `ParseUUIDPipe`)
  count as converting. A global `ValidationPipe` with `transform` or `enableImplicitConversion`
  does not make a field pass: it is not visible at the declaration, and implicit conversion turns
  `"false"` into true.
