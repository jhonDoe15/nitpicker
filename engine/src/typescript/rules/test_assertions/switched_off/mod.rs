//! `no-switched-off-tests`: `todo` tests, literal `skipIf`/`runIf` conditions, fixed `skip`/`todo` options and an
//! unconditional `skip()` or `todo()` in a test body.
mod literal_condition;

use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_quality::test_calls::{callback_of, is_case_call, is_suite_call, is_test_function_chain};
use literal_condition::is_literal_condition;

const RULE: &str = "no-switched-off-tests";
const CONDITIONAL_SKIPS: &[&str] = &["skipIf", "runIf"];
const SWITCH_OFFS: &[&str] = &["skip", "todo"];
const TODO: &str = "Do not leave a `todo` test: write the test, or delete the stub.";
const LITERAL_CONDITION: &str = "A literal condition switches the test off for good. Delete the test or make it run; a real platform condition such as `process.platform === \"win32\"` is allowed.";
const FIXED_OPTION: &str = "A fixed `skip` or `todo` option switches the test off for good. Delete the test or make it run; a real condition such as `{ skip: process.platform === \"win32\" }` is allowed.";
const UNCONDITIONAL_SKIP: &str = "An unconditional `skip()` or `todo()` in the test body switches the test off for good. Delete the test or make it run; a skip under a real condition such as `if (process.platform === \"win32\") { t.skip(); }` is allowed.";

struct Names {
    context: Option<String>,
    destructured: Vec<String>,
}

fn name(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn is_fixed_switch_off(value: Node) -> bool {
    if value.is("TemplateLiteral") {
        return value.nodes("expressions").is_empty();
    }
    if !value.is("Literal") {
        return false;
    }
    if value.get("regex") != Value::Null {
        return true;
    }
    if value.get("bigint") != Value::Null {
        return value.text("bigint").is_some_and(|digits| digits.trim_start_matches('0') != "");
    }
    match value.get("value") {
        Value::Bool(flag) => flag,
        Value::Number(number) => number != 0.0 && !number.is_nan(),
        text @ Value::Text(..) => value.view.utf16(text).is_some_and(|text| !text.is_empty()),
        _ => false,
    }
}

fn is_reason(argument: Option<Node>) -> bool {
    argument.is_none_or(|argument| {
        (argument.is("Literal") && matches!(argument.get("value"), Value::Text(..))) || argument.is("TemplateLiteral")
    })
}

fn is_subtest_call(node: Node) -> bool {
    let callee = node.node("callee");
    callee.is_some_and(|callee| {
        callee.is("MemberExpression")
            && !callee.flag("computed")
            && callee.node("object").is_some_and(|object| object.is("Identifier"))
            && name(callee.node("property")).as_deref() == Some("test")
    }) && callback_of(node).is_some()
}

fn property_key(property: Node) -> Option<String> {
    let key = property.node("key")?;
    if key.is("Literal") {
        return Some(if matches!(key.get("value"), Value::Text(..)) { key.text("value")?.into_owned() } else { String::new() });
    }
    name(Some(key))
}

fn is_switch_off_key(property: Node) -> bool {
    property_key(property).is_some_and(|key| SWITCH_OFFS.contains(&key.as_str()))
}

fn switched_off_option(call: Node) -> Option<Node> {
    let options = call.nodes("arguments").into_iter().filter(|argument| argument.is("ObjectExpression"));
    options.flat_map(|options| options.nodes("properties")).filter(|property| property.is("Property")).find(|property| {
        !property.flag("computed") && is_switch_off_key(*property) && property.node("value").is_some_and(is_fixed_switch_off)
    })
}

fn context_names(callback: Node) -> Names {
    let first = callback.list("params").first().copied().flatten();
    if let Some(first) = first.filter(|first| first.is("Identifier")) {
        return Names { context: name(Some(first)), destructured: Vec::new() };
    }
    let properties = first.filter(|first| first.is("ObjectPattern")).map(|pattern| pattern.nodes("properties")).unwrap_or_default();
    let destructured = properties
        .into_iter()
        .filter(|property| property.is("Property") && is_switch_off_key(*property))
        .filter_map(|property| property.node("value").filter(|value| value.is("Identifier")))
        .filter_map(|value| name(Some(value)))
        .collect();
    Names { context: None, destructured }
}

fn is_switch_off_call(statement: Node, names: &Names) -> bool {
    let call = statement.node("expression").filter(|call| statement.is("ExpressionStatement") && call.is("CallExpression"));
    let Some(call) = call else { return false };
    if !is_reason(call.list("arguments").first().copied().flatten()) {
        return false;
    }
    let Some(callee) = call.node("callee") else { return false };
    if callee.is("Identifier") {
        return name(Some(callee)).is_some_and(|called| names.destructured.contains(&called));
    }
    let object = callee.node("object");
    callee.is("MemberExpression")
        && !callee.flag("computed")
        && name(callee.node("property")).is_some_and(|property| SWITCH_OFFS.contains(&property.as_str()))
        && object.is_some_and(|object| {
            object.is("ThisExpression") || (object.is("Identifier") && names.context.is_some() && name(Some(object)) == names.context)
        })
}

fn body_switch_off(call: Node) -> Option<Node> {
    let callback = callback_of(call)?;
    let body = callback.node("body").filter(|body| body.is("BlockStatement"))?;
    let names = context_names(callback);
    body.nodes("body").into_iter().find(|statement| is_switch_off_call(*statement, &names))
}

fn literal_skip(node: Node) -> Option<Node> {
    let callee = node.node("callee").filter(|callee| callee.is("MemberExpression") && !callee.flag("computed"))?;
    let property = callee.node("property")?;
    let conditional = name(Some(property)).is_some_and(|name| CONDITIONAL_SKIPS.contains(&name.as_str()));
    let chained = callee.node("object").is_some_and(is_test_function_chain);
    (conditional && chained && is_literal_condition(node.list("arguments").first().copied().flatten())).then_some(property)
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let mut found: Vec<(Node, &str)> = Vec::new();
    for node in view.nodes() {
        if node.is("MemberExpression") && !node.flag("computed") && node.node("object").is_some_and(is_test_function_chain) {
            if let Some(property) = node.node("property").filter(|property| name(Some(*property)).as_deref() == Some("todo")) {
                found.push((property, TODO));
            }
        }
        if !node.is("CallExpression") {
            continue;
        }
        if let Some(property) = literal_skip(node) {
            found.push((property, LITERAL_CONDITION));
        }
        if !(is_case_call(node) || is_suite_call(node) || is_subtest_call(node)) {
            continue;
        }
        if let Some(option) = switched_off_option(node) {
            found.push((option, FIXED_OPTION));
        }
        if let Some(statement) = body_switch_off(node) {
            found.push((statement, UNCONDITIONAL_SKIP));
        }
    }
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message.to_string());
    }
}
