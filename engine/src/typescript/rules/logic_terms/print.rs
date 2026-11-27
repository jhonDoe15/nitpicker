//! `print` of `shared/logic/print.mts`: a term as JavaScript source, with only the parentheses it needs.
use super::{is_statement, Term};

const UNARY: f64 = 14.0;
const POSTFIX: f64 = 17.0;
const LEAF: f64 = 18.0;
const POWER: f64 = 13.0;

fn binary_precedence(operator: Option<&str>) -> f64 {
    match operator.unwrap_or_default() {
        "|" => 5.0,
        "^" => 6.0,
        "&" => 7.0,
        "==" | "!=" | "===" | "!==" => 8.0,
        "<" | "<=" | ">" | ">=" | "instanceof" | "in" => 9.0,
        "<<" | ">>" | ">>>" => 10.0,
        "+" | "-" => 11.0,
        "*" | "/" | "%" => 12.0,
        "**" => 13.0,
        _ => 0.0,
    }
}

fn precedence(node: &Term) -> f64 {
    match node.kind {
        "conditional" => 1.0,
        "logical" => match node.value() {
            Some("??" | "||") => 3.0,
            Some("&&") => 4.0,
            _ => f64::NAN,
        },
        "binary" => binary_precedence(node.value()),
        "unary" => UNARY,
        "member" | "index" | "call" => POSTFIX,
        "opaque" if !node.loose => UNARY,
        "opaque" if node.assignment => 1.0,
        "opaque" => 0.0,
        _ => LEAF,
    }
}

fn needs_group(parent: &Term, child: &Term, minimum: f64) -> bool {
    let mixes_nullish = parent.kind == "logical"
        && child.kind == "logical"
        && parent.value != child.value
        && (parent.value() == Some("??") || child.value() == Some("??"));
    mixes_nullish || precedence(child) < minimum
}

fn is_integer_receiver(parent: &Term, index: usize) -> bool {
    let postfix = parent.kind == "member" || parent.kind == "index";
    let child = parent.children.get(index);
    postfix
        && index == 0
        && child.is_some_and(|child| {
            child.kind == "literal" && child.value().is_some_and(|value| !value.is_empty() && value.bytes().all(|byte| byte.is_ascii_digit()))
        })
}

fn operand_precedence(parent: &Term, index: usize) -> f64 {
    match parent.kind {
        "conditional" => if index == 0 { 2.0 } else { 1.0 },
        "binary" if parent.value() == Some("**") => if index == 0 { UNARY + 1.0 } else { POWER },
        "binary" | "logical" => precedence(parent) + index as f64,
        "call" if index > 0 => 1.0,
        "unary" => UNARY,
        _ => POSTFIX,
    }
}

fn grouped(parent: &Term, index: usize, texts: &[String]) -> String {
    let minimum = operand_precedence(parent, index);
    let group = parent.children.get(index).is_some_and(|child| needs_group(parent, child, minimum) || is_integer_receiver(parent, index));
    let text = texts.get(index).cloned().unwrap_or_else(|| "undefined".to_string());
    if group { format!("({text})") } else { text }
}

fn shown(value: Option<&str>) -> String {
    value.unwrap_or("undefined").to_string()
}

fn print_unary(node: &Term, texts: &[String]) -> String {
    let inner = grouped(node, 0, texts);
    let operator = shown(node.value());
    if matches!(node.value(), Some("typeof" | "void" | "delete")) {
        return format!("{operator} {inner}");
    }
    let doubled = matches!(node.value(), Some("-" | "+")) && inner.starts_with(&operator);
    if doubled { format!("{operator}({inner})") } else { format!("{operator}{inner}") }
}

fn print_expression(node: &Term, texts: &[String]) -> String {
    match node.kind {
        "binary" | "logical" => format!("{} {} {}", grouped(node, 0, texts), shown(node.value()), grouped(node, 1, texts)),
        "unary" => print_unary(node, texts),
        "conditional" => format!("{} ? {} : {}", grouped(node, 0, texts), grouped(node, 1, texts), grouped(node, 2, texts)),
        "member" => format!("{}.{}", grouped(node, 0, texts), shown(node.value())),
        "index" => format!("{}[{}]", grouped(node, 0, texts), texts.get(1).cloned().unwrap_or_else(|| "undefined".to_string())),
        "call" => {
            let arguments: Vec<String> = (1..texts.len()).map(|index| grouped(node, index, texts)).collect();
            format!("{}({})", grouped(node, 0, texts), arguments.join(", "))
        }
        "this" => "this".to_string(),
        _ => shown(node.value()),
    }
}

fn print_statement(node: &Term, texts: &[String]) -> String {
    let first = || texts.first().cloned().unwrap_or_else(|| "undefined".to_string());
    match node.kind {
        "block" => if texts.is_empty() { "{}".to_string() } else { format!("{{ {} }}", texts.join(" ")) },
        "if" => {
            let head = format!("if ({}) {}", first(), texts.get(1).cloned().unwrap_or_else(|| "undefined".to_string()));
            match texts.get(2) {
                None => head,
                Some(alternate) => format!("{head} else {alternate}"),
            }
        }
        "return" | "throw" => if texts.is_empty() { format!("{};", node.kind) } else { format!("{} {};", node.kind, first()) },
        "break" | "continue" => match node.value() {
            None => format!("{};", node.kind),
            Some(label) => format!("{} {label};", node.kind),
        },
        "expression" => format!("{};", first()),
        _ => shown(node.value()),
    }
}

pub fn print(node: &Term) -> String {
    let texts: Vec<String> = node.children.iter().map(print).collect();
    if is_statement(node) { print_statement(node, &texts) } else { print_expression(node, &texts) }
}
