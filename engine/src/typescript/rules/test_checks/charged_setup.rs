//! `no-first-test-charged-setup`: a test or `beforeEach` that fills a module-level variable lazily from a call, so
//! that whichever test runs first pays for the setup.
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::variable_of;
use crate::typescript::rules::support::scope::{DefKind, ScopeKind, Scopes};
use crate::typescript::rules::support::view::{Node, Value};
use crate::typescript::rules::test_assertions::unowned_async::nodes::root_name;
use crate::typescript::rules::test_quality::runner_words::runner_word;
use crate::typescript::rules::test_runtime::per_test::per_test_reports;

const RULE: &str = "no-first-test-charged-setup";
const CHEAP_CALL_ROOTS: [&str; 12] = ["path", "Math", "Object", "JSON", "Array", "String", "Number", "Boolean", "Symbol", "BigInt", "Date", "URL"];

fn is_named(node: Option<Node>, name: &str) -> bool {
    node.is_some_and(|node| node.is("Identifier") && node.name().as_deref() == Some(name))
}

fn operator(node: Node) -> Option<String> {
    node.text("operator").map(|operator| operator.into_owned())
}

/// `moduleVariableKind(...)` is a kind other than `const`: one `var`, `let` or `using` declaration at module level.
fn is_module_level_mutable(scopes: &Scopes, identifier: Node) -> bool {
    let Some(variable) = variable_of(scopes, identifier) else { return false };
    let at_module = scopes.scope_of(variable).is_some_and(|(kind, _)| matches!(kind, ScopeKind::Module | ScopeKind::Global));
    let definitions = scopes.defs(variable);
    let [definition] = definitions.as_slice() else { return false };
    let kind = definition.node.parent().and_then(|declaration| declaration.text("kind"));
    at_module && definition.kind == DefKind::Variable && kind.is_some_and(|kind| kind != "const")
}

fn is_nullish(node: Option<Node>) -> bool {
    let null = node.is_some_and(|node| node.is("Literal") && node.get("value") == Value::Null && node.text("raw").as_deref() == Some("null"));
    null || is_named(node, "undefined")
}

fn compares_to_nullish(test: Node, name: &str, operators: &[&str]) -> bool {
    if !test.is("BinaryExpression") || !operator(test).is_some_and(|operator| operators.contains(&operator.as_str())) {
        return false;
    }
    let (left, right) = (test.node("left"), test.node("right"));
    (is_named(left, name) && is_nullish(right)) || (is_named(right, name) && is_nullish(left))
}

fn is_empty_check(test: Node, name: &str) -> bool {
    if test.is("UnaryExpression") && operator(test).as_deref() == Some("!") {
        return is_named(test.node("argument"), name);
    }
    compares_to_nullish(test, name, &["==", "==="])
}

fn is_present_check(test: Node, name: &str) -> bool {
    is_named(Some(test), name) || compares_to_nullish(test, name, &["!=", "!=="])
}

fn returns(statement: Option<Node>) -> bool {
    let Some(statement) = statement else { return false };
    statement.is("ReturnStatement") || (statement.is("BlockStatement") && statement.nodes("body").last().is_some_and(|last| last.is("ReturnStatement")))
}

fn is_guarded_by_empty_check(statement: Node, name: &str) -> bool {
    let Some(container) = statement.parent() else { return false };
    let branch = if container.is("BlockStatement") { container } else { statement };
    let conditional = branch.parent();
    if let Some(conditional) = conditional.filter(|conditional| conditional.is("IfStatement") && conditional.node("consequent") == Some(branch)) {
        return conditional.node("test").is_some_and(|test| is_empty_check(test, name));
    }
    if !container.is("BlockStatement") {
        return false;
    }
    let body = container.nodes("body");
    let before = &body[..body.iter().position(|item| *item == statement).unwrap_or(body.len())];
    before.iter().any(|earlier| {
        earlier.is("IfStatement")
            && earlier.get("alternate") == Value::Null
            && returns(earlier.node("consequent"))
            && earlier.node("test").is_some_and(|test| is_present_check(test, name))
    })
}

fn logical_memo_target(parent: Node) -> Option<Node> {
    let assignment = parent.parent().filter(|assignment| assignment.is("AssignmentExpression"))?;
    let left = assignment.node("left").filter(|left| left.is("Identifier"))?;
    let memo = operator(assignment).as_deref() == Some("=")
        && matches!(operator(parent).as_deref(), Some("??" | "||"))
        && is_named(parent.node("left"), &left.name()?);
    memo.then_some(left)
}

fn assigned_memo_target(parent: Node) -> Option<Node> {
    let left = parent.node("left").filter(|left| left.is("Identifier"))?;
    let operator = operator(parent);
    if matches!(operator.as_deref(), Some("??=" | "||=")) {
        return Some(left);
    }
    let statement = parent.parent()?;
    let guarded = operator.as_deref() == Some("=") && statement.is("ExpressionStatement") && is_guarded_by_empty_check(statement, &left.name()?);
    guarded.then_some(left)
}

fn memo_target(value: Node) -> Option<Node> {
    let parent = value.parent()?;
    if parent.is("LogicalExpression") && parent.node("right") == Some(value) {
        return logical_memo_target(parent);
    }
    if !parent.is("AssignmentExpression") || parent.node("right") != Some(value) {
        return None;
    }
    assigned_memo_target(parent)
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut names: Vec<((u32, u32), String)> = Vec::new();
    let found = per_test_reports(view, scopes, |node| {
        if !node.is("CallExpression") {
            return false;
        }
        let root = node.node("callee").and_then(root_name);
        if root.is_some_and(|root| CHEAP_CALL_ROOTS.contains(&root.as_str())) {
            return false;
        }
        let stored = node.parent().filter(|parent| parent.is("AwaitExpression")).unwrap_or(node);
        let Some(target) = memo_target(stored).filter(|target| is_module_level_mutable(scopes, *target)) else { return false };
        names.push(((node.start(), node.end()), target.name().map(|name| name.into_owned()).unwrap_or_default()));
        true
    });
    let hook = runner_word(context, RULE, "shared-setup-hook").to_string();
    for node in found {
        let name = names.iter().find(|(span, _)| *span == (node.start(), node.end())).map(|(_, name)| name.clone()).unwrap_or_default();
        let message = format!("\"{name}\" is memoized lazily at module level and filled by a call, so whichever test runs first pays for its setup, reports show that test as slow, and test order starts to matter. Compute it once in {hook} and let tests read it. An exception fits only when the setup is cheap or the lazy memo is intended.");
        context.report_range(RULE, node.start(), Some(node.end()), message);
    }
}
