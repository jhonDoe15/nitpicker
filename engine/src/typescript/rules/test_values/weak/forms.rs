//! `values.mts`, `expect-forms.mts` and `assert-forms.mts` of `no-weak-assertion`: the expectations and `assert`
//! calls that check only presence, non-emptiness or that a call happened.
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_assertions::unowned_async::nodes::property_name;
use crate::typescript::rules::test_checks::{is_expect_call, member_links};

#[derive(Clone, Copy, PartialEq, Debug)]
pub enum Family {
    Presence(&'static str),
    NonEmpty,
    WildcardCall,
}

pub struct Expectation<'v> {
    pub property: Option<Node<'v>>,
    pub path: String,
    pub subject: Option<Node<'v>>,
    pub args: Vec<Option<Node<'v>>>,
    matcher: String,
    negated: bool,
}

pub struct AssertForm<'v> {
    pub family: Family,
    pub narrowed: Option<Node<'v>>,
}

const LENGTH_NAMES: [&str; 2] = ["length", "size"];
const MODIFIERS: [&str; 3] = ["not", "resolves", "rejects"];
const EQUALITY_MATCHERS: [&str; 3] = ["toBe", "toEqual", "toStrictEqual"];
const DEEP_EQUALITY_MATCHERS: [&str; 2] = ["toEqual", "toStrictEqual"];
const CALLED_WITH_MATCHERS: [(&str, usize); 8] = [
    ("toHaveBeenCalledWith", 0),
    ("toBeCalledWith", 0),
    ("toHaveBeenLastCalledWith", 0),
    ("lastCalledWith", 0),
    ("toHaveBeenNthCalledWith", 1),
    ("nthCalledWith", 1),
    ("toHaveBeenCalledExactlyOnceWith", 0),
    ("toHaveBeenCalledOnceWith", 0),
];
const WILDCARD_NAMES: [&str; 2] = ["anything", "any"];
const NOT_EQUAL_METHODS: [&str; 2] = ["notEqual", "notStrictEqual"];

/// `nullishName`.
pub fn nullish_name(node: Option<Node>) -> Option<&'static str> {
    let node = node?;
    if node.is("Literal") && node.get("value") == Value::Null && node.text("raw").as_deref() == Some("null") {
        return Some("null");
    }
    if node.is("Identifier") && node.name().as_deref() == Some("undefined") {
        return Some("undefined");
    }
    let is_void = node.is("UnaryExpression") && node.text("operator").as_deref() == Some("void");
    (is_void && node.node("argument").is_some_and(|argument| argument.is("Literal"))).then_some("undefined")
}

/// `isNumber`.
pub fn is_number(node: Option<Node>, expected: f64) -> bool {
    node.is_some_and(|node| node.is("Literal") && node.get("bigint") == Value::Null && node.get("value") == Value::Number(expected))
}

/// `lengthName`.
pub fn length_name(node: Option<Node>) -> Option<String> {
    let member = node.and_then(|node| if node.is("ChainExpression") { node.node("expression") } else { Some(node) });
    property_name(member).filter(|name| LENGTH_NAMES.contains(&name.as_str()))
}

fn is_empty_literal(node: Option<Node>) -> bool {
    let Some(node) = node else { return false };
    match node.kind() {
        "ArrayExpression" => node.list("elements").is_empty(),
        "Literal" => matches!(node.get("value"), Value::Text(..)) && node.text("value").as_deref() == Some(""),
        "TemplateLiteral" => {
            let first = node.nodes("quasis").first().map(|quasi| quasi.get("value"));
            let cooked = match first {
                Some(Value::Node(at)) => node.view.at(at).text("cooked"),
                _ => None,
            };
            node.list("expressions").is_empty() && cooked.as_deref() == Some("")
        }
        _ => false,
    }
}

/// `nonEmptyComparison`: the length side of `length > 0`, `0 < size`, `length >= 1`, `length !== 0` and alike.
pub fn non_empty_comparison(node: Option<Node>) -> Option<Node> {
    let node = node.filter(|node| node.is("BinaryExpression"))?;
    let operator = node.text("operator")?;
    let (left, right) = (node.node("left"), node.node("right"));
    let ordered = match operator.as_ref() {
        ">" => Some((true, 0.0)),
        "<" => Some((false, 0.0)),
        ">=" => Some((true, 1.0)),
        "<=" => Some((false, 1.0)),
        _ => None,
    };
    if let Some((length_on_left, bound)) = ordered {
        let (subject, other) = if length_on_left { (left, right) } else { (right, left) };
        return (length_name(subject).is_some() && is_number(other, bound)).then_some(subject).flatten();
    }
    if !matches!(operator.as_ref(), "!==" | "!=") {
        return None;
    }
    let (subject, bound) = if length_name(left).is_none() { (right, left) } else { (left, right) };
    (length_name(subject).is_some() && is_number(bound, 0.0)).then_some(subject).flatten()
}

/// `presenceComparison`: the absent value and the compared side of `value !== null` and alike.
fn presence_comparison(node: Option<Node>) -> Option<(&'static str, Option<Node>)> {
    let node = node.filter(|node| node.is("BinaryExpression") && matches!(node.text("operator").as_deref(), Some("!==" | "!=")))?;
    let (left, right) = (node.node("left"), node.node("right"));
    let absent = nullish_name(right).or_else(|| nullish_name(left))?;
    Some((absent, if nullish_name(right).is_none() { right } else { left }))
}

fn parse_expectation(call: Node) -> Option<Expectation> {
    let callee = call.node("callee").filter(|callee| callee.is("MemberExpression"))?;
    let matcher = property_name(Some(callee))?;
    let links = member_links(callee);
    let root = links.last().copied();
    let modifiers: Vec<Option<String>> = links[..links.len().saturating_sub(1)].iter().map(|link| property_name(Some(*link))).collect();
    let known = modifiers.iter().all(|name| name.as_deref().is_some_and(|name| MODIFIERS.contains(&name)));
    if !(root.is_some_and(|root| root.is("CallExpression")) && is_expect_call(root) && known) {
        return None;
    }
    let mut path: Vec<String> = modifiers.iter().rev().flatten().cloned().collect();
    path.push(matcher.clone());
    Some(Expectation {
        negated: modifiers.iter().any(|name| name.as_deref() == Some("not")),
        path: path.join("."),
        subject: root.and_then(|root| root.list("arguments").first().copied().flatten()),
        property: callee.node("property"),
        args: call.list("arguments"),
        matcher,
    })
}

fn first_arg<'v>(expectation: &Expectation<'v>) -> Option<Node<'v>> {
    expectation.args.first().copied().flatten()
}

fn is_wildcard(node: Option<Node>) -> bool {
    let Some(callee) = node.filter(|node| node.is("CallExpression")).and_then(|node| node.node("callee")) else { return false };
    let object = callee.node("object").filter(|object| callee.is("MemberExpression") && object.is("Identifier"));
    object.is_some_and(|object| object.name().as_deref() == Some("expect"))
        && property_name(Some(callee)).is_some_and(|name| WILDCARD_NAMES.contains(&name.as_str()))
}

fn has(set: &[&str], name: &str) -> bool {
    set.contains(&name)
}

fn is_non_empty_check(expectation: &Expectation) -> bool {
    let (matcher, negated, expected) = (expectation.matcher.as_str(), expectation.negated, first_arg(expectation));
    let empty = if negated && matcher == "toHaveLength" { is_number(expected, 0.0) } else { negated && has(&DEEP_EQUALITY_MATCHERS, matcher) && is_empty_literal(expected) };
    let length_check = length_name(expectation.subject).is_some()
        && match (negated, matcher) {
            (false, "toBeGreaterThan") => is_number(expected, 0.0),
            (false, "toBeGreaterThanOrEqual") => is_number(expected, 1.0),
            _ => negated && has(&EQUALITY_MATCHERS, matcher) && is_number(expected, 0.0),
        };
    let true_comparison = !negated
        && has(&EQUALITY_MATCHERS, matcher)
        && expected.is_some_and(|expected| expected.is("Literal") && expected.get("value") == Value::Bool(true))
        && non_empty_comparison(expectation.subject).is_some();
    empty || length_check || true_comparison
}

fn wildcard_call(expectation: &Expectation) -> bool {
    let Some((_, skipped)) = CALLED_WITH_MATCHERS.iter().find(|(name, _)| *name == expectation.matcher) else { return false };
    let checked = expectation.args.get(*skipped..).unwrap_or_default();
    !expectation.negated && !checked.is_empty() && checked.iter().all(|argument| is_wildcard(*argument))
}

/// `expectForm`.
pub fn expect_form(call: Node) -> Option<(Family, Expectation)> {
    let expectation = parse_expectation(call)?;
    let presence = nullish_name(first_arg(&expectation)).filter(|_| expectation.negated && has(&EQUALITY_MATCHERS, &expectation.matcher));
    let family = if let Some(absent) = presence {
        Family::Presence(absent)
    } else if is_non_empty_check(&expectation) {
        Family::NonEmpty
    } else if wildcard_call(&expectation) {
        Family::WildcardCall
    } else {
        return None;
    };
    Some((family, expectation))
}

fn is_assert_object(node: Option<Node>) -> bool {
    let base = node.and_then(|node| if node.is("MemberExpression") && property_name(Some(node)).as_deref() == Some("strict") { node.node("object") } else { Some(node) });
    base.is_some_and(|base| base.is("Identifier") && base.name().as_deref() == Some("assert"))
}

fn assert_method(callee: Node) -> Option<String> {
    if callee.is("Identifier") {
        return (callee.name().as_deref() == Some("assert")).then(|| "ok".to_string());
    }
    if callee.is("MemberExpression") && is_assert_object(callee.node("object")) { property_name(Some(callee)) } else { None }
}

/// `assertForm`.
pub fn assert_form(call: Node) -> Option<AssertForm> {
    let method = assert_method(call.node("callee")?)?;
    let args = call.list("arguments");
    let (first, second) = (args.first().copied().flatten(), args.get(1).copied().flatten());
    if method == "ok" {
        if let Some((absent, subject)) = presence_comparison(first) {
            return Some(AssertForm { family: Family::Presence(absent), narrowed: subject });
        }
        let non_empty = non_empty_comparison(first).is_some() || length_name(first).is_some();
        return non_empty.then_some(AssertForm { family: Family::NonEmpty, narrowed: None });
    }
    if !NOT_EQUAL_METHODS.contains(&method.as_str()) {
        return None;
    }
    if let Some(absent) = nullish_name(second).or_else(|| nullish_name(first)) {
        return Some(AssertForm { family: Family::Presence(absent), narrowed: None });
    }
    let zero_length = (length_name(first).is_some() && is_number(second, 0.0)) || (length_name(second).is_some() && is_number(first, 0.0));
    zero_length.then_some(AssertForm { family: Family::NonEmpty, narrowed: None })
}
