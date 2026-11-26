//! Log calls below the guarded levels that compute their message without a guard.
use crate::java::pmd::coded::constants::folded_value;
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit;
use std::collections::HashMap;

const LOG_LEVELS: &[&str] =
    &["trace", "debug", "info", "warn", "error", "log", "finest", "finer", "fine", "info", "warning", "severe"];
const GUARD_METHODS: &[&str] =
    &["isTraceEnabled", "isDebugEnabled", "isInfoEnabled", "isWarnEnabled", "isErrorEnabled", "isLoggable"];
const LITERALS: &[&str] = &["StringLiteral", "NumericLiteral", "CharLiteral", "BooleanLiteral", "NullLiteral"];
const PERMITTED: &[&str] =
    &["LambdaExpression", "VariableAccess", "ThisExpression", "MethodReference", "FieldAccess", "ArrayAccess"];

fn guards_by_level(ctx: &Ctx) -> Option<HashMap<String, String>> {
    let levels = ctx.property_list("logLevels", LOG_LEVELS);
    let mut guards = ctx.property_list("guardsMethods", GUARD_METHODS);
    if guards.is_empty() && !levels.is_empty() {
        return None;
    }
    while levels.len() > guards.len() {
        guards.push(guards.last()?.clone());
    }
    if levels.len() != guards.len() {
        return None;
    }
    let mut map: HashMap<String, String> = HashMap::new();
    for (level, guard) in levels.into_iter().zip(guards) {
        map.entry(level).and_modify(|known| *known = format!("{known}|{guard}")).or_insert(guard);
    }
    Some(map)
}

fn jul_level(ctx: &Ctx, call: u32) -> Option<String> {
    let first = ctx.arguments(call).first().copied()?;
    let named = matches!(ctx.name(first), "VariableAccess" | "FieldAccess");
    (named && ctx.type_is(first, "java.util.logging.Level")).then(|| ctx.text(first, "Name").to_lowercase())
}

fn direct(ctx: &Ctx, id: u32) -> bool {
    let name = ctx.name(id);
    if !LITERALS.contains(&name) && !PERMITTED.contains(&name) {
        return false;
    }
    if !matches!(name, "MethodReference" | "FieldAccess" | "ArrayAccess") {
        return true;
    }
    if name == "ArrayAccess" && !ctx.nth(id, 1).is_some_and(|index| direct(ctx, index)) {
        return false;
    }
    let qualifier = ctx.nth(id, 0).filter(|first| ctx.is_expression(*first) || ctx.is(*first, "TypeExpression"));
    qualifier.is_none_or(|qualifier| ctx.is(qualifier, "TypeExpression") || direct(ctx, qualifier))
}

fn needs_guard(ctx: &Ctx, call: u32) -> bool {
    let arguments = ctx.arguments(call);
    if arguments.is_empty() {
        return false;
    }
    let message_at = usize::from(ctx.method_name(call) == "log");
    let Some(&message) = arguments.get(message_at) else { return false };
    if !direct(ctx, message) && !matches!(folded_value(ctx, message), Ok(Some(_))) {
        return true;
    }
    !arguments.iter().skip(message_at + 1).all(|argument| direct(ctx, *argument))
}

fn has_guard(ctx: &Ctx, call: u32, guards: &str, level: &str) -> bool {
    let Some(found) = ctx.ancestors(call).find(|at| ctx.is(*at, "IfStatement")) else { return false };
    let Some(condition) = ctx.nth(found, 0) else { return false };
    let mut nodes = vec![condition];
    nodes.extend(ctx.descendants(condition));
    nodes.into_iter().filter(|at| ctx.is(*at, "MethodCall")).any(|candidate| {
        let name = ctx.method_name(candidate);
        if !guards.contains(name.as_str()) {
            return false;
        }
        name != "isLoggable" || jul_level(ctx, candidate).as_deref() == Some(level)
    })
}

pub fn guard_log_statement(ctx: &Ctx, out: &mut Vec<Hit>) {
    let Some(guards) = guards_by_level(ctx) else { return };
    for &statement in ctx.all("ExpressionStatement") {
        let Some(call) = ctx.nth(statement, 0).filter(|at| ctx.is(*at, "MethodCall")) else { continue };
        let name = ctx.method_name(call);
        let level = if name == "log" { jul_level(ctx, call) } else { Some(name) };
        let Some((level, guard)) = level.and_then(|level| guards.get(&level).map(|guard| (level, guard))) else {
            continue;
        };
        if needs_guard(ctx, call) && !has_guard(ctx, call, guard, &level) {
            out.push(hit(statement));
        }
    }
}
