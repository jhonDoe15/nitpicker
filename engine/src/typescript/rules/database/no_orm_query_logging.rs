//! `no-orm-query-logging`: ORM options that log every SQL query (`logging`, `logQueryParameters`, `debug`,
//! Prisma `log`, Drizzle `logger`), and Sequelize set up without `logging: false`, which logs by default.
use super::modules::{Family, ModuleScope, callee_label, constructed_name};
use super::options::{
    array_texts, factory_call, has_key, has_opaque_spread, is_condition, is_env_read, is_orm_options, is_switched_on, is_unconditional_function, object_of,
    property_key, text_of,
};
use crate::typescript::rules::Context;
use crate::typescript::rules::security_values::leaves::leaf_values;
use crate::typescript::rules::security_values::{call_name, is_text, is_true, resolved_value, string_value};
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-orm-query-logging";
const MESSAGE: &str = "logs every SQL query: the logs fill with personal data and bound values, and every query pays for the log line. A value guarded by an environment check still logs in every other environment. Turn query logging off (`logging: false`) and log slow queries instead: TypeORM `maxQueryExecutionTime`, Sequelize `benchmark: true` with a logging function that keeps only slow queries, Prisma `log: [{ emit: \"event\", level: \"query\" }]` with a handler that filters by duration, or the database's own slow-query log. An exception fits only for a local debugging script.";
const QUERY_LEVEL: &str = "query";
const LOGGED_LEVELS: [&str; 2] = [QUERY_LEVEL, "all"];
const DEBUG_LEVELS: [&str; 2] = [QUERY_LEVEL, "query-params"];
const POSITIONAL_ONLY_ARITY: usize = 3;
const NEST_ROOT: &str = "SequelizeModule.forRoot";
const NEST_ASYNC_ROOT: &str = "SequelizeModule.forRootAsync";
const WITHOUT_LOGGING_OFF: &str = "` without `logging: false";

fn any_text(texts: Vec<Option<String>>, levels: &[&str]) -> bool {
    texts.into_iter().flatten().any(|text| levels.contains(&text.as_str()))
}

fn is_console_method(leaf: Node) -> bool {
    let object = leaf.node("object").filter(|_| leaf.is("MemberExpression"));
    object.is_some_and(|object| object.is("Identifier") && object.name().as_deref() == Some("console"))
}

fn is_string_like<'s>(scopes: &Scopes<'_, 's>, node: Option<Node<'s>>) -> bool {
    let leaves = leaf_values(scopes, node);
    !leaves.is_empty() && leaves.into_iter().all(|leaf| matches!(leaf.kind(), "Literal" | "TemplateLiteral") || is_env_read(leaf))
}

fn prisma_entry_logs<'s>(scopes: &Scopes<'_, 's>, element: Node<'s>) -> bool {
    if string_value(resolved_value(scopes, Some(element))).as_deref() == Some(QUERY_LEVEL) {
        return true;
    }
    let Some(entry) = object_of(scopes, Some(element)) else { return false };
    if text_of(scopes, entry, "level").as_deref() != Some(QUERY_LEVEL) {
        return false;
    }
    text_of(scopes, entry, "emit").as_deref() == Some("stdout") || !has_key(scopes, entry, "emit")
}

fn is_class_extending(node: Node, name: &str) -> bool {
    let owner = node.ancestors().find(|ancestor| matches!(ancestor.kind(), "ClassDeclaration" | "ClassExpression"));
    let superclass = owner.and_then(|owner| owner.node("superClass"));
    superclass.is_some_and(|superclass| superclass.is("Identifier") && superclass.name().as_deref() == Some(name))
}

fn is_prisma_options(object: Node) -> bool {
    let Some(call) = object.parent() else { return false };
    let first = call.nodes("arguments").first().copied() == Some(object);
    if call.is("NewExpression") && first {
        return call_name(call).as_deref() == Some("PrismaClient");
    }
    let callee = call.node("callee");
    call.is("CallExpression") && callee.is_some_and(|callee| callee.is("Super")) && first && is_class_extending(call, "PrismaClient")
}

fn is_drizzle_options(scope: &ModuleScope, object: Node) -> bool {
    let Some(call) = object.parent().filter(|call| call.is("CallExpression")) else { return false };
    let names = scope.orm_locals("drizzle");
    scope.has(Family::Drizzle) && call.nodes("arguments").contains(&object) && constructed_name(call).is_some_and(|name| names.contains(&name))
}

fn logging_on<'s>(scopes: &Scopes<'_, 's>, value: Option<Node<'s>>) -> bool {
    leaf_values(scopes, value).into_iter().any(|leaf| {
        is_true(leaf)
            || is_text(leaf, "all")
            || is_condition(leaf)
            || is_console_method(leaf)
            || is_unconditional_function(leaf)
            || any_text(array_texts(scopes, leaf), &LOGGED_LEVELS)
    })
}

fn debug_on<'s>(scopes: &Scopes<'_, 's>, value: Option<Node<'s>>) -> bool {
    is_switched_on(scopes, value) || leaf_values(scopes, value).into_iter().any(|leaf| any_text(array_texts(scopes, leaf), &DEBUG_LEVELS))
}

fn prisma_logs_queries<'s>(scopes: &Scopes<'_, 's>, value: Option<Node<'s>>) -> bool {
    leaf_values(scopes, value).into_iter().any(|leaf| {
        let array = resolved_value(scopes, Some(leaf)).filter(|array| array.is("ArrayExpression"));
        array.is_some_and(|array| array.nodes("elements").into_iter().any(|element| prisma_entry_logs(scopes, element)))
    })
}

fn drizzle_logs<'s>(scopes: &Scopes<'_, 's>, value: Option<Node<'s>>) -> bool {
    is_switched_on(scopes, value)
        || leaf_values(scopes, value).into_iter().any(|leaf| leaf.is("NewExpression") && constructed_name(leaf).as_deref() == Some("DefaultLogger"))
}

fn property_logs<'s>(scope: &ModuleScope<'_, '_, 's>, key: &str, object: Node<'s>, value: Option<Node<'s>>) -> bool {
    let scopes = scope.scopes;
    match key {
        "logging" => is_orm_options(scope, object) && logging_on(scopes, value),
        "logQueryParameters" => is_orm_options(scope, object) && is_switched_on(scopes, value),
        "debug" => is_orm_options(scope, object) && debug_on(scopes, value),
        "log" => is_prisma_options(object) && prisma_logs_queries(scopes, value),
        "logger" => is_drizzle_options(scope, object) && drizzle_logs(scopes, value),
        _ => false,
    }
}

fn property_form<'s>(scope: &ModuleScope<'_, '_, 's>, node: Node<'s>) -> Option<String> {
    let key = property_key(node)?;
    let object = node.parent().filter(|object| object.is("ObjectExpression"))?;
    property_logs(scope, &key, object, node.node("value")).then_some(key)
}

fn logs_by_default<'s>(scopes: &Scopes<'_, 's>, object: Node<'s>) -> bool {
    !(has_key(scopes, object, "logging") || has_opaque_spread(scopes, object))
}

/// `optionsArgument` and `logsByDefault`: the options leave `logging` out, or there are none to set it in.
fn constructs_logging<'s>(scopes: &Scopes<'_, 's>, node: Node<'s>) -> bool {
    let arguments = node.list("arguments");
    if arguments.len() == POSITIONAL_ONLY_ARITY {
        return true;
    }
    let last = arguments.last().copied().flatten();
    match object_of(scopes, last) {
        Some(object) => logs_by_default(scopes, object),
        None => arguments.len() == 1 && is_string_like(scopes, last),
    }
}

fn construction_form<'s>(scope: &ModuleScope<'_, '_, 's>, node: Node<'s>) -> Option<String> {
    let form = if node.is("NewExpression") {
        let names = scope.orm_locals("Sequelize");
        let sequelize = scope.has(Family::Sequelize) && constructed_name(node).is_some_and(|name| names.contains(&name));
        sequelize.then_some("new Sequelize(...)")?
    } else {
        (callee_label(node).as_deref() == Some(NEST_ROOT) && node.list("arguments").len() == 1).then_some("SequelizeModule.forRoot(...)")?
    };
    constructs_logging(scope.scopes, node).then(|| format!("{form}{WITHOUT_LOGGING_OFF}"))
}

fn factory_form<'s>(scope: &ModuleScope<'_, '_, 's>, object: Node<'s>) -> Option<String> {
    let call = factory_call(object)?;
    let logs = callee_label(call).as_deref() == Some(NEST_ASYNC_ROOT) && logs_by_default(scope.scopes, object);
    logs.then(|| format!("{NEST_ASYNC_ROOT}(...){WITHOUT_LOGGING_OFF}"))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let scope = ModuleScope::of(view, scopes, context.file.text);
    let mut found = Vec::new();
    for node in view.nodes() {
        let form = match node.kind() {
            "Property" => property_form(&scope, node),
            "ObjectExpression" => factory_form(&scope, node),
            "NewExpression" | "CallExpression" => construction_form(&scope, node),
            _ => None,
        };
        found.extend(form.map(|form| (node.start(), node.end(), form)));
    }
    for (start, end, form) in found {
        context.report_range(RULE, start, Some(end), format!("`{form}` {MESSAGE}"));
    }
}
