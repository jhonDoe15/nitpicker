//! The expression terms of `shared/logic`: an ESTree expression read as operators over leaves, the key two equal
//! terms share, and the rewrites that bring a condition to one normal form.
pub mod estree;
pub mod normalize;
pub mod print;
pub mod purity;
mod rewrites;

use std::cmp::Ordering;

#[derive(Clone, PartialEq, Debug)]
pub struct Term {
    pub kind: &'static str,
    pub value: Option<String>,
    pub children: Vec<Term>,
    pub loose: bool,
    pub assignment: bool,
}

const EQUALITIES: [&str; 4] = ["==", "!=", "===", "!=="];
const COMPARISONS: [&str; 4] = ["<", "<=", ">", ">="];

impl Term {
    pub fn new(kind: &'static str, value: Option<&str>, children: Vec<Term>) -> Term {
        Term { kind, value: value.map(str::to_string), children, loose: false, assignment: false }
    }

    pub fn value(&self) -> Option<&str> {
        self.value.as_deref()
    }

    pub fn is_logical(&self, operator: &str) -> bool {
        self.kind == "logical" && self.value() == Some(operator)
    }

    pub fn is_not(&self) -> bool {
        self.kind == "unary" && self.value() == Some("!")
    }

    pub fn is_boolean_literal(&self) -> bool {
        self.kind == "literal" && matches!(self.value(), Some("true" | "false"))
    }

    pub fn is_literal(&self, value: &str) -> bool {
        self.kind == "literal" && self.value() == Some(value)
    }

    pub fn is_equality(&self) -> bool {
        self.kind == "binary" && self.value().is_some_and(|operator| EQUALITIES.contains(&operator))
    }

    pub fn is_comparison(&self) -> bool {
        self.kind == "binary" && self.value().is_some_and(|operator| COMPARISONS.contains(&operator))
    }

    pub fn pair(&self) -> Option<(&Term, &Term)> {
        match self.children.as_slice() {
            [first, second, ..] => Some((first, second)),
            _ => None,
        }
    }
}

pub fn is_statement(term: &Term) -> bool {
    matches!(term.kind, "block" | "if" | "return" | "throw" | "break" | "continue" | "expression" | "declaration" | "statement")
}

pub fn flipped_equality(operator: &str) -> Option<&'static str> {
    match operator {
        "==" => Some("!="),
        "!=" => Some("=="),
        "===" => Some("!=="),
        "!==" => Some("==="),
        _ => None,
    }
}

pub fn not(operand: Term) -> Term {
    Term::new("unary", Some("!"), vec![operand])
}

pub fn logical(operator: Option<&str>, operands: Vec<Term>) -> Term {
    Term::new("logical", operator, operands)
}

/// `JSON.stringify` of a string given as UTF-16 code units: lone surrogates become `\udxxx`.
pub fn json_units(units: &[u16]) -> String {
    let mut quoted = String::with_capacity(units.len() + 2);
    quoted.push('"');
    for decoded in char::decode_utf16(units.iter().copied()) {
        match decoded {
            Ok('"') => quoted.push_str("\\\""),
            Ok('\\') => quoted.push_str("\\\\"),
            Ok('\u{8}') => quoted.push_str("\\b"),
            Ok('\u{c}') => quoted.push_str("\\f"),
            Ok('\n') => quoted.push_str("\\n"),
            Ok('\r') => quoted.push_str("\\r"),
            Ok('\t') => quoted.push_str("\\t"),
            Ok(control) if (control as u32) < 0x20 => quoted.push_str(&format!("\\u{:04x}", control as u32)),
            Ok(other) => quoted.push(other),
            Err(lone) => quoted.push_str(&format!("\\u{:04x}", lone.unpaired_surrogate())),
        }
    }
    quoted.push('"');
    quoted
}

pub fn json_text(text: &str) -> String {
    json_units(&text.encode_utf16().collect::<Vec<u16>>())
}

/// JavaScript's `<` on strings: by UTF-16 code unit.
pub fn js_order(left: &str, right: &str) -> Ordering {
    left.encode_utf16().cmp(right.encode_utf16())
}

pub fn key(term: &Term) -> String {
    let head = match term.value() {
        None => term.kind.to_string(),
        Some(value) => format!("{}:{}", term.kind, json_text(value)),
    };
    if term.children.is_empty() {
        return head;
    }
    let children: Vec<String> = term.children.iter().map(key).collect();
    format!("({head} {})", children.join(" "))
}

pub fn is_boolean_valued(term: &Term) -> bool {
    if term.is_boolean_literal() || term.is_not() || term.is_comparison() || term.is_equality() {
        return true;
    }
    if term.is_logical("&&") || term.is_logical("||") {
        return term.children.iter().all(is_boolean_valued);
    }
    term.kind == "conditional" && term.children.get(1).is_some_and(is_boolean_valued) && term.children.get(2).is_some_and(is_boolean_valued)
}

/// Whether any node of the term passes the test.
pub fn any_node(term: &Term, test: &dyn Fn(&Term) -> bool) -> bool {
    test(term) || term.children.iter().any(|child| any_node(child, test))
}
