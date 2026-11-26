//! NoAllocation: allocations, boxing and calls to unannotated methods inside methods annotated with `@NoAllocation`.
use super::Context;
use super::fixes::Fix;
use super::hierarchy::{declared_method, simple_name, super_methods};
use crate::engine::source::{children, parent, walk};
use crate::java::types::model::Type;
use std::collections::HashMap;
use tree_sitter::Node;

const ANNOTATION: &str = "com.google.errorprone.annotations.NoAllocation";
const METHODS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration"];
const PRIMITIVE_NODES: &[&str] = &["integral_type", "floating_point_type", "boolean_type"];
const COMPOUND: &[&str] = &["+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "<<=", ">>=", ">>>="];

fn message(start: &str) -> String {
    format!("{start} is disallowed in methods annotated with @NoAllocation")
}

/// Whether the method declaration itself carries `@NoAllocation`, remembered per declaration.
fn annotated(context: &Context, method: Node, memory: &mut HashMap<usize, bool>) -> bool {
    *memory.entry(method.id()).or_insert_with(|| context.resolver.annotation_names(method).iter().any(|name| name == ANNOTATION))
}

fn enclosing_method(node: Node) -> Option<Node> {
    let mut at = parent(node);
    while let Some(up) = at {
        if METHODS.contains(&up.kind()) {
            return Some(up);
        }
        at = parent(up);
    }
    None
}

/// A throw statement or an annotation comes before any method on the way up.
fn within_throw_or_annotation(node: Node) -> bool {
    let mut at = parent(node);
    while let Some(up) = at {
        match up.kind() {
            kind if METHODS.contains(&kind) => return false,
            "throw_statement" | "annotation" | "marker_annotation" => return true,
            _ => at = parent(up),
        }
    }
    false
}

fn is_primitive(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Primitive(name)) if *name != "void")
}

fn is_string(kind: &Option<Type>) -> bool {
    matches!(kind, Some(Type::Class(name, _)) if name == "java.lang.String")
}

fn type_of(context: &Context, node: Node) -> Option<Type> {
    context.resolver.type_of(node)
}

fn token<'t>(node: Node<'t>, kinds: &[&str]) -> Option<Node<'t>> {
    children(node).into_iter().find(|part| !part.is_named() && kinds.contains(&part.kind()))
}

pub fn no_allocation(context: &Context, root: Node) {
    if !context.file.text.contains("NoAllocation") {
        return;
    }
    let mut memory = HashMap::new();
    walk(root, |node| {
        if !node.is_named() {
            return;
        }
        match node.kind() {
            "method_declaration" => override_of_annotated(context, node, &mut memory),
            "array_creation_expression" => allocation(context, node, node, "Allocating a new array with \"new\" or \"{ ... }\"", &mut memory),
            "array_initializer" if parent(node).is_none_or(|up| up.kind() != "array_creation_expression") => {
                allocation(context, node, node, "Allocating a new array with \"new\" or \"{ ... }\"", &mut memory)
            }
            "object_creation_expression" => {
                let at = token(node, &["new"]).unwrap_or(node);
                allocation(context, node, at, "Constructing a new object", &mut memory)
            }
            "method_invocation" | "explicit_constructor_invocation" => invocation(context, node, &mut memory),
            "binary_expression" => binary(context, node, &mut memory),
            "assignment_expression" => assignment(context, node, &mut memory),
            "enhanced_for_statement" => foreach(context, node, &mut memory),
            "update_expression" => update(context, node, &mut memory),
            "variable_declarator" => variable(context, node, &mut memory),
            "cast_expression" => cast(context, node, &mut memory),
            "return_statement" => returned(context, node, &mut memory),
            _ => {}
        }
    });
}

/// The enclosing method carries `@NoAllocation` and the node is not inside a throw or an annotation.
fn inside(context: &Context, node: Node, memory: &mut HashMap<usize, bool>) -> bool {
    !within_throw_or_annotation(node) && enclosing_method(node).is_some_and(|method| annotated(context, method, memory))
}

fn allocation(context: &Context, node: Node, at: Node, what: &str, memory: &mut HashMap<usize, bool>) {
    if inside(context, node, memory) {
        context.report_fixed("NoAllocation", node, at.start_byte(), &message(what), &[]);
    }
}

fn override_of_annotated(context: &Context, method: Node, memory: &mut HashMap<usize, bool>) {
    if annotated(context, method, memory) {
        return;
    }
    let Some((origin, declared)) = declared_method(context, method) else { return };
    let found = super_methods(context.resolver.index, origin, declared).into_iter().find(|(_, above)| above.detail.annotations.iter().any(|name| name == ANNOTATION));
    let Some((owner, above)) = found else { return };
    let text = format!(
        "Method overrides {} in {} which is annotated @NoAllocation, it should also be annotated.",
        above.name,
        simple_name(&owner.name)
    );
    let start = start_of(method);
    let fix = Fix::new().insert(start, "@NoAllocation ").with_imports();
    let name = method.child_by_field_name("name").unwrap_or(method);
    context.report_fixed("NoAllocation", method, name.start_byte(), &text, &[fix]);
}

/// Where javac says a method declaration starts: its modifiers, else its first token.
fn start_of(method: Node) -> usize {
    crate::java::helpers::modifiers(method).map_or(method.start_byte(), |modifiers| modifiers.start_byte())
}

fn invocation(context: &Context, call: Node, memory: &mut HashMap<usize, bool>) {
    if !enclosing_method(call).is_some_and(|method| annotated(context, method, memory)) {
        return;
    }
    let resolved = if call.kind() == "method_invocation" { context.resolver.resolve_call(call) } else { context.resolver.call_formals(call).map(|(found, _)| found) };
    let Some(resolved) = resolved else { return };
    let unannotated = !resolved.method.detail.annotations.iter().any(|name| name == ANNOTATION);
    if !((unannotated && !within_throw_or_annotation(call)) || boxes_argument(context, call, &resolved.method)) {
        return;
    }
    let at = call.child_by_field_name("arguments").map_or(call.start_byte(), |list| list.start_byte());
    let text = "Calling a method that is not annotated with @NoAllocation, calling a varargs method without exactly matching the signature, or passing a primitive value as non-primitive method argument is disallowed in methods annotated with @NoAllocation";
    context.report_fixed("NoAllocation", call, at, text, &[]);
}

fn boxes_argument(context: &Context, call: Node, method: &crate::java::types::model::Method) -> bool {
    let arguments: Vec<Node> = call.child_by_field_name("arguments").map(crate::engine::source::named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    if arguments.len() != method.parameters.len() {
        return true;
    }
    for (index, (argument, formal)) in arguments.iter().zip(&method.parameters).enumerate() {
        let actual = type_of(context, *argument);
        if is_primitive(&actual) && !matches!(formal, Type::Primitive(_)) {
            return true;
        }
        if index + 1 == arguments.len() && method.varargs && matches!(formal, Type::Array(_)) {
            let generic = method.generic_parameters.get(index).unwrap_or(formal);
            if !array_assignable(context, actual.as_ref(), generic) {
                return true;
            }
        }
    }
    false
}

/// Whether a value of the type can be passed where the array type is wanted; a type variable accepts nothing but itself.
fn array_assignable(context: &Context, actual: Option<&Type>, wanted: &Type) -> bool {
    match (actual, wanted) {
        (None, _) | (Some(Type::Null), _) => true,
        (Some(Type::Array(have)), Type::Array(want)) => element_assignable(context, have, want),
        _ => false,
    }
}

fn element_assignable(context: &Context, have: &Type, want: &Type) -> bool {
    match (have, want) {
        (Type::Primitive(a), Type::Primitive(b)) => a == b,
        (Type::Primitive(_), _) | (_, Type::Primitive(_)) => false,
        (Type::Variable(a), Type::Variable(b)) => a == b,
        (_, Type::Variable(_)) => false,
        (Type::Array(a), Type::Array(b)) => element_assignable(context, a, b),
        (Type::Array(_), Type::Class(name, _)) => matches!(name.as_str(), "java.lang.Object" | "java.lang.Cloneable" | "java.io.Serializable"),
        (Type::Class(a, _), Type::Class(b, _)) => context.resolver.index.is_subtype(a, b),
        (_, Type::Wildcard) | (Type::Wildcard, _) => true,
        _ => false,
    }
}

/// The top of a run of `+` on the left spine: javac's parser folds string literals only there.
fn chain_top(node: Node) -> Node {
    let mut top = node;
    while let Some(up) = parent(top).filter(|up| up.kind() == "binary_expression" && up.child_by_field_name("left") == Some(top) && plus(*up)) {
        top = up;
    }
    top
}

fn plus(node: Node) -> bool {
    node.kind() == "binary_expression" && node.child_by_field_name("operator").is_some_and(|sign| sign.kind() == "+")
}

/// The operands of a run of `+`, left to right, each with its start and whether it is a string literal.
fn operands(top: Node) -> Vec<(Node, bool)> {
    let mut found = Vec::new();
    let mut at = top;
    while plus(at) {
        let (Some(left), Some(right)) = (at.child_by_field_name("left"), at.child_by_field_name("right")) else { break };
        found.push((right, right.kind() == "string_literal"));
        at = left;
    }
    found.push((at, at.kind() == "string_literal"));
    found.reverse();
    found
}

/// The parser folds a run of `+` only when it is the whole expression, not an operand of another operator.
fn folds(top: Node, pieces: &[(Node, bool)]) -> bool {
    parent(top).is_none_or(|up| !matches!(up.kind(), "binary_expression" | "instanceof_expression")) && pieces.windows(2).any(|pair| pair[0].1 && pair[1].1)
}

fn concatenation(context: &Context, at: usize, node: Node) {
    let text = message("String concatenation allocates a new String, which");
    context.report_fixed("NoAllocation", node, at, &text, &[]);
}

fn binary(context: &Context, node: Node, memory: &mut HashMap<usize, bool>) {
    let (Some(operator), Some(left), Some(right)) = (node.child_by_field_name("operator"), node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    if context.text(operator) != "+" || !inside(context, node, memory) {
        return;
    }
    let top = chain_top(node);
    let pieces = operands(top);
    if folds(top, &pieces) {
        if top == node {
            folded(context, top, &pieces);
        }
        return;
    }
    if is_string(&type_of(context, left)) || is_string(&type_of(context, right)) {
        concatenation(context, operator.start_byte(), node);
    }
}

/// A run with adjacent string literals is rebuilt: the literals are one, and each `+` is placed at its right operand.
fn folded(context: &Context, top: Node, pieces: &[(Node, bool)]) {
    let mut merged: Vec<(Node, bool)> = Vec::new();
    for (piece, literal) in pieces {
        match merged.last() {
            Some((_, true)) if *literal => {}
            _ => merged.push((*piece, *literal)),
        }
    }
    let mut text = merged.first().is_some_and(|(piece, literal)| *literal || is_string(&type_of(context, *piece)));
    for (piece, literal) in merged.iter().skip(1) {
        text = text || *literal || is_string(&type_of(context, *piece));
        if text {
            concatenation(context, piece.start_byte(), top);
        }
    }
}

fn assignment(context: &Context, node: Node, memory: &mut HashMap<usize, bool>) {
    let (Some(operator), Some(left), Some(right)) = (node.child_by_field_name("operator"), node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let sign = context.text(operator);
    if sign != "=" && !COMPOUND.contains(&sign) {
        return;
    }
    if !inside(context, node, memory) {
        return;
    }
    let target = type_of(context, left);
    if sign == "=" {
        if target.is_some() && !is_primitive(&target) && is_primitive(&type_of(context, right)) {
            let text = message("Assigning a primitive value to a non-primitive variable or array element will autobox the value, which");
            context.report_fixed("NoAllocation", node, operator.start_byte(), &text, &[]);
        }
        return;
    }
    if (sign == "+=" && is_string(&target)) || (target.is_some() && !is_primitive(&target)) {
        let text = message("Compound assignment to a String or boxed primitive allocates a new object, which");
        context.report_fixed("NoAllocation", node, operator.start_byte(), &text, &[]);
    }
}

fn foreach(context: &Context, node: Node, memory: &mut HashMap<usize, bool>) {
    let Some(value) = node.child_by_field_name("value") else { return };
    if !inside(context, node, memory) {
        return;
    }
    let iterated = match type_of(context, value) {
        Some(Type::Array(element)) => Some(*element),
        Some(_) | None => None,
    };
    let hit = match iterated {
        None => true,
        Some(Type::Primitive(_)) => node.child_by_field_name("type").is_some_and(|kind| !PRIMITIVE_NODES.contains(&kind.kind()) && context.text(kind) != "var"),
        Some(_) => false,
    };
    if hit {
        let text = message("Iterating over a Collection or iterating over a primitive array using a non-primitive element type will trigger allocation, which");
        context.report_fixed("NoAllocation", node, node.start_byte(), &text, &[]);
    }
}

fn update(context: &Context, node: Node, memory: &mut HashMap<usize, bool>) {
    let Some(operator) = token(node, &["++", "--"]) else { return };
    let Some(operand) = children(node).into_iter().find(|part| part.is_named()) else { return };
    if !inside(context, node, memory) {
        return;
    }
    let kind = type_of(context, operand);
    if kind.is_some() && !is_primitive(&kind) {
        let text = message("Pre- and post- increment/decrement operations on a non-primitive variable or array element will autobox the result, which");
        context.report_fixed("NoAllocation", node, operator.start_byte(), &text, &[]);
    }
}

fn variable(context: &Context, node: Node, memory: &mut HashMap<usize, bool>) {
    let Some(value) = node.child_by_field_name("value") else { return };
    let Some(declaration) = parent(node) else { return };
    let Some(declared) = declaration.child_by_field_name("type") else { return };
    if PRIMITIVE_NODES.contains(&declared.kind()) || context.text(declared) == "var" || node.child_by_field_name("dimensions").is_some() {
        return;
    }
    if !is_primitive(&type_of(context, value)) || !inside(context, node, memory) {
        return;
    }
    let text = message("Initializing a non-primitive variable with a primitive value will autobox the value, which");
    let at = node.child_by_field_name("name").unwrap_or(node);
    context.report_fixed("NoAllocation", node, at.start_byte(), &text, &[]);
}

fn cast(context: &Context, node: Node, memory: &mut HashMap<usize, bool>) {
    let (Some(kind), Some(value)) = (node.child_by_field_name("type"), node.child_by_field_name("value")) else { return };
    if PRIMITIVE_NODES.contains(&kind.kind()) || !is_primitive(&type_of(context, value)) || !inside(context, node, memory) {
        return;
    }
    let text = message("Casting a primitive value to a non-primitive type will autobox the value, which");
    context.report_fixed("NoAllocation", node, node.start_byte(), &text, &[]);
}

fn returned(context: &Context, node: Node, memory: &mut HashMap<usize, bool>) {
    let Some(value) = children(node).into_iter().find(|part| part.is_named() && !part.kind().ends_with("comment")) else { return };
    if within_throw_or_annotation(node) {
        return;
    }
    let Some(method) = enclosing_method(node).filter(|method| annotated(context, *method, memory)) else { return };
    let Some(returns) = method.child_by_field_name("type") else { return };
    if method.kind() != "method_declaration" || PRIMITIVE_NODES.contains(&returns.kind()) || returns.kind() == "void_type" {
        return;
    }
    if is_primitive(&type_of(context, value)) {
        let text = message("Returning a primitive value from a method with a non-primitive return type will autobox the value, which");
        context.report_fixed("NoAllocation", node, node.start_byte(), &text, &[]);
    }
}
