//! Java's constant arithmetic on numbers, characters and booleans, as javac and PMD's `ConstantFolder` fold it.

#[derive(Clone, Copy, PartialEq)]
pub enum Constant {
    Int(i32),
    Long(i64),
    Float(f32),
    Double(f64),
    Char(u16),
    Bool(bool),
}

use Constant::{Bool, Char, Double, Float, Int, Long};

/// Integer division by zero, which makes PMD give up the rule for the rest of the file.
pub struct Thrown;

pub type Folded = Result<Option<Constant>, Thrown>;

impl Constant {
    pub fn is_zero(self) -> bool {
        match self {
            Int(value) => value == 0,
            Long(value) => value == 0,
            Float(value) => value == 0.0,
            Double(value) => value == 0.0,
            Char(value) => value == 0,
            Bool(_) => false,
        }
    }

    fn promoted(self) -> Option<Constant> {
        match self {
            Char(value) => Some(Int(i32::from(value))),
            Bool(_) => None,
            other => Some(other),
        }
    }

    fn int(self) -> i32 {
        match self {
            Int(value) => value,
            Long(value) => value as i32,
            Float(value) => value as i32,
            Double(value) => value as i32,
            Char(value) => i32::from(value),
            Bool(_) => 0,
        }
    }

    fn long(self) -> i64 {
        match self {
            Int(value) => i64::from(value),
            Long(value) => value,
            Float(value) => value as i64,
            Double(value) => value as i64,
            Char(value) => i64::from(value),
            Bool(_) => 0,
        }
    }

    fn float(self) -> f32 {
        match self {
            Float(value) => value,
            Double(value) => value as f32,
            other => other.long() as f32,
        }
    }

    fn double(self) -> f64 {
        match self {
            Float(value) => f64::from(value),
            Double(value) => value,
            other => other.long() as f64,
        }
    }
}

fn binary(left: Constant, right: Constant) -> Option<(Constant, Constant)> {
    let (left, right) = (left.promoted()?, right.promoted()?);
    Some(match (left, right) {
        (Double(_), _) | (_, Double(_)) => (Double(left.double()), Double(right.double())),
        (Float(_), _) | (_, Float(_)) => (Float(left.float()), Float(right.float())),
        (Long(_), _) | (_, Long(_)) => (Long(left.long()), Long(right.long())),
        _ => (Int(left.int()), Int(right.int())),
    })
}

fn arithmetic(operator: &str, left: Constant, right: Constant) -> Folded {
    let Some(pair) = binary(left, right) else {
        return Ok(None);
    };
    Ok(Some(match (operator, pair) {
        ("/" | "%", (Int(_), Int(0)) | (Long(_), Long(0))) => return Err(Thrown),
        ("+", (Int(a), Int(b))) => Int(a.wrapping_add(b)),
        ("-", (Int(a), Int(b))) => Int(a.wrapping_sub(b)),
        ("*", (Int(a), Int(b))) => Int(a.wrapping_mul(b)),
        ("/", (Int(a), Int(b))) => Int(a.wrapping_div(b)),
        ("%", (Int(a), Int(b))) => Int(a.wrapping_rem(b)),
        ("+", (Long(a), Long(b))) => Long(a.wrapping_add(b)),
        ("-", (Long(a), Long(b))) => Long(a.wrapping_sub(b)),
        ("*", (Long(a), Long(b))) => Long(a.wrapping_mul(b)),
        ("/", (Long(a), Long(b))) => Long(a.wrapping_div(b)),
        ("%", (Long(a), Long(b))) => Long(a.wrapping_rem(b)),
        ("+", (Float(a), Float(b))) => Float(a + b),
        ("-", (Float(a), Float(b))) => Float(a - b),
        ("*", (Float(a), Float(b))) => Float(a * b),
        ("/", (Float(a), Float(b))) => Float(a / b),
        ("%", (Float(a), Float(b))) => Float(a % b),
        ("+", (Double(a), Double(b))) => Double(a + b),
        ("-", (Double(a), Double(b))) => Double(a - b),
        ("*", (Double(a), Double(b))) => Double(a * b),
        ("/", (Double(a), Double(b))) => Double(a / b),
        ("%", (Double(a), Double(b))) => Double(a % b),
        _ => return Ok(None),
    }))
}

fn bitwise(operator: &str, left: Constant, right: Constant) -> Option<Constant> {
    let pair = match (left, right) {
        (Bool(a), Bool(b)) => {
            return Some(Bool(match operator {
                "&" => a & b,
                "|" => a | b,
                _ => a ^ b,
            }));
        }
        (Bool(_), _) | (_, Bool(_)) => return None,
        _ => binary(left, right)?,
    };
    Some(match pair {
        (Int(a), Int(b)) => Int(match operator {
            "&" => a & b,
            "|" => a | b,
            _ => a ^ b,
        }),
        (Long(a), Long(b)) => Long(match operator {
            "&" => a & b,
            "|" => a | b,
            _ => a ^ b,
        }),
        _ => return None,
    })
}

fn shift(operator: &str, left: Constant, right: Constant) -> Option<Constant> {
    let (left, right) = (left.promoted()?, right.promoted()?);
    if !matches!(right, Int(_) | Long(_)) {
        return None;
    }
    let distance = right.int() as u32;
    Some(match (operator, left) {
        ("<<", Int(a)) => Int(a.wrapping_shl(distance)),
        (">>", Int(a)) => Int(a.wrapping_shr(distance)),
        (">>>", Int(a)) => Int((a as u32).wrapping_shr(distance) as i32),
        ("<<", Long(a)) => Long(a.wrapping_shl(distance)),
        (">>", Long(a)) => Long(a.wrapping_shr(distance)),
        (">>>", Long(a)) => Long((a as u64).wrapping_shr(distance) as i64),
        _ => return None,
    })
}

fn compare(operator: &str, left: Constant, right: Constant) -> Option<Constant> {
    let ordering = match binary(left, right)? {
        (Int(a), Int(b)) => a.partial_cmp(&b),
        (Long(a), Long(b)) => a.partial_cmp(&b),
        (Float(a), Float(b)) => a.partial_cmp(&b),
        (Double(a), Double(b)) => a.partial_cmp(&b),
        _ => return None,
    };
    let equal = match binary(left, right)? {
        (Float(a), Float(b)) => a.to_bits() == b.to_bits(),
        (Double(a), Double(b)) => a.to_bits() == b.to_bits(),
        (a, b) => a == b,
    };
    use std::cmp::Ordering::{Greater, Less};
    Some(Bool(match operator {
        "==" => equal,
        "!=" => !equal,
        "<" => ordering == Some(Less),
        ">=" => ordering != Some(Less),
        "<=" => matches!(ordering, Some(Less) | Some(std::cmp::Ordering::Equal)),
        _ => !matches!(ordering, Some(Less) | Some(std::cmp::Ordering::Equal)),
    }))
}

pub fn infix(operator: &str, left: Constant, right: Constant) -> Folded {
    Ok(match operator {
        "||" | "&&" => match (left, right) {
            (Bool(a), Bool(b)) => Some(Bool(if operator == "||" { a || b } else { a && b })),
            _ => None,
        },
        "&" | "|" | "^" => bitwise(operator, left, right),
        "<<" | ">>" | ">>>" => shift(operator, left, right),
        "==" | "!=" | "<" | "<=" | ">" | ">=" => compare(operator, left, right),
        _ => return arithmetic(operator, left, right),
    })
}

pub fn cast(kind: &str, value: Constant) -> Option<Constant> {
    let value = value.promoted()?;
    Some(match kind {
        "char" => Char(value.int() as u16),
        "byte" => Int(i32::from(value.int() as i8)),
        "short" => Int(i32::from(value.int() as i16)),
        "int" => Int(value.int()),
        "long" => Long(value.long()),
        "float" => Float(value.float()),
        "double" => Double(value.double()),
        _ => return None,
    })
}

pub fn unary(operator: &str, value: Constant) -> Option<Constant> {
    if operator == "!" {
        return match value {
            Bool(value) => Some(Bool(!value)),
            _ => None,
        };
    }
    Some(match (operator, value.promoted()?) {
        ("+", promoted) => promoted,
        ("-", Int(a)) => Int(a.wrapping_neg()),
        ("-", Long(a)) => Long(a.wrapping_neg()),
        ("-", Float(a)) => Float(-a),
        ("-", Double(a)) => Double(-a),
        ("~", Int(a)) => Int(!a),
        ("~", Long(a)) => Long(!a),
        _ => return None,
    })
}

/// A numeric literal as written: its value as a whole number and as a real, and its kind.
pub struct Literal {
    pub whole: i64,
    pub real: f64,
    pub integral: bool,
    pub long: bool,
    pub float: bool,
}

impl Literal {
    pub fn constant(&self) -> Constant {
        if self.long {
            Long(self.whole)
        } else if self.integral {
            Int(self.whole as i32)
        } else if self.float {
            Float(self.real as f32)
        } else {
            Double(self.real)
        }
    }
}

/// Reads a numeric literal; `integral` is false for floating-point literals.
pub fn literal(image: &str, integral: bool) -> Literal {
    let digits: String = image.chars().filter(|c| *c != '_').collect::<String>().to_lowercase();
    let long = integral && digits.ends_with('l');
    let body = digits.trim_end_matches('l');
    let (whole, real) = if integral {
        let parsed = if let Some(hex) = body.strip_prefix("0x") {
            u64::from_str_radix(hex, 16)
        } else if let Some(binary) = body.strip_prefix("0b") {
            u64::from_str_radix(binary, 2)
        } else if body.len() > 1 && body.starts_with('0') {
            u64::from_str_radix(&body[1..], 8)
        } else {
            body.parse::<u64>()
        }
        .unwrap_or(0);
        let value = if long { parsed as i64 } else { parsed as u32 as i32 as i64 };
        (value, if long { value as f64 } else { parsed as f64 })
    } else if let Some(hex) = body.strip_prefix("0x") {
        let (digits, power) = hex.trim_end_matches(['f', 'd']).split_once('p').unwrap_or((hex, "0"));
        let (whole, fraction) = digits.split_once('.').unwrap_or((digits, ""));
        let mantissa = u64::from_str_radix(&format!("{whole}{fraction}"), 16).unwrap_or(0) as f64;
        let real = mantissa * 2f64.powi(power.parse::<i32>().unwrap_or(0) - 4 * fraction.len() as i32);
        (real as i64 as i32 as i64, real)
    } else {
        let real = body.trim_end_matches(['f', 'd']).parse::<f64>().unwrap_or(0.0);
        (real as i64 as i32 as i64, real)
    };
    Literal { whole, real, integral, long, float: !integral && digits.ends_with('f') }
}

/// The value of a character literal from its image, where unicode escapes are already replaced.
pub fn char_value(image: &str) -> Option<u32> {
    let inner = image.strip_prefix('\'')?.strip_suffix('\'')?;
    let Some(escape) = inner.strip_prefix('\\') else {
        return inner.chars().next().map(|value| value as u32);
    };
    Some(match escape.chars().next()? {
        'n' => 10,
        't' => 9,
        'r' => 13,
        'b' => 8,
        'f' => 12,
        's' => 32,
        digit if digit.is_digit(8) => u32::from_str_radix(escape, 8).ok()?,
        other => other as u32,
    })
}
