//! The TypeScript compiler's syntax tree, as the request-input rules walk it, read off the ESTree view. A `T` is a
//! node of that tree: a view node, or one of the parentheses around it (`level` of them), which the view drops and
//! the compiler keeps as nodes of their own. Parenthesized types are nodes of the view.
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value, View};
use crate::typescript::rules::urls::values::string_value;
use oxc_ast::AstKind;
use oxc_span::GetSpan;
use std::collections::HashMap;

pub struct Tree<'v> {
    pub view: &'v View,
    pub source: &'v str,
    parens: HashMap<(u32, u32), Vec<(u32, u32)>>,
}

#[derive(Clone, Copy, PartialEq)]
pub struct T<'v> {
    pub node: Node<'v>,
    pub level: usize,
}

impl<'v> T<'v> {
    /// The node when no parenthesis wraps it here: what `ts.isX` tests.
    pub fn bare(self) -> Option<Node<'v>> {
        (self.level == 0).then_some(self.node)
    }

    pub fn is(self, kind: &str) -> bool {
        self.level == 0 && self.node.is(kind)
    }

    pub fn inner(self) -> T<'v> {
        T { node: self.node, level: 0 }
    }

    pub fn with_level(self, level: usize) -> T<'v> {
        T { node: self.node, level }
    }
}

fn inner_span(expression: Span) -> (u32, u32) {
    (expression.start, expression.end)
}

type Span = oxc_span::Span;

pub fn chain_inner(node: Node) -> Node {
    let mut current = node;
    while current.is("ChainExpression") {
        match current.node("expression") {
            Some(inner) => current = inner,
            None => break,
        }
    }
    current
}

impl<'v> Tree<'v> {
    pub fn of(context: &Context<'_, 'v>) -> Option<Tree<'v>> {
        let (view, _) = context.estree?;
        let mut parens: HashMap<(u32, u32), Vec<(u32, u32)>> = HashMap::new();
        for node in context.semantic.nodes().iter() {
            let AstKind::ParenthesizedExpression(found) = node.kind() else { continue };
            let (outer, inner) = (found.span, found.expression.without_parentheses().span());
            parens.entry(inner_span(inner)).or_default().push((outer.start, outer.end));
        }
        for spans in parens.values_mut() {
            spans.sort_by_key(|(start, end)| (std::cmp::Reverse(*start), *end));
        }
        Some(Tree { view, source: context.file.text, parens })
    }

    fn count(&self, node: Node) -> usize {
        self.parens.get(&(node.start(), node.end())).map_or(0, Vec::len)
    }

    /// The node a field holds, as the compiler holds it: with its parentheses.
    pub fn slot(&self, node: Option<Node<'v>>) -> Option<T<'v>> {
        let node = chain_inner(node?);
        Some(T { node, level: self.count(node) })
    }

    pub fn field(&self, node: Node<'v>, key: &str) -> Option<T<'v>> {
        self.slot(node.node(key))
    }

    pub fn fields(&self, node: Node<'v>, key: &str) -> Vec<Option<T<'v>>> {
        node.list(key).into_iter().map(|item| self.slot(item)).collect()
    }

    pub fn span(&self, t: T) -> (u32, u32) {
        if t.level == 0 {
            return (t.node.start(), t.node.end());
        }
        self.parens.get(&(t.node.start(), t.node.end())).and_then(|spans| spans.get(t.level - 1)).copied().unwrap_or((t.node.start(), t.node.end()))
    }

    /// `getText()`.
    pub fn text(&self, t: T) -> &'v str {
        let (start, end) = self.span(t);
        &self.source[start as usize..end as usize]
    }

    /// The parent in the compiler's tree, where the view's parent is a node the compiler has too.
    pub fn parent(&self, t: T<'v>) -> Option<T<'v>> {
        if t.level < self.count(t.node) {
            return Some(T { node: t.node, level: t.level + 1 });
        }
        let parent = view_parent(t.node)?;
        Some(T { node: parent, level: 0 })
    }
}

/// The view's parent, past the chain node the compiler does not have.
pub fn view_parent(node: Node) -> Option<Node> {
    let mut parent = node.parent()?;
    while parent.is("ChainExpression") {
        parent = parent.parent()?;
    }
    Some(parent)
}

pub fn is_pa(node: Node) -> bool {
    node.is("MemberExpression") && !node.flag("computed")
}

/// The name text of a property access: the compiler keeps the `#` of a private name.
pub fn member_text(member: Node) -> Option<String> {
    let property = member.node("property")?;
    let name = property.name()?;
    Some(if property.is("PrivateIdentifier") { format!("#{name}") } else { name.into_owned() })
}

/// `ts.isStringLiteralLike(node) ? node.text : undefined`.
pub fn string_like(t: Option<T>) -> Option<String> {
    let node = t?.bare()?;
    if node.is("TemplateLiteral") && node.parent().is_some_and(|parent| parent.is("TaggedTemplateExpression")) {
        return None;
    }
    string_value(Some(node))
}

/// `ts.isStringLiteral(node) ? node.text : undefined`: quotes, not a template.
pub fn string_literal(t: Option<T>) -> Option<String> {
    let node = t?.bare()?;
    if node.is("Literal") { string_value(Some(node)) } else { None }
}

pub fn is_number(node: Node) -> bool {
    node.is("Literal") && matches!(node.get("value"), Value::Number(_)) && node.get("bigint") == Value::Null
}

pub fn is_bigint(node: Node) -> bool {
    node.is("Literal") && node.get("bigint") != Value::Null
}

pub fn is_boolean(node: Node) -> bool {
    node.is("Literal") && matches!(node.get("value"), Value::Bool(_))
}

/// `nameOf` of the request-input helpers.
pub fn name_of(t: Option<T>) -> Option<String> {
    let node = t?.bare()?;
    match node.kind() {
        "Identifier" => node.name().map(|name| name.into_owned()),
        "PrivateIdentifier" => node.name().map(|name| format!("#{name}")),
        "Literal" if is_number(node) => match node.get("value") {
            Value::Number(number) => Some(js_number(number)),
            _ => None,
        },
        "Literal" | "TemplateLiteral" => string_like(t),
        _ => None,
    }
}

/// A property key as a name: `nameOf(member.name)`, none for a computed key.
pub fn key_name(tree: &Tree, owner: Node) -> Option<String> {
    if owner.flag("computed") {
        return None;
    }
    name_of(tree.field(owner, "key"))
}

/// `String(value)` of a JavaScript number.
pub fn js_number(number: f64) -> String {
    if number.is_nan() {
        return "NaN".to_string();
    }
    if number.is_infinite() {
        return if number > 0.0 { "Infinity" } else { "-Infinity" }.to_string();
    }
    if number == 0.0 {
        return "0".to_string();
    }
    let sign = if number < 0.0 { "-" } else { "" };
    let written = format!("{:e}", number.abs());
    let (mantissa, exponent) = written.split_once('e').unwrap_or((&written, "0"));
    let digits: String = mantissa.chars().filter(char::is_ascii_digit).collect();
    let exponent: i32 = exponent.parse().unwrap_or(0);
    let count = digits.len() as i32;
    let point = exponent + 1;
    let body = if count <= point && point <= 21 {
        format!("{digits}{}", "0".repeat((point - count) as usize))
    } else if 0 < point && point <= 21 {
        format!("{}.{}", &digits[..point as usize], &digits[point as usize..])
    } else if -6 < point && point <= 0 {
        format!("0.{}{digits}", "0".repeat((-point) as usize))
    } else {
        let tail = if count > 1 { format!(".{}", &digits[1..]) } else { String::new() };
        let power = point - 1;
        format!("{}{tail}e{}{}", &digits[..1], if power >= 0 { "+" } else { "-" }, power.abs())
    };
    format!("{sign}{body}")
}

/// `String(table[name])` for a name a plain object inherits from `Object.prototype`.
pub fn inherited(name: &str) -> Option<String> {
    const FUNCTIONS: [&str; 10] = [
        "__defineGetter__",
        "__defineSetter__",
        "hasOwnProperty",
        "__lookupGetter__",
        "__lookupSetter__",
        "isPrototypeOf",
        "propertyIsEnumerable",
        "toString",
        "valueOf",
        "toLocaleString",
    ];
    match name {
        "constructor" => Some("function Object() { [native code] }".to_string()),
        "__proto__" => Some("[object Object]".to_string()),
        _ if FUNCTIONS.contains(&name) => Some(format!("function {name}() {{ [native code] }}")),
        _ => None,
    }
}

/// `table[name]` of a plain object literal: its own entry, else what it inherits.
pub fn lookup(table: &[(&str, &str)], name: &str) -> Option<String> {
    table.iter().find(|(key, _)| *key == name).map(|(_, value)| value.to_string()).or_else(|| inherited(name))
}
