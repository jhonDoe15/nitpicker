//! Whether javac keeps the hidden field that holds an inner class's outer instance (`this$0`). Since Java 18 it
//! leaves the field out when nothing but the constructors' own code uses the outer instance, unless the class is
//! serializable. Code of lambdas and of classes declared inside counts, as they reach the outer instance through it.
use super::super::Context;
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::types::expr::Binding;
use crate::java::types::model::flag;
use crate::java::types::scope::{TYPE_DECLARATIONS, enclosing_types};
use tree_sitter::Node;

/// The class an inner, local or anonymous class takes an outer instance of, if any.
pub fn outer_of(context: &Context, class: Node) -> Option<String> {
    match class.kind() {
        "class_declaration" => crate::java::javac::instance_around(context.resolver, class),
        "object_creation_expression" => crate::java::javac::outer_instance(context.resolver, class),
        _ => None,
    }
}

/// The classes around a class, innermost first, without the class itself.
pub fn outers(context: &Context, own: &str, class: Node) -> Vec<String> {
    enclosing_types(context.resolver.scope, class).into_iter().filter(|name| name != own).collect()
}

/// Whether `class` (its name `own`) keeps the field.
pub fn keeps_outer(context: &Context, own: &str, class: Node) -> bool {
    if outer_of(context, class).is_none() {
        return false;
    }
    if context.resolver.index.is_subtype(own, "java.io.Serializable") {
        return true;
    }
    let Some(body) = super::body_of(class) else { return false };
    let mut stack: Vec<Node> = Vec::new();
    for member in children(body) {
        if member.kind().ends_with("constructor_declaration") {
            constructor_parts(member, &mut stack);
        } else {
            stack.push(member);
        }
    }
    let nest = outers(context, own, class);
    let outside = |name: &str| nest.iter().any(|outer| outer == name);
    while let Some(node) = stack.pop() {
        if uses_outer(context, own, node, &outside) {
            return true;
        }
        stack.extend(named_children(node));
    }
    false
}

/// A constructor's own code reaches the outer instance through the parameter javac adds: only lambdas and classes
/// written inside it go through the field.
fn constructor_parts<'a>(node: Node<'a>, out: &mut Vec<Node<'a>>) {
    for part in named_children(node) {
        if part.kind() == "lambda_expression" || part.kind() == "class_body" || TYPE_DECLARATIONS.contains(&part.kind()) {
            out.push(part);
        } else {
            constructor_parts(part, out);
        }
    }
}

/// The class a name used without qualifier is found in: the innermost class around it that has such a member.
fn found_in(context: &Context, at: Node, has: impl Fn(&str) -> bool) -> Option<String> {
    enclosing_types(context.resolver.scope, at).into_iter().find(|owner| has(owner))
}

fn uses_outer(context: &Context, own: &str, node: Node, outside: &dyn Fn(&str) -> bool) -> bool {
    let resolver = context.resolver;
    let index = resolver.index;
    match node.kind() {
        "field_access" | "method_invocation" | "method_reference" => {
            let object = node.child_by_field_name("object").or_else(|| node.named_child(0));
            let qualified = object.and_then(|object| match object.kind() {
                "field_access" => object.child_by_field_name("field").filter(|field| matches!(field.kind(), "this" | "super")).and(object.child_by_field_name("object")),
                _ => None,
            });
            if let Some(qualifier) = qualified.and_then(|qualifier| resolver.class_name(node, context.text(qualifier))) {
                return outside(&qualifier);
            }
            let named_super = node.kind() == "method_invocation" && children(node).iter().any(|part| part.kind() == "super");
            if let Some(qualifier) = object.filter(|_| named_super).and_then(|object| resolver.class_name(node, context.text(object))) {
                return outside(&qualifier);
            }
            if node.kind() == "field_access" && node.child_by_field_name("field").is_some_and(|field| field.kind() == "this") {
                return node.child_by_field_name("object").and_then(|outer| resolver.class_name(node, context.text(outer))).is_some_and(|outer| outside(&outer));
            }
            if node.kind() == "method_invocation" && node.child_by_field_name("object").is_none() {
                let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
                let owner = found_in(context, node, |owner| !index.methods(owner, name).is_empty());
                let instance = resolver.resolve_call(node).is_none_or(|call| !call.method.is_static);
                return instance && owner.is_some_and(|owner| owner != own && outside(&owner));
            }
            if node.kind() == "method_reference" {
                return created(context, own, node, object, outside);
            }
            false
        }
        "identifier" => {
            let Some(holder) = parent(node) else { return false };
            let member = matches!(holder.kind(), "field_access" | "method_invocation" | "method_reference") && holder.child_by_field_name("object") != Some(node);
            let declared = matches!(holder.kind(), "variable_declarator" | "formal_parameter" | "catch_formal_parameter" | "spread_parameter" | "resource" | "enhanced_for_statement") && holder.child_by_field_name("name") == Some(node);
            if member || declared {
                return false;
            }
            match resolver.binding(node, context.text(node)) {
                Some(Binding::Field(_, _, field)) if field.flags & flag::STATIC == 0 => {
                    let name = context.text(node);
                    found_in(context, node, |owner| index.field(owner, name).is_some()).is_some_and(|owner| outside(&owner))
                }
                _ => false,
            }
        }
        "object_creation_expression" => created(context, own, node, node.child_by_field_name("type"), outside),
        _ => false,
    }
}

/// `new X()` or `X::new` for an inner class X that takes an instance of a class outside this one.
fn created(context: &Context, own: &str, node: Node, written: Option<Node>, outside: &dyn Fn(&str) -> bool) -> bool {
    if node.kind() == "object_creation_expression" && node.named_children(&mut node.walk()).next().is_some_and(|first| first.kind() != "type_identifier" && first.kind() != "generic_type" && first.kind() != "scoped_type_identifier" && !first.kind().ends_with("annotation")) {
        return false;
    }
    if node.kind() == "method_reference" && !children(node).iter().any(|part| part.kind() == "new") {
        return false;
    }
    let Some(made) = written.and_then(|written| context.resolver.type_node(written)).map(|kind| kind.name()) else { return false };
    let Some(declaration) = context.classes.get(&made) else { return false };
    let Some(taken) = outer_of(context, *declaration) else { return false };
    if crate::java::javac::declared_locally(*declaration) {
        let around = ancestor(*declaration, &["class_body"]).and_then(parent).and_then(|holder| context.resolver.scope.names.get(&holder.id()).cloned());
        return around.is_some_and(|around| around != own && outside(&around));
    }
    taken != own && outside(&taken) && !context.resolver.index.is_subtype(own, &taken)
}
