//! `no-float-equality-in-tests`: an exact equality assertion against a non-integral float literal.
use crate::typescript::rules::Context;
use crate::typescript::rules::signatures::{ASSERTIONS, unwrap};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_assertions::unowned_async::nodes::{ModuleBindings, module_bindings};
use crate::typescript::rules::test_quality::test_calls::chain_of;

const RULE: &str = "no-float-equality-in-tests";
const MESSAGE: &str = "A float literal compared for exact equality fails on rounding error. Use `toBeCloseTo(0.1)`, `expect.closeTo(0.1)` inside the expected value, chai `closeTo`, or `assert.ok(Math.abs(actual - 0.1) < tolerance)`. An exception fits only when the value is exact by construction.";
const MATCHERS: [(&str, bool); 8] =
    [("toBe", false), ("toEqual", true), ("toStrictEqual", true), ("equal", false), ("equals", false), ("eq", false), ("eql", true), ("eqls", true)];
const ASSERT_FUNCTIONS: [(&str, bool); 8] = [
    ("equal", false),
    ("strictEqual", false),
    ("notEqual", false),
    ("notStrictEqual", false),
    ("deepEqual", true),
    ("deepStrictEqual", true),
    ("notDeepEqual", true),
    ("notDeepStrictEqual", true),
];
const TRUTH_FUNCTIONS: [&str; 5] = ["ok", "isTrue", "isFalse", "isOk", "isNotOk"];
const EQUALITY_OPERATORS: [&str; 4] = ["===", "==", "!==", "!="];
const ASSERT_MODULES: [&str; 6] = ["assert", "node:assert", "assert/strict", "node:assert/strict", "chai", "vitest"];
const ASSERT_ALIASES: [&str; 2] = ["assert", "strict"];
const EXPECT_VARIANTS: [&str; 2] = ["soft", "poll"];
const MODIFIERS: [&str; 8] = ["not", "resolves", "rejects", "to", "be", "been", "is", "deep"];

fn lookup(table: &[(&str, bool)], name: &str) -> Option<bool> {
    table.iter().find(|(known, _)| *known == name).map(|(_, deep)| *deep)
}

fn is_non_integral(node: Node) -> bool {
    let literal = unwrap(node, ASSERTIONS);
    let signed = literal.is("UnaryExpression") && matches!(literal.text("operator").as_deref(), Some("-" | "+"));
    let operand = if signed { literal.node("argument").map(|argument| unwrap(argument, ASSERTIONS)) } else { Some(literal) };
    let Some(operand) = operand.filter(|operand| operand.is("Literal")) else { return false };
    matches!(operand.get("value"), Value::Number(value) if value.is_finite() && value.fract() != 0.0)
}

fn nested_values(node: Node) -> Vec<Node> {
    match node.kind() {
        "ArrayExpression" => node.list("elements").into_iter().flatten().filter(|element| !element.is("SpreadElement")).collect(),
        "ObjectExpression" => node.nodes("properties").into_iter().filter(|property| property.is("Property")).filter_map(|property| property.node("value")).collect(),
        _ => Vec::new(),
    }
}

fn first_float(candidates: Vec<Node>, deep: bool) -> Option<Node> {
    let mut pending = candidates;
    let mut index = 0;
    while index < pending.len() {
        let node = pending[index];
        if is_non_integral(node) {
            return Some(node);
        }
        if deep {
            pending.extend(nested_values(unwrap(node, ASSERTIONS)));
        }
        index += 1;
    }
    None
}

fn condition_parts(node: Node) -> Vec<Node> {
    match node.kind() {
        "LogicalExpression" => [node.node("left"), node.node("right")].into_iter().flatten().collect(),
        "CallExpression" => {
            let arguments = node.nodes("arguments");
            let bodies = arguments.iter().filter(|argument| argument.is("ArrowFunctionExpression") && argument.flag("expression")).filter_map(|argument| argument.node("body"));
            let mut parts: Vec<Node> = node.node("callee").into_iter().collect();
            parts.extend(arguments.iter().filter(|argument| !argument.is("SpreadElement")).copied());
            parts.extend(bodies);
            parts
        }
        "MemberExpression" => node.node("object").into_iter().collect(),
        "UnaryExpression" if node.text("operator").as_deref() == Some("!") => node.node("argument").into_iter().collect(),
        _ => Vec::new(),
    }
}

fn compared_float(expression: Node) -> Option<Node> {
    let mut pending = vec![expression];
    let mut index = 0;
    while index < pending.len() {
        let current = unwrap(pending[index], ASSERTIONS);
        let equality = current.is("BinaryExpression") && current.text("operator").is_some_and(|operator| EQUALITY_OPERATORS.contains(&operator.as_ref()));
        if equality && let Some(literal) = [current.node("left"), current.node("right")].into_iter().flatten().find(|side| is_non_integral(*side)) {
            return Some(literal);
        }
        pending.extend(condition_parts(current));
        index += 1;
    }
    None
}

/// A non-computed member with an identifier property, and that property's name.
fn member_property(node: Option<Node>) -> Option<String> {
    let node = node.filter(|node| node.is("MemberExpression") && !node.flag("computed"))?;
    node.node("property").filter(|property| property.is("Identifier")).and_then(|property| property.name()).map(|name| name.into_owned())
}

fn is_named(node: Option<Node>, wanted: &str) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().as_deref() == Some(wanted))
}

fn is_expect_call(node: Option<Node>) -> bool {
    let Some(callee) = node.filter(|node| node.is("CallExpression")).and_then(|node| node.node("callee")) else { return false };
    if is_named(Some(callee), "expect") {
        return true;
    }
    member_property(Some(callee)).is_some_and(|property| {
        (is_named(callee.node("object"), "expect") && EXPECT_VARIANTS.contains(&property.as_str())) || property == "expect"
    })
}

fn is_modifier_link(node: Node) -> bool {
    member_property(Some(node)).is_some_and(|property| MODIFIERS.contains(&property.as_str()))
}

fn expect_modifiers(callee: Node) -> Option<Vec<String>> {
    let links = chain_of(callee.node("object"), |current| if is_modifier_link(current) { current.node("object") } else { None });
    is_expect_call(links.last().copied()).then(|| links.into_iter().filter(|link| is_modifier_link(*link)).filter_map(|link| member_property(Some(link))).collect())
}

fn is_assert_owner(node: Node, bindings: &ModuleBindings) -> bool {
    let chain = chain_of(Some(node), |current| if member_property(Some(current)).as_deref() == Some("strict") { current.node("object") } else { None });
    let base = chain.last().copied().unwrap_or(node);
    if base.is("Identifier") {
        let name = base.name().map(|name| name.into_owned()).unwrap_or_default();
        let alias = bindings.named.get(&name).is_some_and(|imported| ASSERT_ALIASES.contains(&imported.as_str()));
        return name == "assert" || bindings.namespaces.contains(&name) || alias;
    }
    member_property(Some(base)).as_deref() == Some("assert")
}

fn assert_function_name(callee: Node, bindings: &ModuleBindings) -> Option<String> {
    if callee.is("Identifier") {
        return bindings.named.get(callee.name()?.as_ref()).cloned();
    }
    let owner = callee.node("object").filter(|object| is_assert_owner(*object, bindings));
    member_property(Some(callee)).filter(|_| owner.is_some())
}

fn expect_float(call: Node) -> Option<Node> {
    let callee = call.node("callee")?;
    let matcher = member_property(Some(callee))?;
    let deep_matcher = lookup(&MATCHERS, &matcher)?;
    let modifiers = expect_modifiers(callee)?;
    let deep = deep_matcher || modifiers.iter().any(|link| link == "deep");
    first_float(call.nodes("arguments").into_iter().take(1).collect(), deep)
}

fn truth_float<'v>(call: Node<'v>, callee: Node<'v>, bindings: &ModuleBindings) -> Option<Node<'v>> {
    let first = call.list("arguments").first().copied().flatten().filter(|first| !first.is("SpreadElement"))?;
    let assert_call = callee.is("Identifier") && is_assert_owner(callee, bindings);
    let truth = assert_function_name(callee, bindings).is_some_and(|name| TRUTH_FUNCTIONS.contains(&name.as_str()));
    (is_expect_call(Some(call)) || assert_call || truth).then(|| compared_float(first)).flatten()
}

fn assert_float<'v>(call: Node<'v>, bindings: &ModuleBindings) -> Option<Node<'v>> {
    let callee = call.node("callee")?;
    let deep = assert_function_name(callee, bindings).and_then(|name| lookup(&ASSERT_FUNCTIONS, &name));
    match deep {
        Some(deep) => first_float(call.nodes("arguments").into_iter().take(2).collect(), deep),
        None => truth_float(call, callee, bindings),
    }
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let bindings = module_bindings(view.program(), &ASSERT_MODULES);
    let found: Vec<(u32, u32)> = view
        .nodes()
        .filter(|node| node.is("CallExpression"))
        .filter_map(|call| expect_float(call).or_else(|| assert_float(call, &bindings)))
        .map(|literal| (literal.start(), literal.end()))
        .collect();
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.to_string());
    }
}
