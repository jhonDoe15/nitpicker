//! `toTerm` of `analysis/logic/estree-terms.mts`: an ESTree node as a term, its unmodeled parts kept as source text.
use super::{json_units, Term};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::writes::syntax::js_number;

const TRANSPARENT: [&str; 5] = ["TSAsExpression", "TSNonNullExpression", "TSSatisfiesExpression", "TSTypeAssertion", "TSInstantiationExpression"];
const COMPOSITES: [&str; 11] = [
    "UnaryExpression",
    "BinaryExpression",
    "LogicalExpression",
    "ConditionalExpression",
    "MemberExpression",
    "CallExpression",
    "BlockStatement",
    "IfStatement",
    "ReturnStatement",
    "ThrowStatement",
    "ExpressionStatement",
];
const LOOSE: [&str; 3] = ["SequenceExpression", "AssignmentExpression", "YieldExpression"];

pub fn is_transparent(node: Node) -> bool {
    TRANSPARENT.contains(&node.kind())
}

fn is_modeled(node: Node) -> bool {
    match node.kind() {
        "UnaryExpression" => node.text("operator").as_deref() != Some("delete"),
        "BinaryExpression" => !node.node("left").is_some_and(|left| left.is("PrivateIdentifier")),
        "MemberExpression" => !node.flag("optional") && !node.node("object").is_some_and(|object| object.is("Super")),
        "CallExpression" => !node.flag("optional") && !node.node("callee").is_some_and(|callee| callee.is("Super")),
        "TemplateLiteral" => node.nodes("expressions").is_empty(),
        "Literal" => node.get("regex") == Value::Null,
        _ => true,
    }
}

fn is_composite(node: Node) -> bool {
    COMPOSITES.contains(&node.kind()) && is_modeled(node)
}

fn parts<'v>(node: Node<'v>) -> Vec<Node<'v>> {
    if is_transparent(node) {
        return node.node("expression").into_iter().collect();
    }
    if !is_composite(node) {
        return Vec::new();
    }
    let fields: &[&str] = match node.kind() {
        "UnaryExpression" | "ReturnStatement" | "ThrowStatement" => &["argument"],
        "BinaryExpression" | "LogicalExpression" => &["left", "right"],
        "ConditionalExpression" | "IfStatement" => &["test", "consequent", "alternate"],
        "MemberExpression" if node.flag("computed") => &["object", "property"],
        "MemberExpression" => &["object"],
        "CallExpression" => return node.node("callee").into_iter().chain(node.nodes("arguments")).collect(),
        "BlockStatement" => return node.nodes("body"),
        _ => &["expression"],
    };
    fields.iter().filter_map(|field| node.node(field)).collect()
}

/// `BigInt(text).toString()` for the digits of a bigint literal, in any base.
fn decimal_bigint(text: &str) -> String {
    let digits: String = text.chars().filter(|character| *character != '_').collect();
    let lower = digits.to_ascii_lowercase();
    let (radix, body) = match lower.get(..2) {
        Some("0x") => (16, &lower[2..]),
        Some("0o") => (8, &lower[2..]),
        Some("0b") => (2, &lower[2..]),
        _ => (10, lower.as_str()),
    };
    let mut decimal: Vec<u32> = vec![0];
    for digit in body.chars().filter_map(|character| character.to_digit(radix)) {
        let mut carry = digit;
        for place in decimal.iter_mut() {
            let next = *place * radix + carry;
            *place = next % 10;
            carry = next / 10;
        }
        while carry > 0 {
            decimal.push(carry % 10);
            carry /= 10;
        }
    }
    decimal.iter().rev().map(|digit| char::from_digit(*digit, 10).unwrap_or('0')).collect()
}

fn literal_value(node: Node) -> String {
    let view = node.view;
    match node.get("value") {
        text @ Value::Text(..) => return json_units(&view.utf16(text).unwrap_or_default()),
        Value::Number(number) => return js_number(number),
        _ => {}
    }
    if let Some(bigint) = node.text("bigint") {
        return format!("{}n", decimal_bigint(&bigint));
    }
    if node.get("value") == Value::Null {
        return "null".to_string();
    }
    node.text("raw").map(|raw| raw.into_owned()).unwrap_or_default()
}

fn cooked(node: Node) -> Vec<u16> {
    let view = node.view;
    let mut units = Vec::new();
    for quasi in node.nodes("quasis") {
        if let Value::Node(index) = quasi.get("value") {
            units.extend(view.utf16(view.at(index).get("cooked")).unwrap_or_default());
        }
    }
    units
}

fn opaque(node: Node, text: &str) -> Term {
    let kind = node.kind();
    let shape = if kind.ends_with("Declaration") {
        "declaration"
    } else if kind.ends_with("Statement") {
        "statement"
    } else {
        "opaque"
    };
    let mut term = Term::new(shape, Some(text), Vec::new());
    if shape == "opaque" && kind == "ArrowFunctionExpression" {
        term.loose = true;
        term.assignment = true;
    } else if shape == "opaque" && LOOSE.contains(&kind) {
        term.loose = true;
    }
    term
}

fn leaf(node: Node, source: &str) -> Term {
    if !is_modeled(node) {
        return opaque(node, text_of(source, node));
    }
    match node.kind() {
        "Literal" => Term::new("literal", Some(&literal_value(node)), Vec::new()),
        "TemplateLiteral" => Term::new("literal", Some(&json_units(&cooked(node))), Vec::new()),
        "Identifier" => Term::new("name", node.name().as_deref(), Vec::new()),
        "ThisExpression" => Term::new("this", None, Vec::new()),
        "BreakStatement" | "ContinueStatement" => {
            let label = node.node("label").and_then(|label| label.name().map(|name| name.into_owned()));
            Term::new(if node.is("BreakStatement") { "break" } else { "continue" }, label.as_deref(), Vec::new())
        }
        _ => opaque(node, text_of(source, node)),
    }
}

fn as_block(statement: Term) -> Term {
    if statement.kind == "block" { statement } else { Term::new("block", None, vec![statement]) }
}

fn composite(node: Node, children: Vec<Term>) -> Term {
    let operator = node.text("operator");
    match node.kind() {
        "UnaryExpression" => Term::new("unary", operator.as_deref(), children),
        "BinaryExpression" => Term::new("binary", operator.as_deref(), children),
        "LogicalExpression" => Term::new("logical", operator.as_deref(), children),
        "ReturnStatement" => Term::new("return", None, children),
        "ThrowStatement" => Term::new("throw", None, children),
        "ExpressionStatement" => Term::new("expression", None, children),
        "ConditionalExpression" => Term::new("conditional", None, children),
        "MemberExpression" if node.flag("computed") => Term::new("index", None, children),
        "MemberExpression" => {
            let property = node.node("property");
            let name = property.and_then(|property| property.name()).unwrap_or_default();
            let private = property.is_some_and(|property| property.is("PrivateIdentifier"));
            Term::new("member", Some(&if private { format!("#{name}") } else { name.into_owned() }), children)
        }
        "CallExpression" => Term::new("call", None, children),
        "IfStatement" => {
            let children = children.into_iter().enumerate().map(|(index, child)| if index == 0 { child } else { as_block(child) }).collect();
            Term::new("if", None, children)
        }
        _ => Term::new("block", None, children),
    }
}

pub fn text_of<'s>(source: &'s str, node: Node) -> &'s str {
    source.get(node.start() as usize..node.end() as usize).unwrap_or_default()
}

pub fn to_term(node: Node, source: &str) -> Term {
    let children: Vec<Term> = parts(node).into_iter().map(|part| to_term(part, source)).collect();
    if is_transparent(node) {
        return children.into_iter().next().unwrap_or_else(|| opaque(node, text_of(source, node)));
    }
    if is_composite(node) { composite(node, children) } else { leaf(node, source) }
}
