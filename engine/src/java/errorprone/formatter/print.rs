//! The argument checks `java.util.Formatter` makes while it formats each specifier.
use super::{Failure, Flags, Spec};

/// The kinds of argument Error Prone's validation formats with: the sample instance it picks for a type.
#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Arg {
    Null,
    Bool,
    Byte,
    Short,
    Int(i32),
    Long,
    Char,
    Float,
    Double,
    Str,
    BigDecimal,
    BigInteger,
    Date,
    Calendar,
    Instant,
    Zoned,
    Formattable,
}

impl Arg {
    fn class(self) -> &'static str {
        match self {
            Arg::Null => "null",
            Arg::Bool => "java.lang.Boolean",
            Arg::Byte => "java.lang.Byte",
            Arg::Short => "java.lang.Short",
            Arg::Int(_) => "java.lang.Integer",
            Arg::Long => "java.lang.Long",
            Arg::Char => "java.lang.Character",
            Arg::Float => "java.lang.Float",
            Arg::Double => "java.lang.Double",
            Arg::Str => "java.lang.String",
            Arg::BigDecimal => "java.math.BigDecimal",
            Arg::BigInteger => "java.math.BigInteger",
            Arg::Date => "java.util.Date",
            Arg::Calendar => "java.util.GregorianCalendar",
            Arg::Instant => "java.time.Instant",
            Arg::Zoned => "java.time.ZonedDateTime",
            Arg::Formattable => "com.google.errorprone.bugpatterns.formatstring.FormatStringValidation$2",
        }
    }
    fn integral(self) -> bool {
        matches!(self, Arg::Byte | Arg::Short | Arg::Int(_) | Arg::Long)
    }
}

fn instant_field(conversion: char, jdk: u32) -> Option<char> {
    match conversion {
        's' | 'Q' | 'L' | 'N' => None,
        'R' | 'T' => Some('H'),
        'r' => Some('I'),
        'D' => Some('m'),
        'F' => Some(if jdk >= 22 { 'F' } else { 'Y' }),
        'c' => Some('a'),
        other => Some(other),
    }
}

fn date(spec: &Spec, arg: Arg, jdk: u32) -> Result<(), Failure> {
    match arg {
        Arg::Null | Arg::Long | Arg::Date | Arg::Calendar | Arg::Zoned => Ok(()),
        Arg::Instant => instant_field(spec.conversion, jdk).map_or(Ok(()), |field| Err(Failure::Conversion(arg.class(), field))),
        _ => Err(Failure::Conversion(arg.class(), spec.conversion)),
    }
}

fn print(spec: &Spec, arg: Arg, jdk: u32) -> Result<(), Failure> {
    if spec.date {
        return date(spec, arg, jdk);
    }
    let conversion = spec.conversion;
    let fail = || Err(Failure::Conversion(arg.class(), conversion));
    match (conversion, arg) {
        ('b' | 'h', _) | (_, Arg::Null) if conversion != 's' => Ok(()),
        ('s', Arg::Formattable) => Ok(()),
        ('s', _) if spec.flags.has(Flags::ALTERNATE) => Err(Failure::Mismatch(Flags::ALTERNATE, 's')),
        ('s', _) => Ok(()),
        ('c', Arg::Int(point)) if !(0..=0x10FFFF).contains(&point) => Err(Failure::CodePoint(point)),
        ('c', Arg::Char | Arg::Byte | Arg::Short | Arg::Int(_)) => Ok(()),
        ('d', Arg::BigInteger) | ('o' | 'x', Arg::BigInteger) => Ok(()),
        ('d', _) if arg.integral() => Ok(()),
        ('o' | 'x', _) if arg.integral() => {
            let found = spec.flags.0 & Flags::PARENTHESES.with(Flags::SPACE).with(Flags::PLUS).0;
            if found == 0 { Ok(()) } else { Err(Failure::Mismatch(Flags(found), conversion)) }
        }
        ('e' | 'f' | 'g', Arg::BigDecimal) => Ok(()),
        ('e' | 'f' | 'g' | 'a', Arg::Float | Arg::Double) => Ok(()),
        _ => fail(),
    }
}

/// Formats each specifier with its argument, in order, as `Formatter.format` does after parsing.
pub fn run(specs: &[Spec], args: &[Arg], jdk: u32) -> Result<(), Failure> {
    let mut last: i64 = -1;
    let mut ordinary: i64 = -1;
    for spec in specs {
        if matches!(spec.conversion, '%' | 'n') && !spec.date {
            continue;
        }
        if spec.index == -1 {
            if last < 0 {
                return Err(Failure::MissingArgument(spec.text()));
            }
        } else if spec.index > 0 {
            last = i64::from(spec.index) - 1;
        } else {
            ordinary += 1;
            last = ordinary;
        }
        let Some(arg) = usize::try_from(last).ok().and_then(|at| args.get(at)) else {
            return Err(Failure::MissingArgument(spec.text()));
        };
        print(spec, *arg, jdk)?;
    }
    Ok(())
}
