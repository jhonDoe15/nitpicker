//! `response-calls.mts`: the statement that hands the request off (a response sent, `next()` called) and the
//! statements after a branch that count as work.
use super::super::walk::{any_below, chain_of, enclosing_function, first_def, name_of, named_member};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;

const RESPONSE_NAMES: [&str; 3] = ["res", "response", "reply"];
const CONTINUATION_NAMES: [&str; 4] = ["next", "callback", "cb", "done"];
const SENDERS: [&str; 7] = ["send", "json", "end", "redirect", "sendStatus", "sendFile", "jsonp"];
const CHAINED: [&str; 7] = ["status", "code", "set", "header", "type", "contentType", "cookie"];
const LOGGERS: [&str; 3] = ["console", "logger", "log"];
const NOT_WORK: [&str; 3] = ["BreakStatement", "ContinueStatement", "EmptyStatement"];

pub struct Handoff {
    pub text: String,
    pub name: String,
}

fn is_parameter(scopes: &Scopes, identifier: Node) -> bool {
    first_def(scopes, identifier).is_some_and(|definition| definition.kind == DefKind::Parameter)
}

fn last_parameter(function: Option<Node>, name: &str) -> bool {
    let last = function.and_then(|function| function.nodes("params").last().copied());
    last.is_some_and(|last| last.is("Identifier") && name_of(Some(last)).as_deref() == Some(name))
}

fn unwrap_call(statement: Node) -> Option<Node> {
    let expression = statement.is("ExpressionStatement").then(|| statement.node("expression")).flatten()?;
    let inner = if expression.is("AwaitExpression") { expression.node("argument")? } else { expression };
    let call = if inner.is("ChainExpression") { inner.node("expression")? } else { inner };
    call.is("CallExpression").then_some(call)
}

fn chained_object(link: Node) -> Option<Node> {
    let inner = link.is("CallExpression").then(|| link.node("callee")).flatten()?;
    let chained = named_member(inner).is_some_and(|name| CHAINED.contains(&name.as_str()));
    chained.then(|| inner.node("object")).flatten()
}

fn response_root(call: Node) -> Option<Node> {
    let callee = call.node("callee")?;
    named_member(callee).filter(|name| SENDERS.contains(&name.as_str()))?;
    let root = chain_of(callee.node("object"), chained_object).last().copied()?;
    let named = root.is("Identifier") && name_of(Some(root)).is_some_and(|name| RESPONSE_NAMES.contains(&name.as_str()));
    named.then_some(root)
}

/// `handoffOf`: what the statement hands the request to, when it sends a response or calls the continuation.
pub fn handoff_of(scopes: &Scopes, statement: Node) -> Option<Handoff> {
    let call = unwrap_call(statement)?;
    let function = enclosing_function(statement);
    if let Some(root) = response_root(call).filter(|root| is_parameter(scopes, *root)) {
        let name = name_of(Some(root))?;
        return Some(Handoff { text: format!("{name} response"), name });
    }
    let callee = call.node("callee").filter(|callee| callee.is("Identifier"))?;
    let name = name_of(Some(callee))?;
    let continues = CONTINUATION_NAMES.contains(&name.as_str()) && last_parameter(function, &name) && is_parameter(scopes, callee);
    continues.then(|| Handoff { text: format!("{name}()"), name })
}

fn is_logging(statement: Node) -> bool {
    let callee = unwrap_call(statement).and_then(|call| call.node("callee"));
    let root = chain_of(callee, |link| link.is("MemberExpression").then(|| link.node("object")).flatten()).last().copied();
    root.is_some_and(|root| root.is("Identifier") && name_of(Some(root)).is_some_and(|name| LOGGERS.contains(&name.as_str())))
}

fn runs_code(expression: Node) -> bool {
    any_below(
        expression,
        |node| node.is("ArrowFunctionExpression") || node.is("FunctionExpression"),
        |node| matches!(node.kind(), "CallExpression" | "NewExpression" | "AwaitExpression"),
    )
}

/// `isRealWork`: a statement after the branch that does something the branch meant to skip.
pub fn is_real_work(statement: Node) -> bool {
    if statement.is("ReturnStatement") {
        return statement.node("argument").is_some_and(runs_code);
    }
    !NOT_WORK.contains(&statement.kind()) && !is_logging(statement)
}
