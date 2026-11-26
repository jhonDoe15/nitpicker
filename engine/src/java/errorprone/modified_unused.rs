//! ModifiedButNotUsed: a collection or builder that is filled but never read.
use super::Context;
use super::fixes::Fix;
use super::positions::{arguments, enclosing_statement, preferred};
use super::targets::target_type;
use crate::engine::source::{ancestor, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "A collection or proto builder was created, but its values were never accessed.";
const STATEMENT_MESSAGE: &str = "Modifying a Builder without assigning it to anything does nothing.";
const GUAVA: [&str; 10] = [
    "com.google.common.collect.ImmutableClassToInstanceMap", "com.google.common.collect.ImmutableCollection", "com.google.common.collect.ImmutableMap",
    "com.google.common.collect.ImmutableMultimap", "com.google.common.collect.ImmutableMultiset", "com.google.common.collect.ImmutableRangeMap",
    "com.google.common.collect.ImmutableRangeSet", "com.google.common.collect.ImmutableSortedMap", "com.google.common.collect.ImmutableSortedSet",
    "com.google.common.collect.ImmutableTable",
];
const COLLECTION_SETTERS: [&str; 12] = ["add", "addAll", "clear", "put", "putAll", "remove", "removeAll", "removeIf", "replaceAll", "retainAll", "set", "sort"];
const MESSAGE_LITE: &str = "com.google.protobuf.MessageLite";
const MESSAGE_BUILDER: &str = "com.google.protobuf.MessageLite.Builder";

fn builders() -> Vec<String> {
    GUAVA.iter().map(|name| format!("{name}.Builder")).collect()
}

fn collections() -> Vec<String> {
    let mut all = builders();
    all.extend(["java.util.Collection", "java.util.Map", "com.google.common.collect.Multimap"].map(String::from));
    all
}

fn descends(context: &Context, class: &str, owners: &[String]) -> bool {
    owners.iter().any(|owner| context.resolver.index.is_subtype(class, owner))
}

fn type_descends(context: &Context, kind: &Option<Type>, owners: &[String]) -> bool {
    matches!(kind, Some(Type::Class(name, _)) if descends(context, name, owners))
}

fn name_of<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

/// Whether the call is an instance call on a descendant of one of the classes, with a name the test accepts.
fn instance_on(context: &Context, call: Node, owners: &[String], named: &dyn Fn(&str) -> bool) -> bool {
    if call.kind() != "method_invocation" || !named(name_of(context, call)) {
        return false;
    }
    context.resolver.resolve_call(call).is_some_and(|resolved| !resolved.method.is_static && descends(context, &resolved.receiver.erased().name(), owners))
}

fn static_on(context: &Context, call: Node, owners: &[String], named: &dyn Fn(&str) -> bool) -> bool {
    if call.kind() != "method_invocation" || !named(name_of(context, call)) {
        return false;
    }
    context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static && descends(context, &resolved.receiver.erased().name(), owners))
}

fn fluent_setter(context: &Context, call: Node) -> bool {
    let proto = |name: &str| ["add", "clear", "merge", "remove", "set", "put"].iter().any(|prefix| name.starts_with(prefix));
    instance_on(context, call, &[MESSAGE_BUILDER.to_string()], &proto) || instance_on(context, call, &builders(), &|name| matches!(name, "add" | "addAll" | "put" | "putAll"))
}

fn fluent_chain(context: &Context, call: Node) -> bool {
    fluent_setter(context, call) || instance_on(context, call, &[MESSAGE_BUILDER.to_string()], &|name| name.starts_with("get") && name.len() > 3)
}

fn creates(context: &Context, creation: Node, owners: &[String]) -> bool {
    creation.kind() == "object_creation_expression"
        && creation.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).is_some_and(|kind| descends(context, &kind.erased().name(), owners))
}

fn fluent_constructor(context: &Context, node: Node) -> bool {
    let guava: Vec<String> = GUAVA.iter().map(|name| name.to_string()).collect();
    let message = vec![MESSAGE_LITE.to_string()];
    creates(context, node, &builders())
        || static_on(context, node, &guava, &|name| matches!(name, "builder" | "builderWithExpectedSize"))
        || creates(context, node, &[MESSAGE_BUILDER.to_string()])
        || static_on(context, node, &message, &|name| name == "newBuilder")
        || instance_on(context, node, &message, &|name| matches!(name, "toBuilder" | "newBuilderForType"))
}

fn new_collection(context: &Context, node: Node) -> bool {
    let helpers: Vec<String> = ["Lists", "Maps", "Sets"].iter().map(|name| format!("com.google.common.collect.{name}")).collect();
    creates(context, node, &collections())
        || (node.kind() == "method_invocation" && name_of(context, node).starts_with("new") && name_of(context, node).len() > 3 && context.resolver.resolve_call(node).is_some_and(|resolved| resolved.method.is_static && helpers.contains(&resolved.declaring)))
}

/// The chain `a.b().c()` as javac's `streamReceivers` walks it: the expression, then each receiver.
fn chain<'t>(node: Node<'t>) -> Vec<Node<'t>> {
    let mut found = vec![node];
    let mut current = node;
    while matches!(current.kind(), "method_invocation" | "field_access" | "method_reference") {
        let receiver = match current.kind() {
            "method_reference" => current.named_child(0),
            _ => current.child_by_field_name("object"),
        };
        match receiver {
            Some(next) => {
                found.push(next);
                current = next;
            }
            None => break,
        }
    }
    found
}

fn new_fluent_chain(context: &Context, tree: Node) -> bool {
    chain(tree).into_iter().find(|part| !(part.kind() == "method_invocation" && fluent_chain(context, *part))).is_some_and(|part| fluent_constructor(context, part))
}

fn has_side_effect(context: &Context, expression: Node) -> bool {
    let mut found = false;
    walk(expression, |part| match part.kind() {
        "method_invocation" | "object_creation_expression" => found = true,
        "assignment_expression" => found |= part.child_by_field_name("operator").is_some_and(|operator| context.text(operator) != "="),
        "update_expression" => found = true,
        _ => {}
    });
    found
}

fn is_use(node: Node) -> bool {
    let Some(up) = parent(node) else { return false };
    match up.kind() {
        "method_invocation" => up.child_by_field_name("name") != Some(node),
        "field_access" => up.child_by_field_name("field") != Some(node),
        "variable_declarator" | "formal_parameter" => up.child_by_field_name("name") != Some(node),
        _ => true,
    }
}

fn assigned_to(context: &Context, node: Node, name: &str) -> bool {
    node.kind() == "assignment_expression" && node.child_by_field_name("left").is_some_and(|left| left.kind() == "identifier" && context.text(left) == name)
}

/// The type the place wants; a `var` declaration takes the type of its initializer.
fn target_of(context: &Context, call: Node) -> Option<Type> {
    let declarator = parent(call).filter(|up| up.kind() == "variable_declarator" && up.child_by_field_name("value") == Some(call));
    let inferred = declarator.and_then(parent).and_then(|holder| holder.child_by_field_name("type")).is_some_and(|kind| context.text(kind) == "var");
    if inferred { context.resolver.type_of(call) } else { target_type(context, call) }
}

fn collection_used(context: &Context, identifier: Node) -> bool {
    let Some(call) = parent(identifier).filter(|up| up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(identifier)) else { return true };
    !instance_on(context, call, &collections(), &|name| COLLECTION_SETTERS.contains(&name)) || target_of(context, call).is_some()
}

fn fluent_builder_used(context: &Context, identifier: Node) -> bool {
    let mut current = identifier;
    loop {
        let Some(up) = parent(current) else { return true };
        if up.kind() == "expression_statement" {
            return false;
        }
        if !(up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(current) && fluent_chain(context, up)) {
            return true;
        }
        current = up;
    }
}

fn side_effects(context: &Context, site: Node) -> Vec<String> {
    let mut kept = Vec::new();
    let mut current = Some(site);
    while let Some(at) = current {
        if super::positions::enclosing_statement(at, true).is_some_and(|statement| statement.id() == at.id()) {
            break;
        }
        if matches!(at.kind(), "method_invocation" | "object_creation_expression") {
            kept.extend(arguments(at).into_iter().filter(|argument| has_side_effect(context, *argument)).map(|argument| format!("{};", context.text(argument))));
        }
        current = parent(at);
    }
    kept
}

fn build_fixes(context: &Context, removals: &[Node], sites: &[Node]) -> Vec<Fix> {
    let mut encountered = false;
    let (mut without, mut with) = (Fix::new(), Fix::new());
    for site in removals.iter().chain(sites) {
        let kept = side_effects(context, *site);
        let Some(statement) = enclosing_statement(*site, true) else { continue };
        let (start, end) = (statement.start_byte(), statement.end_byte());
        if kept.is_empty() {
            with = with.and(start, end, "");
        } else {
            encountered = true;
            with = with.and(start, end, kept.concat());
        }
        without = without.and(start, end, "");
    }
    if encountered { vec![without, with] } else { vec![without] }
}

pub fn modified_but_not_used(context: &Context, node: Node) {
    match node.kind() {
        "local_variable_declaration" => {
            for declarator in declarators(node) {
                variable(context, node, declarator);
            }
        }
        "expression_statement" => statement(context, node),
        _ => {}
    }
}

fn statement(context: &Context, statement: Node) {
    let Some(mut expression) = statement.named_child(0) else { return };
    let build = |name: &str| matches!(name, "build" | "buildPartial");
    if instance_on(context, expression, &[MESSAGE_BUILDER.to_string()], &build) || instance_on(context, expression, &builders(), &|name| name == "build") {
        match expression.child_by_field_name("object") {
            Some(receiver) => expression = receiver,
            None => return,
        }
    }
    if expression.kind() != "method_invocation" || !fluent_setter(context, expression) || !new_fluent_chain(context, expression) {
        return;
    }
    context.report_fixed("ModifiedButNotUsed", statement, statement.start_byte(), STATEMENT_MESSAGE, &[]);
}

fn variable(context: &Context, declaration: Node, declarator: Node) {
    let Some(name_node) = declarator.child_by_field_name("name") else { return };
    let name = context.text(name_node);
    let Some(scope) = ancestor(declaration, &["block", "constructor_body", "switch_block_statement_group"]) else { return };
    if name.starts_with("unused") || name == "ignored" {
        return;
    }
    if declarator.child_by_field_name("value").is_some_and(|value| !matches!(value.kind(), "object_creation_expression" | "method_invocation")) {
        return;
    }
    let kind = match context.resolver.declared_type(declaration, Some(declarator)) {
        Some(kind) => Some(kind),
        None => declarator.child_by_field_name("value").and_then(|value| context.resolver.type_of(value)),
    };
    let collection = type_descends(context, &kind, &collections());
    if !collection && !type_descends(context, &kind, &[MESSAGE_BUILDER.to_string()]) {
        return;
    }
    let mut assignments = 0;
    let mut initializers = Vec::new();
    walk(scope, |part| {
        let target = match part.kind() {
            "assignment_expression" => part.child_by_field_name("left"),
            "update_expression" => part.named_child(0),
            _ => None,
        };
        if target.is_some_and(|target| target.kind() == "identifier" && context.text(target) == name) {
            assignments += 1;
            if let (true, Some(value)) = (assigned_to(context, part, name), part.child_by_field_name("right")) {
                initializers.push(value);
            }
        }
    });
    let initial = declarator.child_by_field_name("value");
    let effectively_final = has_modifier(declaration, "final") || assignments == 0 || (initial.is_none() && assignments == 1);
    if !effectively_final {
        return;
    }
    let initializers = match initial {
        Some(value) => vec![value],
        None => initializers,
    };
    let [initializer] = initializers.as_slice() else { return };
    if !new_collection(context, *initializer) && !new_fluent_chain(context, *initializer) {
        return;
    }
    let mut sites = Vec::new();
    let mut used = false;
    walk(scope, |part| {
        if used || part.kind() != "identifier" || context.text(part) != name || part.id() == name_node.id() || !is_use(part) {
            return;
        }
        if parent(part).is_some_and(|up| assigned_to(context, up, name) && up.child_by_field_name("left") == Some(part)) {
            return;
        }
        if if collection { collection_used(context, part) } else { fluent_builder_used(context, part) } {
            used = true;
        } else {
            sites.push(part);
        }
    });
    if used {
        return;
    }
    let removals: Vec<Node> = if initial.is_none() { vec![declaration, *initializer] } else { vec![*initializer] };
    let fixes = build_fixes(context, &removals, &sites);
    context.report_fixed("ModifiedButNotUsed", *initializer, preferred(context, *initializer), MESSAGE, &fixes);
}
