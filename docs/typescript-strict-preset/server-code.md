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
