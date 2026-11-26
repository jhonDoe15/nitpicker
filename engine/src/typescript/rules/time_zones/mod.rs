//! `no-local-time-zone`: dates computed or formatted in the server's local time zone, through `Date`, `Intl`,
//! luxon, date-fns, dayjs or moment. Needs the compiler to tell the library's `Date` from any other type.
mod bindings;
mod date_calls;
mod library_calls;
pub mod no_local_time_zone;
mod tables;

use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

pub struct Env<'c, 'a, 's> {
    pub scopes: &'c Scopes<'a, 's>,
    pub types: &'c RefCell<Types>,
}

impl<'s> Env<'_, '_, 's> {
    /// Whether the name an identifier stands for is declared in the file (`variableOf(...)?.defs.length > 0`).
    pub fn has_variable(&self, identifier: Node<'s>) -> bool {
        identifier.name().is_some_and(|name| self.scopes.variable_by_name(&name, identifier.start()).is_some())
    }
}

pub enum Problem {
    LocalDateMethod(String, &'static str),
    LocalOffset(String),
    LocalString(String),
    LocaleWithoutZone(String),
    IntlWithoutZone,
    ServerZoneName,
    LocalConstructor,
    LocalParse,
    LuxonLocal(String),
    DateFnsLocal(String),
    DayjsLocal(String),
}

const EFFECT: &str = "the result changes with the server's `TZ`";

impl Problem {
    pub fn message(&self) -> String {
        let (template, name, utc) = match self {
            Problem::LocalDateMethod(name, utc) => (
                "`{name}()` uses the server's local time zone, so {effect}. Use `{utc}()`, or compute in an \
                    explicit zone (luxon `DateTime.fromJSDate(date, { zone })`).",
                name.as_str(),
                *utc,
            ),
            Problem::LocalOffset(name) => (
                "`{name}()` is the offset of the server's local time zone, so {effect}. Take the offset of an \
                    explicit zone (luxon `DateTime.now().setZone(zone).offset`).",
                name.as_str(),
                "",
            ),
            Problem::LocalString(name) => (
                "`{name}()` prints the date in the server's local time zone, so {effect}. Use `toISOString()`, \
                    or `Intl.DateTimeFormat` with a `timeZone`.",
                name.as_str(),
                "",
            ),
            Problem::LocaleWithoutZone(name) => (
                "`{name}` without a `timeZone` option formats in the server's local time zone, so {effect}. Pass \
                    the zone: `date.{name}('en-US', { timeZone: 'UTC' })`, or the user's zone.",
                name.as_str(),
                "",
            ),
            Problem::IntlWithoutZone => (
                "`Intl.DateTimeFormat` without a `timeZone` option formats in the server's local time zone, so \
                    {effect}. Pass the zone: `new Intl.DateTimeFormat('en-US', { timeZone: 'UTC' })`, or the user's \
                    zone.",
                "",
                "",
            ),
            Problem::ServerZoneName => (
                "`Intl.DateTimeFormat().resolvedOptions().timeZone` is the server's own zone, so {effect}. Use a \
                    configured zone name or `'UTC'`.",
                "",
                "",
            ),
            Problem::LocalConstructor => (
                "`new Date(year, month, ...)` builds the date in the server's local time zone, so {effect}. Use \
                    `new Date(Date.UTC(year, month, ...))`.",
                "",
                "",
            ),
            Problem::LocalParse => (
                "This date-time text has no offset, so it is read in the server's local time zone and {effect}. \
                    Add `Z` or an offset (`'2024-01-01T10:00:00Z'`), or parse it in an explicit zone (luxon \
                    `DateTime.fromISO(text, { zone })`).",
                "",
                "",
            ),
            Problem::LuxonLocal(name) => (
                "luxon `{name}` without a `zone` option uses the server's local time zone, so {effect}. Pass `{ \
                    zone: 'utc' }` (or the user's zone), chain `.setZone(zone)`, or use `DateTime.utc()`.",
                name.as_str(),
                "",
            ),
            Problem::DateFnsLocal(name) => (
                "date-fns `{name}` works in the server's local time zone, so {effect}. Pass the zone with `{ in: \
                    tz('UTC') }` from `@date-fns/tz`, or use `formatInTimeZone` from `date-fns-tz`.",
                name.as_str(),
                "",
            ),
            Problem::DayjsLocal(name) => (
                "`{name}` builds a date in the server's local time zone, so {effect}. Chain `.utc()` or \
                    `.tz(zone)` before calendar methods like `format`, `startOf` or `add`, or start from \
                    `.utc(...)`.",
                name.as_str(),
                "",
            ),
        };
        template.replace("{effect}", EFFECT).replace("{name}", name).replace("{utc}", utc)
    }
}
