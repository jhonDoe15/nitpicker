//! `no-secret-in-log`: a name that holds a secret, given to a log call or put in an error message.
use super::nodes::{dotted_name, member_name, unwrapped};
use super::operands::secret_operands;
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;
use regex::Regex;
use std::sync::LazyLock;

const RULE: &str = "no-secret-in-log";
const LOG_METHODS: [&str; 13] =
    ["trace", "debug", "info", "warn", "warning", "error", "fatal", "log", "verbose", "silly", "notice", "critical", "child"];
const STREAMS: [&str; 2] = ["process.stdout", "process.stderr"];
static LOGGER_NAME: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new("(?i-u:^(?:console|logger|log|logging|winston|pino|bunyan|consola|signale)$|logger$)").expect("pattern")
});
static ERROR_TYPE: LazyLock<Regex> = LazyLock::new(|| Regex::new("(?:Error|Exception)$").expect("pattern"));

fn logger_owner(owner: Node) -> bool {
    let name = unwrapped(owner);
    if name.is("Identifier") {
        return name.name().is_some_and(|name| LOGGER_NAME.is_match(&name));
    }
    name.is("MemberExpression") && LOGGER_NAME.is_match(&member_name(name).unwrap_or_default())
}

fn is_log_call(call: Node) -> bool {
    let Some(callee) = call.node("callee").map(unwrapped).filter(|callee| callee.is("MemberExpression")) else { return false };
    let method = member_name(callee);
    let Some(object) = callee.node("object") else { return false };
    if dotted_name(object).is_some_and(|object| STREAMS.contains(&object.as_str())) {
        return method.as_deref() == Some("write");
    }
    method.is_some_and(|method| LOG_METHODS.contains(&method.as_str())) && logger_owner(object)
}

fn is_error_construction(node: Node) -> bool {
    let name = node.node("callee").and_then(dotted_name);
    name.is_some_and(|name| name.rsplit('.').next().is_some_and(|last| ERROR_TYPE.is_match(last)))
}

pub fn check(context: &mut Context) {
    let Some((view, _)) = context.estree else { return };
    let text = context.file.text;
    let mut found = Vec::new();
    for node in view.nodes() {
        let checked = (node.is("CallExpression") && is_log_call(node)) || (node.is("NewExpression") && is_error_construction(node));
        if !checked {
            continue;
        }
        for operand in node.nodes("arguments").into_iter().flat_map(secret_operands) {
            let named = if operand.is("Property") { operand.node("key").unwrap_or(operand) } else { operand };
            let name = &text[named.start() as usize..named.end() as usize];
            found.push((operand.start(), operand.end(), format!("Log that `{name}` is set, or a masked tail, instead of the secret itself.")));
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
