//! DefaultLocale: a formatting call or constructor that silently takes the default locale of the JVM.
use super::Context;
use super::fixes::Fix;
use super::locale_fix;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use std::sync::LazyLock;
use tree_sitter::Node;

const NAME: &str = "DefaultLocale";
const SUMMARY: &str = "Implicit use of the JVM default locale, which can result in differing behaviour between JVM executions.";
const STRING: &str = "java.lang.String";
const PATTERN_AND_ARGUMENTS: [&str; 2] = [STRING, "java.lang.Object[]"];
static ALLOWED: LazyLock<regex::Regex> = LazyLock::new(|| regex::Regex::new(r"%([%n]|([0-9]+\$|<)?-?[0-9]*(\.[0-9]+)?[bhsc])").unwrap());

const NAMES: [&str; 20] = [
    "format", "printf", "formatted", "getSymbol", "getCharacterInstance", "getLineInstance", "getSentenceInstance", "getWordInstance",
    "getInstance", "getCompactNumberInstance", "getCurrencyInstance", "getIntegerInstance", "getNumberInstance", "getPercentInstance",
    "ofPattern", "toFormatter", "getDateInstance", "getTimeInstance", "getDateTimeInstance", "getBundle",
];
const BREAKS: [&str; 4] = ["getCharacterInstance", "getLineInstance", "getSentenceInstance", "getWordInstance"];
const NUMBERS: [&str; 6] = ["getCompactNumberInstance", "getCurrencyInstance", "getInstance", "getIntegerInstance", "getNumberInstance", "getPercentInstance"];
const FORMATTER: [&[&str]; 9] = [
    &[],
    &[STRING],
    &[STRING, STRING],
    &["java.lang.Appendable"],
    &["java.io.File"],
    &["java.io.File", STRING],
    &["java.io.PrintStream"],
    &["java.io.OutputStream"],
    &["java.io.OutputStream", STRING],
];

/// The value of a constant string, a final local variable with a constant value included.
fn constant(context: &Context, expression: Node) -> Option<String> {
    let expression = crate::java::types::expr::unwrap(expression);
    if let Some(value) = context.resolver.constant_string(expression) {
        return Some(value);
    }
    match expression.kind() {
        "binary_expression" if expression.child_by_field_name("operator").is_some_and(|operator| context.text(operator) == "+") => {
            let left = constant(context, expression.child_by_field_name("left")?)?;
            Some(left + &constant(context, expression.child_by_field_name("right")?)?)
        }
        "identifier" => {
            let name = context.text(expression);
            let mut inner = expression;
            while let Some(scope) = parent(inner) {
                for statement in children(scope).into_iter().filter(|part| part.kind() == "local_variable_declaration" && part.end_byte() <= expression.start_byte()) {
                    for declarator in declarators(statement) {
                        if declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name) {
                            let value = declarator.child_by_field_name("value").filter(|_| has_modifier(statement, "final"))?;
                            return constant(context, value);
                        }
                    }
                }
                if matches!(scope.kind(), "class_body" | "lambda_expression") && !context.resolver.is_variable(expression, name) {
                    return None;
                }
                inner = scope;
            }
            None
        }
        _ => None,
    }
}

fn arguments<'t>(call: Node<'t>) -> Vec<Node<'t>> {
    let list = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
    list.into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn literal(node: Node) -> bool {
    node.kind().ends_with("_literal") || matches!(node.kind(), "true" | "false" | "string_literal" | "text_block")
}

/// The pattern has a conversion that depends on the locale, or an argument formats itself.
fn locale_matters(context: &Context, pattern: Node, rest: &[Node]) -> bool {
    if constant(context, pattern).is_some_and(|value| ALLOWED.replace_all(&value, "").contains('%')) {
        return true;
    }
    let index = context.resolver.index;
    rest.iter().any(|argument| {
        !literal(*argument)
            && context.resolver.type_of(*argument).is_some_and(|kind| matches!(kind, Type::Class(..)) && index.is_subtype(&kind.erased().name(), "java.util.Formattable"))
    })
}

fn system_stream(context: &Context, call: Node) -> bool {
    let Some(object) = call.child_by_field_name("object") else { return false };
    let object = crate::java::types::expr::unwrap(object);
    match object.kind() {
        "field_access" => {
            let field = object.child_by_field_name("field").map(|field| context.text(field)).unwrap_or_default();
            let owner = object.child_by_field_name("object").filter(|owner| matches!(owner.kind(), "identifier" | "field_access"));
            matches!(field, "out" | "err") && owner.is_some_and(|owner| context.resolver.class_name(owner, context.text(owner)).as_deref() == Some("java.lang.System") && !context.resolver.is_variable(owner, context.text(owner)))
        }
        "identifier" => {
            let name = context.text(object);
            matches!(name, "out" | "err") && static_system(context, object, name)
        }
        _ => false,
    }
}

fn static_system(context: &Context, usage: Node, name: &str) -> bool {
    let scope = context.resolver.scope;
    let imported = scope.static_single.get(name).is_some_and(|from| from.iter().any(|owner| owner == "java.lang.System" || owner == "System"))
        || scope.static_on_demand.iter().any(|owner| owner == "java.lang.System");
    imported && !local(usage, name, context)
}

fn local(usage: Node, name: &str, context: &Context) -> bool {
    let mut found = false;
    let mut inner = usage;
    while let Some(scope) = parent(inner) {
        for statement in children(scope).into_iter().filter(|part| part.kind() == "local_variable_declaration" && part.end_byte() <= usage.start_byte()) {
            found |= declarators(statement).iter().any(|declarator| declarator.child_by_field_name("name").is_some_and(|written| context.text(written) == name));
        }
        inner = scope;
    }
    found
}

fn call_fixes(context: &Context, node: Node, name: &str, is_static: bool, owner: &str) -> Vec<Fix> {
    use locale_fix::{DISPLAYING, FORMATTING, PLAIN, appended, prepended};
    match name {
        "format" | "printf" if owner == "java.text.MessageFormat" => locale_fix::message_format(context, node),
        "format" | "printf" => prepended(context, node, &FORMATTING),
        "formatted" => locale_fix::formatted(context, node),
        "getSymbol" => appended(context, node, &DISPLAYING),
        "getDateInstance" | "getTimeInstance" | "getDateTimeInstance" => locale_fix::date_format(context, node, name),
        "getInstance" if owner == "java.text.DateFormat" => locale_fix::date_format(context, node, name),
        "getBundle" => locale_fix::resource_bundle(context, node),
        _ if BREAKS.contains(&name) || (name == "getInstance" && owner == "java.text.Collator") => appended(context, node, &PLAIN),
        _ if is_static || name == "toFormatter" => appended(context, node, &FORMATTING),
        _ => Vec::new(),
    }
}

fn call(context: &Context, node: Node) {
    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !NAMES.contains(&name) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let method = &resolved.method;
    let qualified = node.child_by_field_name("object").is_some_and(|object| object.kind() != "super");
    let owner = if qualified { resolved.receiver.erased().name() } else { resolved.declaring.clone() };
    let formals: Vec<String> = method.parameters.iter().map(Type::name).collect();
    let takes = |wanted: &[&str]| formals.iter().map(String::as_str).eq(wanted.iter().copied());
    let under = |above: &str| context.resolver.index.is_subtype(&owner, above);
    let given = arguments(node);
    let on = |class: &str| method.is_static && owner == class;
    let found = match name {
        "format" | "printf" if !method.is_static => {
            (under("java.io.PrintStream") || under("java.io.PrintWriter"))
                && takes(&PATTERN_AND_ARGUMENTS)
                && !system_stream(context, node)
                && given.first().is_some_and(|pattern| locale_matters(context, *pattern, &given[1..]))
        }
        "format" => {
            (on(STRING) || on("java.text.MessageFormat"))
                && takes(&PATTERN_AND_ARGUMENTS)
                && given.first().is_some_and(|pattern| locale_matters(context, *pattern, &given[1..]))
        }
        "formatted" => {
            !method.is_static && owner == STRING && node.child_by_field_name("object").is_some_and(|pattern| locale_matters(context, pattern, &given))
        }
        "getSymbol" => !method.is_static && owner == "java.util.Currency" && formals.is_empty(),
        "ofPattern" => on("java.time.format.DateTimeFormatter") && takes(&[STRING]),
        "toFormatter" => !method.is_static && under("java.time.format.DateTimeFormatterBuilder") && formals.is_empty(),
        "getBundle" => {
            on("java.util.ResourceBundle")
                && (takes(&[STRING]) || takes(&[STRING, "java.util.ResourceBundle.Control"]) || takes(&[STRING, "java.lang.Module"]))
        }
        "getDateInstance" | "getTimeInstance" => on("java.text.DateFormat") && (formals.is_empty() || takes(&["int"])),
        "getDateTimeInstance" => on("java.text.DateFormat") && (formals.is_empty() || takes(&["int", "int"])),
        _ if !formals.is_empty() || !method.is_static => false,
        _ => {
            (BREAKS.contains(&name) && owner == "java.text.BreakIterator")
                || (NUMBERS.contains(&name) && owner == "java.text.NumberFormat")
                || (name == "getInstance"
                    && matches!(owner.as_str(), "java.text.Collator" | "java.text.DateFormatSymbols" | "java.text.DecimalFormatSymbols" | "java.text.DateFormat"))
        }
    };
    if found {
        let at = node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte());
        let fixes = call_fixes(context, node, name, method.is_static, &owner);
        context.report_fixed(NAME, node, at, SUMMARY, &fixes);
    }
}

fn creation(context: &Context, node: Node) {
    let written = node.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
    let simple = written.rsplit('.').next().unwrap_or(written);
    if !matches!(simple, "MessageFormat" | "DateFormatSymbols" | "DecimalFormatSymbols" | "DecimalFormat" | "SimpleDateFormat" | "Formatter") {
        return;
    }
    if children(node).iter().any(|part| part.kind() == "class_body") {
        return;
    }
    let Some((resolved, _)) = context.resolver.call_formals(node) else { return };
    let formals: Vec<String> = resolved.method.parameters.iter().map(Type::name).collect();
    let takes = |wanted: &[&str]| formals.iter().map(String::as_str).eq(wanted.iter().copied());
    let found = match resolved.declaring.as_str() {
        "java.text.MessageFormat" => takes(&[STRING]),
        "java.text.DateFormatSymbols" | "java.text.DecimalFormatSymbols" => formals.is_empty(),
        "java.text.DecimalFormat" | "java.text.SimpleDateFormat" => formals.is_empty() || takes(&[STRING]),
        "java.util.Formatter" => FORMATTER.iter().any(|wanted| takes(wanted)),
        _ => false,
    };
    if found {
        let at = children(node).into_iter().find(|part| part.kind() == "new").map_or(node.start_byte(), |word| word.start_byte());
        let fixes = match resolved.declaring.as_str() {
            "java.text.DecimalFormat" => locale_fix::decimal_format(context, node),
            "java.text.SimpleDateFormat" => locale_fix::simple_date_format(context, node),
            "java.util.Formatter" => locale_fix::formatter(context, node),
            _ => locale_fix::appended(context, node, &locale_fix::FORMATTING),
        };
        context.report_fixed(NAME, node, at, SUMMARY, &fixes);
    }
}

pub fn default_locale(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => call(context, node),
        "object_creation_expression" => creation(context, node),
        _ => {}
    }
}
