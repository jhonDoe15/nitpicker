//! SLF4J and Log4j 2 calls whose message placeholders and arguments do not add up.
use crate::java::pmd::coded::constants::{Const, const_value};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_saying;
use regex::Regex;
use std::sync::LazyLock;

static PLACEHOLDER: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"(\{\})|(%(?:[0-9]\$)?(?:[0-9A-Za-z_]+)?(?:[0-9]+)?(?:\.[0-9]+)?[0-9A-Za-z_])").expect("valid pattern")
});

const SLF4J: &[&str] = &["trace", "debug", "info", "warn", "error"];
const LOG4J: &[&str] = &["trace", "debug", "info", "warn", "error", "fatal", "all"];
const STRUCTURED: &[&str] = &["a", "array", "defer", "e", "entries", "f", "fields", "keyValue", "kv", "r", "raw", "v", "value"];

fn placeholders(text: &str) -> usize {
    PLACEHOLDER.find_iter(text).filter(|found| !matches!(found.as_str(), "%%" | "%n")).count()
}

fn text_value(ctx: &Ctx, id: u32) -> Option<String> {
    match const_value(ctx, id) {
        Ok(Some(Const::Text(text))) => Some(text),
        _ => None,
    }
}

fn expected(ctx: &Ctx, message: u32) -> Option<usize> {
    if let Some(text) = text_value(ctx, message) {
        return Some(placeholders(&text));
    }
    if !matches!(ctx.name(message), "VariableAccess" | "FieldAccess") {
        return None;
    }
    let reaching = ctx.flow().reaching_definitions(ctx, message)?;
    let [rhs] = reaching.as_slice() else { return None };
    ctx.is_expression(*rhs).then(|| text_value(ctx, *rhs)).flatten().map(|text| placeholders(&text))
}

fn logger_call(ctx: &Ctx, call: u32) -> bool {
    let name = ctx.method_name(call);
    ctx.qualifier(call).is_some_and(|on| {
        (ctx.type_is(on, "org.slf4j.Logger") && SLF4J.contains(&name.as_str()))
            || (ctx.type_is(on, "org.apache.logging.log4j.Logger") && LOG4J.contains(&name.as_str()))
    })
}

fn structured(ctx: &Ctx, argument: u32) -> bool {
    ctx.is(argument, "MethodCall")
        && (ctx.qualifier(argument).is_some_and(|on| ctx.type_is(on, "net.logstash.logback.argument.StructuredArguments"))
            || STRUCTURED.contains(&ctx.method_name(argument).as_str()))
}

pub fn invalid_log_message_format(ctx: &Ctx, out: &mut Vec<Hit>) {
    for &call in ctx.all("MethodCall") {
        if !logger_call(ctx, call) {
            continue;
        }
        let arguments = ctx.arguments(call);
        let Some(position) = arguments.iter().position(|argument| ctx.type_is(*argument, "java.lang.String")) else {
            continue;
        };
        let Some(expected) = expected(ctx, arguments[position]) else { continue };
        let mut provided = arguments.len() - (position + 1);
        let last = arguments[arguments.len() - 1];
        let initializer = ctx.is(last, "ArrayAllocation").then(|| ctx.kid(last, "ArrayInitializer")).flatten();
        if let (1, Some(initializer)) = (provided, initializer) {
            provided = ctx.kids(initializer).len();
        } else if ctx.type_is(last, "java.lang.Throwable") && provided > expected {
            provided -= 1;
        }
        if provided > expected {
            let removable = provided - expected;
            let removed = arguments.iter().rev().take(removable).take_while(|argument| structured(ctx, **argument)).count();
            provided -= removed;
        }
        let kind = if provided < expected {
            "Missing arguments,"
        } else if provided > expected {
            "Too many arguments,"
        } else {
            continue;
        };
        let noun = if expected > 1 { "arguments" } else { "argument" };
        out.push(hit_saying(call, format!("{kind} expected {expected} {noun} but found {provided}")));
    }
}
