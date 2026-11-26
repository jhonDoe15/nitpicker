//! AddressSelection, ScannerUseDelimiter, ErroneousThreadPoolConstructorChecker and DateChecker.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::consts::{constant, Const};
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::nodes::position;
use super::optional_checks::rename_invocation;
use super::parts::{arguments, class_of, only_argument};
use super::Context;
use tree_sitter::Node;

fn anonymous(creation: Node) -> bool {
    crate::engine::source::children(creation).iter().any(|part| part.kind() == "class_body")
}

fn string_value(context: &Context, node: Node) -> Option<String> {
    match constant(context, node) {
        Some(Const::Str(value)) => Some(value),
        _ => None,
    }
}

fn int_value(context: &Context, node: Node) -> Option<i32> {
    match constant(context, node) {
        Some(Const::Int(value)) => Some(value),
        _ => None,
    }
}

fn constructor_parameters(context: &Context, creation: Node) -> Option<Vec<String>> {
    if creation.kind() != "object_creation_expression" {
        return None;
    }
    Some(context.resolver.resolve_constructor(creation)?.method.parameters.iter().map(|kind| kind.name()).collect())
}

fn is_numeric_ip(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    if value.contains(':') {
        return true;
    }
    value.chars().next().is_some_and(|first| first.is_ascii_digit()) && value.chars().last().is_some_and(|last| last.is_ascii_digit())
}

const ADDRESS_MESSAGE: &str = "Prefer InetAddress.getAllByName to APIs that convert a hostname to a single IP address";

fn handle_address(context: &Context, argument: Node, replacement: Node, fix: impl FnOnce() -> Fix) {
    let value = string_value(context, argument);
    match value.as_deref() {
        Some("127.0.0.1" | "::1") => {
            context.report_fixed("AddressSelection", replacement, position(replacement), ADDRESS_MESSAGE, &[fix()]);
        }
        Some(value) if value == "localhost" || is_numeric_ip(value) => {}
        None => {}
        Some(_) => context.report_fixed("AddressSelection", replacement, position(replacement), ADDRESS_MESSAGE, &[]),
    }
}

pub fn address_selection(context: &Context, node: Node) {
    match node.kind() {
        "object_creation_expression" => {
            if anonymous(node) || class_of(context, node).is_none_or(|class| class != "java.net.Socket" && class != "java.net.InetSocketAddress") {
                return;
            }
            if constructor_parameters(context, node).is_none_or(|found| found != ["java.lang.String", "int"]) {
                return;
            }
            let Some(argument) = arguments(node).first().copied() else { return };
            handle_address(context, argument, argument, || {
                let mut fix = Fix::new();
                let name = qualify_type(context, node, "java.net.InetAddress", &mut fix);
                fix.and(argument.start_byte(), argument.end_byte(), format!("{name}.getLoopbackAddress()"))
            });
        }
        "method_invocation" => {
            if !static_on_class(context, node, "java.net.InetAddress", &["getByName"]) {
                return;
            }
            if context.resolver.resolve_call(node).is_none_or(|call| call.method.parameters.iter().map(|kind| kind.name()).ne(["java.lang.String".to_string()])) {
                return;
            }
            let Some(argument) = only_argument(node) else { return };
            handle_address(context, argument, node, || rename_invocation(node, "getLoopbackAddress").delete(argument.start_byte(), argument.end_byte()));
        }
        _ => {}
    }
}

pub fn scanner_use_delimiter(context: &Context, node: Node) {
    if !instance_on_exact_class(context, node, "java.util.Scanner", &["useDelimiter"]) {
        return;
    }
    if context.resolver.resolve_call(node).is_none_or(|call| call.method.parameters.iter().map(|kind| kind.name()).ne(["java.lang.String".to_string()])) {
        return;
    }
    if only_argument(node).and_then(|argument| string_value(context, argument)).as_deref() == Some("\\A") {
        context.report_fixed("ScannerUseDelimiter", node, position(node), "Scanner.useDelimiter is not an efficient way to read an entire InputStream", &[]);
    }
}

const UNBOUNDED: [(&str, &[&str]); 6] = [
    ("java.util.concurrent.LinkedBlockingDeque", &[]),
    ("java.util.concurrent.LinkedBlockingDeque", &["java.util.Collection"]),
    ("java.util.concurrent.LinkedBlockingQueue", &[]),
    ("java.util.concurrent.LinkedBlockingQueue", &["java.util.Collection"]),
    ("java.util.concurrent.LinkedTransferQueue", &["*"]),
    ("java.util.concurrent.PriorityBlockingQueue", &["*"]),
];

fn unbounded_queue(context: &Context, creation: Node) -> bool {
    if creation.kind() != "object_creation_expression" || anonymous(creation) {
        return false;
    }
    let Some(class) = class_of(context, creation) else { return false };
    let Some(found) = constructor_parameters(context, creation) else { return false };
    UNBOUNDED.iter().any(|(owner, parameters)| *owner == class && (parameters == &["*"] || parameters.iter().copied().eq(found.iter().map(String::as_str))))
}

pub fn erroneous_thread_pool_constructor(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression" || anonymous(node) {
        return;
    }
    if class_of(context, node).is_none_or(|class| class != "java.util.concurrent.ThreadPoolExecutor") {
        return;
    }
    let arguments = arguments(node);
    if arguments.len() < 2 {
        return;
    }
    let (Some(core), Some(maximum)) = (int_value(context, arguments[0]), int_value(context, arguments[1])) else { return };
    if core == maximum || core == 0 && maximum == 1 {
        return;
    }
    if !arguments.get(4).is_some_and(|queue| unbounded_queue(context, *queue)) {
        return;
    }
    let maximum_replacement = if core == 0 { "1" } else { context.text(arguments[0]) };
    let first = Fix::replace(arguments[1].start_byte(), arguments[1].end_byte(), maximum_replacement);
    let second = Fix::replace(arguments[0].start_byte(), arguments[0].end_byte(), context.text(arguments[1]));
    context.report_fixed("ErroneousThreadPoolConstructorChecker", node, position(node), "Thread pool size will never go beyond corePoolSize if an unbounded queue is used", &[first, second]);
}

const MONTHS: [&str; 12] = ["JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE", "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"];

fn check_bounds(context: &Context, argument: Node, kind: &str, range: (i32, i32), errors: &mut Vec<String>) {
    if let Some(value) = int_value(context, argument).filter(|value| *value < range.0 || *value > range.1) {
        errors.push(format!("The {kind} value ({value}) is out of bounds [{}..{}].", range.0, range.1));
    }
}

fn check_month(context: &Context, argument: Node, errors: &mut Vec<String>) {
    check_bounds(context, argument, "0-based month", (0, 11), errors);
    if matches!(argument.kind(), "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal") {
        if let Some(value) = int_value(context, argument).filter(|value| (0..12).contains(value)) {
            errors.push(format!("Use Calendar.{} instead of {value} to represent the month.", MONTHS[value as usize]));
        }
    }
}

fn date_report(context: &Context, node: Node, errors: Vec<String>) {
    if !errors.is_empty() {
        let message = format!("This Date usage looks suspect for the following reason(s): {}", errors.join("  "));
        context.report_fixed("DateChecker", node, position(node), &message, &[]);
    }
}

pub fn date_checker(context: &Context, node: Node) {
    let mut errors = Vec::new();
    match node.kind() {
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
            let Some(argument) = only_argument(node).filter(|_| matches!(name, "setYear" | "setMonth" | "setDate" | "setHours" | "setMinutes" | "setSeconds")) else { return };
            if !instance_on_exact_class(context, node, "java.util.Date", &[name]) {
                return;
            }
            match name {
                "setYear" => check_bounds(context, argument, "1900-based year", (1, 300), &mut errors),
                "setMonth" => check_month(context, argument, &mut errors),
                "setDate" => check_bounds(context, argument, "day", (1, 31), &mut errors),
                "setHours" => check_bounds(context, argument, "hours", (0, 23), &mut errors),
                "setMinutes" => check_bounds(context, argument, "minutes", (0, 59), &mut errors),
                _ => check_bounds(context, argument, "seconds", (0, 59), &mut errors),
            }
        }
        "object_creation_expression" => {
            let arguments = arguments(node);
            if !matches!(arguments.len(), 3 | 5 | 6) || anonymous(node) || class_of(context, node).is_none_or(|class| class != "java.util.Date") {
                return;
            }
            if constructor_parameters(context, node).is_none_or(|found| found.len() != arguments.len() || found.iter().any(|kind| kind != "int")) {
                return;
            }
            check_bounds(context, arguments[0], "1900-based year", (1, 300), &mut errors);
            check_month(context, arguments[1], &mut errors);
            check_bounds(context, arguments[2], "day", (1, 31), &mut errors);
            if arguments.len() > 4 {
                check_bounds(context, arguments[3], "hours", (0, 23), &mut errors);
                check_bounds(context, arguments[4], "minutes", (0, 59), &mut errors);
            }
            if arguments.len() > 5 {
                check_bounds(context, arguments[5], "seconds", (0, 59), &mut errors);
            }
        }
        _ => return,
    }
    date_report(context, node, errors);
}
