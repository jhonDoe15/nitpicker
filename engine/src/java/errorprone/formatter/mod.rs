//! What `String.format` does with a format string and arguments of known kinds, written from the
//! `java.util.Formatter` documentation and checked against the JDK by `tests/formatter.rs`.
mod parse;
mod print;
pub mod float;
#[cfg(test)]
mod cases;

pub use print::Arg;

const ORDER: &str = "-^#+ 0,(<";

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Flags(pub u16);

impl Flags {
    pub const LEFT: Flags = Flags(1);
    pub const UPPER: Flags = Flags(2);
    pub const ALTERNATE: Flags = Flags(4);
    pub const PLUS: Flags = Flags(8);
    pub const SPACE: Flags = Flags(16);
    pub const ZERO: Flags = Flags(32);
    pub const GROUP: Flags = Flags(64);
    pub const PARENTHESES: Flags = Flags(128);
    pub const PREVIOUS: Flags = Flags(256);

    fn of(c: char) -> Flags {
        Flags(1 << ORDER.find(c).unwrap_or(0))
    }
    fn with(self, other: Flags) -> Flags {
        Flags(self.0 | other.0)
    }
    fn has(self, other: Flags) -> bool {
        self.0 & other.0 != 0
    }
    fn text(self) -> String {
        ORDER.chars().enumerate().filter(|(bit, _)| self.0 & (1 << bit) != 0).map(|(_, c)| c).collect()
    }
}

#[derive(Clone, Debug)]
pub struct Spec {
    index: i32,
    flags: Flags,
    width: i32,
    precision: i32,
    date: bool,
    conversion: char,
}

impl Spec {
    fn text(&self) -> String {
        let mut text = String::from("%");
        text.push_str(&Flags(self.flags.0 & !Flags::UPPER.0).text());
        if self.index > 0 {
            text.push_str(&format!("{}$", self.index));
        }
        if self.width != -1 {
            text.push_str(&self.width.to_string());
        }
        if self.precision != -1 {
            text.push_str(&format!(".{}", self.precision));
        }
        let upper = self.flags.has(Flags::UPPER);
        if self.date {
            text.push(if upper { 'T' } else { 't' });
        }
        text.push(if upper { self.conversion.to_ascii_uppercase() } else { self.conversion });
        text
    }
}

#[derive(Clone, Debug, PartialEq)]
pub enum Failure {
    Duplicate(Flags),
    Mismatch(Flags, char),
    CodePoint(i32),
    Conversion(&'static str, char),
    IllegalFlags(Flags),
    Precision(i32),
    Width(i32),
    MissingArgument(String),
    MissingWidth(String),
    Unknown(String),
    Other(String),
}

impl Failure {
    /// The sentence Error Prone's format string validation writes for the exception.
    pub fn message(&self) -> String {
        match self {
            Failure::Duplicate(flags) => format!("duplicate format flags: {}", flags.text()),
            Failure::Mismatch(flags, c) => {
                format!("format specifier '%{c}' is not compatible with the given flag(s): {}", flags.text())
            }
            Failure::CodePoint(point) => format!("invalid Unicode code point: {:x}", *point as u32),
            Failure::Conversion(class, c) => format!("illegal format conversion: '{class}' cannot be formatted using '%{c}'"),
            Failure::IllegalFlags(flags) => format!("illegal format flags: {}", flags.text()),
            Failure::Precision(precision) => format!("illegal format precision: {precision}"),
            Failure::Width(width) => format!("illegal format width: {width}"),
            Failure::MissingArgument(spec) => format!("missing argument for format specifier '{spec}'"),
            Failure::MissingWidth(spec) => format!("missing format width: {spec}"),
            Failure::Unknown(c) if c == "l" => concat!(
                "%l is not a valid format specifier; use %d to format integral types as a decimal integer, and %f, %g or ",
                "%e to format floating point types (depending on your formatting needs)"
            )
            .to_string(),
            Failure::Unknown(c) => format!("unknown format conversion: '{c}'"),
            Failure::Other(message) => message.clone(),
        }
    }
}

/// The failure `String.format(text, args)` throws on the JDK of that major version, if any.
pub fn format(text: &str, args: &[Arg], jdk: u32) -> Result<(), Failure> {
    print::run(&parse::specifiers(text, jdk)?, args, jdk)
}

/// Error Prone's message for a format call: the failure, or the extra arguments the string does not use.
pub fn validate(text: &str, args: &[Arg], jdk: u32) -> Option<String> {
    let specs = match parse::specifiers(text, jdk) {
        Ok(specs) => specs,
        Err(failure) => return Some(failure.message()),
    };
    if let Err(failure) = print::run(&specs, args, jdk) {
        return Some(failure.message());
    }
    let used = (0..=args.len()).find(|count| print::run(&specs, &args[..*count], jdk).is_ok()).unwrap_or(0);
    (used != args.len()).then(|| format!("extra format arguments: used {used}, provided {}", args.len()))
}

/// Whether `String.format(text)` with no arguments throws MissingFormatArgumentException.
pub fn misses_arguments(text: &str, jdk: u32) -> bool {
    matches!(format(text, &[], jdk), Err(Failure::MissingArgument(_)))
}
