//! The values a variable can still hold, as sorted runs of whole numbers, and how SpotBugs prints a comparison.
use crate::java::types::model::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Int,
    Long,
    Short,
    Byte,
    Char,
    Boolean,
}

impl Kind {
    pub fn of(kind: &Type) -> Option<Kind> {
        match kind {
            Type::Primitive(name) => Kind::named(name),
            Type::Class(name, _) => Kind::named(match name.as_str() {
                "java.lang.Integer" => "int",
                "java.lang.Long" => "long",
                "java.lang.Short" => "short",
                "java.lang.Byte" => "byte",
                "java.lang.Character" => "char",
                "java.lang.Boolean" => "boolean",
                _ => return None,
            }),
            _ => None,
        }
    }

    fn named(name: &str) -> Option<Kind> {
        Some(match name {
            "int" => Kind::Int,
            "long" => Kind::Long,
            "short" => Kind::Short,
            "byte" => Kind::Byte,
            "char" => Kind::Char,
            "boolean" => Kind::Boolean,
            _ => return None,
        })
    }

    pub fn name(self) -> &'static str {
        match self {
            Kind::Int => "int",
            Kind::Long => "long",
            Kind::Short => "short",
            Kind::Byte => "byte",
            Kind::Char => "char",
            Kind::Boolean => "boolean",
        }
    }

    pub fn domain(self) -> (i128, i128) {
        match self {
            Kind::Int => (i32::MIN.into(), i32::MAX.into()),
            Kind::Long => (i64::MIN.into(), i64::MAX.into()),
            Kind::Short => (i16::MIN.into(), i16::MAX.into()),
            Kind::Byte => (i8::MIN.into(), i8::MAX.into()),
            Kind::Char => (0, u16::MAX.into()),
            Kind::Boolean => (0, 1),
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Op {
    Lt,
    Le,
    Gt,
    Ge,
    Eq,
    Ne,
}

impl Op {
    pub fn parse(text: &str) -> Option<Op> {
        Some(match text {
            "<" => Op::Lt,
            "<=" => Op::Le,
            ">" => Op::Gt,
            ">=" => Op::Ge,
            "==" => Op::Eq,
            "!=" => Op::Ne,
            _ => return None,
        })
    }

    pub fn negated(self) -> Op {
        match self {
            Op::Lt => Op::Ge,
            Op::Le => Op::Gt,
            Op::Gt => Op::Le,
            Op::Ge => Op::Lt,
            Op::Eq => Op::Ne,
            Op::Ne => Op::Eq,
        }
    }

    /// The operator with its operands swapped: `3 < x` is `x > 3`.
    pub fn swapped(self) -> Op {
        match self {
            Op::Lt => Op::Gt,
            Op::Le => Op::Ge,
            Op::Gt => Op::Lt,
            Op::Ge => Op::Le,
            other => other,
        }
    }

    fn text(self) -> &'static str {
        match self {
            Op::Lt => "<",
            Op::Le => "<=",
            Op::Gt => ">",
            Op::Ge => ">=",
            Op::Eq => "==",
            Op::Ne => "!=",
        }
    }

    /// Every number the comparison with `value` holds for.
    pub fn holding(self, value: i128) -> Set {
        let (low, high) = (i128::MIN / 2, i128::MAX / 2);
        Set(match self {
            Op::Lt => vec![(low, value - 1)],
            Op::Le => vec![(low, value)],
            Op::Gt => vec![(value + 1, high)],
            Op::Ge => vec![(value, high)],
            Op::Eq => vec![(value, value)],
            Op::Ne => vec![(low, value - 1), (value + 1, high)],
        })
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Set(Vec<(i128, i128)>);

impl Set {
    pub fn of(kind: Kind) -> Set {
        let (low, high) = kind.domain();
        Set(vec![(low, high)])
    }

    pub fn is_empty(&self) -> bool {
        self.0.is_empty()
    }

    pub fn and(&self, other: &Set) -> Set {
        let mut runs = Vec::new();
        for (low, high) in &self.0 {
            for (from, to) in &other.0 {
                let (start, end) = ((*low).max(*from), (*high).min(*to));
                if start <= end {
                    runs.push((start, end));
                }
            }
        }
        Set(runs)
    }

    pub fn or(&self, other: &Set) -> Set {
        let mut runs: Vec<(i128, i128)> = self.0.iter().chain(&other.0).copied().collect();
        runs.sort();
        let mut joined: Vec<(i128, i128)> = Vec::new();
        for (low, high) in runs {
            match joined.last_mut() {
                Some(last) if low <= last.1 + 1 => last.1 = last.1.max(high),
                _ => joined.push((low, high)),
            }
        }
        Set(joined)
    }

    pub fn without(&self, other: &Set) -> Set {
        let mut runs = self.0.clone();
        for (from, to) in &other.0 {
            runs = runs
                .into_iter()
                .flat_map(|(low, high)| {
                    let mut kept = Vec::new();
                    if low < *from {
                        kept.push((low, high.min(*from - 1)));
                    }
                    if high > *to {
                        kept.push((low.max(*to + 1), high));
                    }
                    kept
                })
                .collect();
        }
        Set(runs)
    }
}

/// How SpotBugs prints a constant: an ASCII code from 32 to 127 with its character (not for a `long`), a number
/// above 128 with its hex form, and `L` on a `long` that does not fit an `int`. A `char` prints as its character literal when it has one.
pub fn shown(kind: Kind, value: i128) -> String {
    if kind == Kind::Char {
        let quoted = match value {
            8 => Some("'\\b'".to_string()),
            9 => Some("'\\t'".to_string()),
            10 => Some("'\\n'".to_string()),
            13 => Some("'\\r'".to_string()),
            39 => Some("'\\''".to_string()),
            92 => Some("'\\\\'".to_string()),
            32..=127 => Some(format!("'{}'", char::from(value as u8))),
            _ => None,
        };
        if let Some(quoted) = quoted {
            return quoted;
        }
    }
    let wide = kind == Kind::Long && (value < i32::MIN.into() || value > i32::MAX.into());
    let suffix = if wide { "L" } else { "" };
    match value {
        32..=127 if kind != Kind::Long => format!("{value} ('{}')", char::from(value as u8)),
        _ if value > 128 => format!("{value}{suffix} (0x{value:x}{suffix})"),
        _ => format!("{value}{suffix}"),
    }
}

/// The fact SpotBugs states: `name op value`, a `boolean` as `== true` or `== false`.
pub fn fact(name: &str, kind: Kind, op: Op, value: i128) -> String {
    if kind == Kind::Boolean {
        let truth = matches!((op, value), (Op::Ne, 0) | (Op::Eq, 1) | (Op::Gt, 0) | (Op::Ge, 1));
        return format!("{name} == {truth}");
    }
    format!("{name} {} {}", op.text(), shown(kind, value))
}
