//! Checks about threads and the locks around them.
use super::fixes::Fix;
use super::inference::created_arguments;
use super::nodes::{enclosing, name_position, position, statements, token};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{has_modifier, in_interface_or_annotation, modifiers};
use crate::java::types::expr::Call;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// The type javac calls the receiver of a call: the expression's type, or the declaring class when none is written.
fn owner_type(call: Node, resolved: &Call) -> String {
    match call.child_by_field_name("object") {
        Some(object) if object.kind() != "super" => resolved.receiver.name(),
        _ => resolved.declaring.clone(),
    }
}

fn call_name<'a>(context: &'a Context, call: Node) -> &'a str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

const WELL_KNOWN: &[&str] =
    &["java.lang.String", "java.lang.Boolean", "java.lang.Long", "java.lang.Integer", "java.lang.Short", "java.lang.Character", "java.lang.Float", "java.lang.Double"];

fn well_known_argument(context: &Context, creation: Node) -> bool {
    let Some(arguments) = created_arguments(context, creation) else { return false };
    let Some(Type::Class(name, _)) = context.resolver.type_node(creation.child_by_field_name("type").unwrap_or(creation)) else { return false };
    let index = context.resolver.index;
    let Some(upward) = index.arguments_as(&Type::Class(name, arguments), "java.lang.ThreadLocal") else { return false };
    let [only] = upward.as_slice() else { return false };
    match only {
        Type::Class(argument, _) => WELL_KNOWN.contains(&argument.as_str()) || index.is_subtype(argument, "java.text.DateFormat"),
        _ => false,
    }
}

fn is_singleton(context: &Context, class: Node) -> bool {
    modifiers(class).map(children).unwrap_or_default().into_iter().any(|part| {
        matches!(part.kind(), "marker_annotation" | "annotation") && part.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some("Singleton"))
    })
}

pub fn thread_local_usage(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression" {
        return;
    }
    let Some(Type::Class(created, _)) = node.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)) else { return };
    if !context.resolver.index.is_subtype(&created, "java.lang.ThreadLocal") || well_known_argument(context, node) {
        return;
    }
    let Some(declarator) = parent(node).filter(|holder| holder.kind() == "variable_declarator" && holder.child_by_field_name("value").is_some_and(|value| value.id() == node.id())) else { return };
    let Some(declaration) = parent(declarator) else { return };
    if has_modifier(declaration, "static") || (declaration.kind() == "constant_declaration") || (declaration.kind() == "field_declaration" && in_interface_or_annotation(declaration)) {
        return;
    }
    let mut current = Some(node);
    while let Some(above) = current {
        if matches!(above.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration") && is_singleton(context, above) {
            return;
        }
        current = parent(above);
    }
    context.report_fixed("ThreadLocalUsage", node, position(node), "ThreadLocals should be stored in static fields", &[]);
}

pub fn thread_priority_check(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = call_name(context, node);
    if !matches!(name, "yield" | "setPriority" | "priority") {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    let owner = owner_type(node, &call);
    let index = context.resolver.index;
    let bad = match name {
        "yield" => call.method.is_static && owner == "java.lang.Thread",
        "setPriority" => {
            !call.method.is_static && (index.is_subtype(&owner, "java.lang.Thread") || index.is_subtype(&owner, "com.google.common.util.concurrent.ThreadFactoryBuilder"))
        }
        _ => !call.method.is_static && index.is_subtype(&owner, "java.lang.Thread.Builder.OfPlatform"),
    };
    if bad {
        context.report_fixed("ThreadPriorityCheck", node, position(node), "Relying on the thread scheduler is discouraged.", &[]);
    }
}

const CONDITION: &str = "java.util.concurrent.locks.Condition";
const UNINTERRUPTIBLES: &str = "com.google.common.util.concurrent.Uninterruptibles";

fn parameter_names(call: &Call) -> Vec<String> {
    call.method.parameters.iter().map(|kind| kind.name()).collect()
}

fn uninterruptible_await(call: &Call, owner: &str) -> bool {
    let names = parameter_names(call);
    let condition = names.first().is_some_and(|first| first == CONDITION);
    call.method.is_static
        && owner == UNINTERRUPTIBLES
        && call.method.name == "awaitUninterruptibly"
        && condition
        && (names[1..] == ["long", "java.util.concurrent.TimeUnit"] || names[1..] == ["java.time.Duration"])
}

fn waits(context: &Context, call: &Call, owner: &str) -> bool {
    let name = call.method.name.as_str();
    (!call.method.is_static && owner == "java.lang.Object" && name == "wait")
        || (!call.method.is_static && name.starts_with("await") && context.resolver.index.is_subtype(owner, CONDITION))
        || uninterruptible_await(call, owner)
}

fn waits_with_timeout(context: &Context, call: &Call, owner: &str) -> bool {
    let name = call.method.name.as_str();
    let names = parameter_names(call);
    let condition = !call.method.is_static && context.resolver.index.is_subtype(owner, CONDITION);
    let object = !call.method.is_static && owner == "java.lang.Object" && name == "wait";
    (object && (names == ["long"] || names == ["long", "int"]))
        || (condition && name == "await" && names == ["long", "java.util.concurrent.TimeUnit"])
        || (condition && matches!(name, "awaitNanos" | "awaitUntil"))
        || (call.method.is_static && owner == "com.google.common.time.Durations" && name == "wait")
        || uninterruptible_await(call, owner)
}

fn in_loop(node: Node) -> bool {
    let mut current = parent(node);
    while let Some(above) = current {
        match above.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "class_body" | "interface_body" | "enum_body" | "annotation_type_body" => return false,
            "while_statement" | "for_statement" | "enhanced_for_statement" | "do_statement" => return true,
            _ => {}
        }
        current = parent(above);
    }
    false
}

pub fn wait_not_in_loop(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = call_name(context, node);
    if name != "wait" && !name.starts_with("await") {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    let owner = owner_type(node, &call);
    if !waits(context, &call, &owner) || in_loop(node) {
        return;
    }
    let message = format!("Because of spurious wakeups, {}({}) must always be called in a loop", call.method.name, call.method.shown);
    let mut fixes = Vec::new();
    if !waits_with_timeout(context, &call, &owner) {
        if let Some(conditional) = enclosing(node, &["if_statement"]).filter(|found| found.child_by_field_name("alternative").is_none()) {
            let source = context.text(conditional);
            fixes.push(Fix::replace(conditional.start_byte(), conditional.end_byte(), source.replacen("if", "while", 1)));
        }
    }
    context.report_fixed("WaitNotInLoop", node, position(node), &message, &fixes);
}

fn is_constant(context: &Context, expression: Node) -> bool {
    match expression.kind() {
        "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal" | "decimal_floating_point_literal" | "hex_floating_point_literal"
        | "character_literal" | "string_literal" | "true" | "false" => true,
        "parenthesized_expression" | "unary_expression" => named_children(expression).into_iter().filter(|part| !part.kind().ends_with("comment")).all(|part| is_constant(context, part)),
        "binary_expression" => ["left", "right"].iter().all(|side| expression.child_by_field_name(side).is_some_and(|part| is_constant(context, part))),
        "ternary_expression" => ["condition", "consequence", "alternative"].iter().all(|side| expression.child_by_field_name(side).is_some_and(|part| is_constant(context, part))),
        "cast_expression" => {
            let primitive = expression.child_by_field_name("type").is_some_and(|kind| matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type") || context.text(kind) == "String");
            primitive && expression.child_by_field_name("value").is_some_and(|value| is_constant(context, value))
        }
        "identifier" | "field_access" | "scoped_identifier" => context.resolver.constant_field(expression),
        _ => false,
    }
}

fn returns_constant(context: &Context, method: Node) -> bool {
    let Some(body) = method.child_by_field_name("body") else { return false };
    let all = statements(body);
    let [only] = all.as_slice() else { return false };
    only.kind() == "return_statement" && named_children(*only).into_iter().find(|part| !part.kind().ends_with("comment")).is_some_and(|value| is_constant(context, value))
}

fn is_test_class(context: &Context, class: Node) -> bool {
    let annotated = modifiers(class).map(children).unwrap_or_default().into_iter().any(|part| {
        matches!(part.kind(), "marker_annotation" | "annotation")
            && part.child_by_field_name("name").is_some_and(|name| context.resolver.class_name(part, context.text(name)).is_some_and(|full| full == "org.junit.runner.RunWith"))
    });
    let named = context.resolver.scope.names.get(&class.id());
    annotated || named.is_some_and(|name| context.resolver.index.is_subtype(name, "junit.framework.TestCase"))
}

pub fn input_stream_slow_multibyte_read(context: &Context, node: Node) {
    if !matches!(node.kind(), "class_declaration" | "object_creation_expression") || (node.kind() == "object_creation_expression" && token(node, "class_body").is_none()) {
        return;
    }
    let Some(class) = context.resolver.scope.names.get(&node.id()) else { return };
    let index = context.resolver.index;
    if !index.is_subtype(class, "java.io.InputStream") {
        return;
    }
    let body = if node.kind() == "class_declaration" { node.child_by_field_name("body") } else { token(node, "class_body") };
    let single = body.map(children).unwrap_or_default().into_iter().find(|member| {
        member.kind() == "method_declaration"
            && member.child_by_field_name("name").is_some_and(|name| context.text(name) == "read")
            && member.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)) == Some(Type::Primitive("int"))
            && member.child_by_field_name("parameters").is_none_or(|list| named_children(list).is_empty())
    });
    let Some(single) = single else { return };
    let multi = [Type::Array(Box::new(Type::Primitive("byte"))), Type::Primitive("int"), Type::Primitive("int")];
    let declared_here = index.get(class).is_some_and(|info| info.methods.iter().any(|method| method.name == "read" && method.parameters == multi));
    let inherited = index.methods(class, "read").into_iter().find(|(_, method)| method.parameters == multi);
    if declared_here || inherited.is_none() || returns_constant(context, single) {
        return;
    }
    let mut current = parent(node);
    while let Some(above) = current {
        if matches!(above.kind(), "class_declaration" | "object_creation_expression") && is_test_class(context, above) {
            return;
        }
        current = parent(above);
    }
    let message = "Please also override int read(byte[], int, int), otherwise multi-byte reads from this input stream are likely to be slow.";
    context.report_fixed("InputStreamSlowMultibyteRead", single, name_position(single), message, &[]);
}
