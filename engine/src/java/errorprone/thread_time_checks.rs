//! ThreadJoinLoop and TimeInStaticInitializer.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::odd_calls::receiver_class;
use super::positions::{arguments, preferred};
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::types::model::Type;
use tree_sitter::Node;

fn only_empty_statements(block: Node) -> bool {
    children(block).into_iter().filter(|part| !matches!(part.kind(), "{" | "}") && !part.kind().ends_with("comment")).all(|part| part.kind() == ";")
}

/// The type a catch parameter stands for in `isCastable`: a multi-catch is the class all alternatives share.
fn caught_class(context: &Context, parameter: Node) -> Option<String> {
    let alternatives = children(parameter).into_iter().find(|part| part.kind() == "catch_type")?;
    let listed = named_children(alternatives);
    let kinds: Vec<Type> = listed.iter().filter_map(|part| context.resolver.type_node(*part)).collect();
    if kinds.len() != listed.len() || kinds.is_empty() {
        return None;
    }
    if kinds.len() == 1 {
        return Some(kinds[0].erased().name());
    }
    let index = context.resolver.index;
    let shared = index.superclasses(&kinds[0].name()).into_iter().find(|above| kinds.iter().all(|kind| index.is_subtype(&kind.name(), above)));
    Some(shared.unwrap_or_else(|| "java.lang.Throwable".to_string()))
}

fn has_other_invocations_or_assignments(context: &Context, call: Node, body: Node) -> bool {
    let mut found = false;
    walk(body, |part| {
        if found {
            return;
        }
        match part.kind() {
            "method_invocation" if part != call => found = true,
            "assignment_expression" => {
                let Some(variable) = part.child_by_field_name("left") else { return };
                found = context.resolver.type_of(variable).is_some_and(|kind| super::method_call_checks::erased_subtype(context, variable, &kind, "java.lang.Thread", 0));
            }
            _ => {}
        }
    });
    found
}

pub fn thread_join_loop(context: &Context, call: Node) {
    if call.kind() != "method_invocation" || call.child_by_field_name("name").is_none_or(|name| context.text(name) != "join") || !arguments(call).is_empty() {
        return;
    }
    let thread = call.child_by_field_name("object").map_or("this", |object| context.text(object));
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    if resolved.method.is_static || !receiver_class(context, call).is_some_and(|class| context.resolver.index.is_subtype(&class, "java.lang.Thread")) {
        return;
    }
    let Some(tree) = ancestor(call, &["try_statement", "try_with_resources_statement"]) else { return };
    let enclosing_loop = ancestor(tree, &["while_statement"]);
    let loop_has_one_statement = enclosing_loop
        .and_then(|looped| looped.child_by_field_name("body"))
        .is_some_and(|body| body.kind() == "block" && named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).count() == 1);
    let Some(body) = tree.child_by_field_name("body") else { return };
    if has_other_invocations_or_assignments(context, call, body) || children(tree).iter().any(|part| part.kind() == "finally_clause") {
        return;
    }
    for clause in children(tree).into_iter().filter(|part| part.kind() == "catch_clause") {
        let Some(parameter) = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter") else { continue };
        let Some(caught) = caught_class(context, parameter) else { continue };
        let index = context.resolver.index;
        let castable = index.is_subtype(&caught, "java.lang.InterruptedException") || index.is_subtype("java.lang.InterruptedException", &caught);
        if !castable || !clause.child_by_field_name("body").is_some_and(only_empty_statements) {
            continue;
        }
        let mut fix = Fix::new();
        let uninterruptibles = qualify_type(context, call, "com.google.common.util.concurrent.Uninterruptibles", &mut fix);
        let replaced = if loop_has_one_statement { enclosing_loop.unwrap_or(tree) } else { tree };
        let fix = fix.and(replaced.start_byte(), replaced.end_byte(), format!("{uninterruptibles}.joinUninterruptibly({thread});"));
        let message = "Thread.join needs to be immediately surrounded by a loop until it succeeds. Consider using Uninterruptibles.joinUninterruptibly.";
        return context.report_fixed("ThreadJoinLoop", call, preferred(context, call), message, &[fix]);
    }
}

fn time_accessor(context: &Context, call: Node) -> bool {
    if call.kind() != "method_invocation" {
        return false;
    }
    let named = |name: &str| call.child_by_field_name("name").is_some_and(|written| context.text(written) == name);
    if named("now") {
        let in_java_time = context.resolver.resolve_call(call).filter(|resolved| resolved.method.is_static).is_some_and(|resolved| {
            let owner = if call.child_by_field_name("object").is_some() { resolved.receiver.erased().name() } else { resolved.declaring };
            context.resolver.index.get(&owner).is_some_and(|info| info.package == "java.time")
        });
        if in_java_time {
            return true;
        }
    }
    if named("instant") && context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static) {
        let class = receiver_class(context, call);
        return class.is_some_and(|class| ["java.time.InstantSource", "com.google.common.time.TimeSource"].iter().any(|wanted| context.resolver.index.is_subtype(&class, wanted)));
    }
    false
}

fn scan_for_time_access(context: &Context, root: Node) {
    fn visit(context: &Context, node: Node) {
        if matches!(node.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "lambda_expression" | "method_reference") {
            return;
        }
        if time_accessor(context, node) {
            let message = "Accessing the current time in a static initialiser captures the time at class loading, which is rarely desirable.";
            context.report_fixed("TimeInStaticInitializer", node, preferred(context, node), message, &[]);
        }
        for part in children(node) {
            visit(context, part);
        }
    }
    visit(context, root);
}

pub fn time_in_static_initializer(context: &Context, node: Node) {
    match node.kind() {
        "static_initializer" => {
            if let Some(block) = children(node).into_iter().find(|part| part.kind() == "block") {
                scan_for_time_access(context, block);
            }
        }
        "field_declaration" | "constant_declaration" => {
            let in_interface = parent(node).and_then(parent).is_some_and(|owner| matches!(owner.kind(), "interface_declaration" | "annotation_type_declaration"));
            if !in_interface && !crate::java::helpers::has_modifier(node, "static") {
                return;
            }
            let Some(kind) = context.resolver.declared_type(node, None) else { return };
            if matches!(&kind, Type::Class(name, _) if context.resolver.index.is_subtype(name, "com.google.common.flags.Flag")) {
                return;
            }
            for declarator in crate::java::helpers::declarators(node) {
                if let Some(value) = declarator.child_by_field_name("value") {
                    scan_for_time_access(context, value);
                }
            }
        }
        "enum_constant" => {
            for part in children(node).into_iter().filter(|part| matches!(part.kind(), "argument_list" | "class_body")) {
                scan_for_time_access(context, part);
            }
        }
        _ => {}
    }
}
