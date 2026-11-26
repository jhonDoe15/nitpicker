//! `time-zone-tables.mts`: the names and the texts the time-zone rules look for.
use regex::Regex;
use std::sync::LazyLock;

pub const LOCAL_DATE_METHODS: [(&str, &str); 13] = [
    ("getFullYear", "getUTCFullYear"),
    ("getYear", "getUTCFullYear"),
    ("getMonth", "getUTCMonth"),
    ("getDate", "getUTCDate"),
    ("getDay", "getUTCDay"),
    ("getHours", "getUTCHours"),
    ("getMinutes", "getUTCMinutes"),
    ("setFullYear", "setUTCFullYear"),
    ("setYear", "setUTCFullYear"),
    ("setMonth", "setUTCMonth"),
    ("setDate", "setUTCDate"),
    ("setHours", "setUTCHours"),
    ("setMinutes", "setUTCMinutes"),
];
pub const OFFSET_METHOD: &str = "getTimezoneOffset";
pub const LOCALE_METHODS: [&str; 3] = ["toLocaleDateString", "toLocaleTimeString", "toLocaleString"];
pub const LOCAL_STRING_METHODS: [&str; 3] = ["toString", "toDateString", "toTimeString"];
pub const ZONED_DATE_TYPES: [&str; 4] = ["TZDate", "TZDateMini", "UTCDate", "UTCDateMini"];

pub const LUXON_PACKAGES: [&str; 1] = ["luxon"];
pub const DATE_FNS_PACKAGES: [&str; 1] = ["date-fns"];
pub const ZONE_PACKAGES: [&str; 3] = ["@date-fns/tz", "@date-fns/utc", "date-fns-tz"];
pub const DAYJS_PACKAGES: [&str; 3] = ["dayjs", "moment", "moment-timezone"];

pub const LUXON_FACTORIES: [&str; 10] =
    ["now", "local", "fromJSDate", "fromISO", "fromFormat", "fromSQL", "fromMillis", "fromSeconds", "fromObject", "fromRFC2822"];
pub const LUXON_ZONE_KEYS: [&str; 2] = ["zone", "setZone"];
pub const LOCAL_ZONE_NAMES: [&str; 2] = ["local", "system"];
pub const DAYJS_FACTORIES: [&str; 2] = ["", "unix"];
pub const CHAIN_READS: [&str; 4] = ["isValid", "ts", "offset", "zoneName"];
pub const SUB_DAY_UNITS: [&str; 12] =
    ["ms", "millisecond", "milliseconds", "s", "second", "seconds", "m", "minute", "minutes", "h", "hour", "hours"];

pub fn luxon_option_position(factory: &str) -> Option<usize> {
    match factory {
        "fromJSDate" | "fromISO" | "fromSQL" | "fromMillis" | "fromSeconds" | "fromObject" | "fromRFC2822" => Some(1),
        "fromFormat" => Some(2),
        _ => None,
    }
}

#[derive(Clone, Copy, PartialEq)]
pub enum Library {
    Luxon,
    Dayjs,
}

impl Library {
    pub fn zone_setters(self) -> &'static [&'static str] {
        match self {
            Library::Luxon => &["setZone", "toUTC"],
            Library::Dayjs => &["utc", "tz", "utcOffset"],
        }
    }

    pub fn instants(self) -> &'static [&'static str] {
        match self {
            Library::Luxon => &["toMillis", "toSeconds", "toUnixInteger", "valueOf", "toJSDate", "isValid"],
            Library::Dayjs => &["valueOf", "unix", "toISOString", "toDate", "toJSON", "isValid"],
        }
    }

    pub fn comparisons(self) -> &'static [&'static str] {
        match self {
            Library::Luxon => &["diff", "equals", "toRelative"],
            Library::Dayjs => &["isBefore", "isAfter", "isSame", "diff"],
        }
    }
}

const DAY_NAMES: &str = "Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday";
const CALENDAR_UNITS: &str = "Day|Week|ISOWeek|Month|Quarter|Year|ISOWeekYear|WeekYear|Decade|Hour";
const WORD: &str = "[A-Za-z0-9_]";

pub static DATE_FNS_CALENDAR: LazyLock<Regex> = LazyLock::new(|| {
    let parts = [
        "^(?:add|sub|set|isLeapYear|intlFormat)$".to_string(),
        "^(?:format|formatDate|formatISO|formatISO9075|formatRFC3339|formatRelative|lightFormat)$".to_string(),
        "^(?:parse|parseISO)$".to_string(),
        format!("^(?:start|end)Of(?:{CALENDAR_UNITS}|Today|Tomorrow|Yesterday)$"),
        "^(?:add|sub)(?:Days|Weeks|Months|Quarters|Years|BusinessDays|ISOWeekYears)$".to_string(),
        "^(?:get|set)(?:Date|Day|Hours|Minutes|Month|Year|Quarter|Week|ISOWeek|ISOWeekYear|WeekYear|DayOfYear|ISODay)$".to_string(),
        format!("^differenceIn(?:Calendar{WORD}+|Days|Weeks|Months|Quarters|Years|BusinessDays|ISOWeekYears)$"),
        format!("^isSame(?:{CALENDAR_UNITS})$"),
        format!("^isThis(?:{CALENDAR_UNITS})$"),
        format!("^is(?:Today|Tomorrow|Yesterday|Weekend|FirstDayOfMonth|LastDayOfMonth|{DAY_NAMES})$"),
        format!("^each(?:Day|Weekend|Week|Month|Quarter|Year|Hour)Of{WORD}+$"),
        format!("^(?:lastDayOf|getDaysIn|getWeeksIn){WORD}+$"),
        format!("^(?:next|previous)(?:Day|{DAY_NAMES})$"),
    ];
    Regex::new(&parts.join("|")).expect("pattern")
});

pub static DATE_ONLY: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^[0-9]{4}(?:-[0-9]{2}(?:-[0-9]{2})?)?$").expect("pattern"));
pub static WITH_OFFSET: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(?i)^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]{1,9})?)?(?:Z|[+-][0-9]{2}:?[0-9]{2})$").expect("pattern")
});
pub static TRAILING_TIME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"[T ][0-9]{2}:[0-9]{2}(?::[0-9]{2}(?:\.[0-9]{1,9})?)?$").expect("pattern"));
pub static NAMED_ZONE: LazyLock<Regex> = LazyLock::new(|| {
    let space = r"[\t\n\x0B\x0C\r \u{a0}\u{1680}\u{2000}-\u{200a}\u{2028}\u{2029}\u{202f}\u{205f}\u{3000}\u{feff}]";
    Regex::new(&format!(r"(?i)(?:(?-u:\b)GMT|(?-u:\b)UTC|[0-9]Z|[+-][0-9]{{2}}:?[0-9]{{2}})(?:{space}*\([^)]*\))?$")).expect("pattern")
});

pub fn is_js_space(c: char) -> bool {
    matches!(
        c,
        '\t' | '\n' | '\u{b}' | '\u{c}' | '\r' | ' ' | '\u{a0}' | '\u{1680}' | '\u{2000}'..='\u{200a}' | '\u{2028}' | '\u{2029}' | '\u{202f}' | '\u{205f}' | '\u{3000}' | '\u{feff}'
    )
}
