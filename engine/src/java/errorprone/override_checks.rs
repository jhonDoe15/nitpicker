//! ForOverride, MissingSuperCall and FunctionalInterfaceMethodChanged: checks on the methods that override others.
use super::Context;
use super::guice::annotations;
use super::hierarchy::{declared_method, formals, super_methods};
use super::nodes::name_position;
use super::positions::preferred;
use crate::engine::source::{ancestor, children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::model::{ClassInfo, Method, Type, flag};
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

const FOR_OVERRIDE: &str = "com.google.errorprone.annotations.ForOverride";
const MESSAGE_BASE: &str = "Method annotated @ForOverride ";

fn has_for_override(method: &Method) -> bool {
    method.detail.annotations.iter().any(|name| name == FOR_OVERRIDE)
}

/// The methods annotated `@ForOverride` that the method overrides, itself first when it carries the annotation.
fn overridden<'c>(context: &'c Context, origin: &'c ClassInfo, method: &'c Method) -> Vec<(&'c ClassInfo, &'c Method)> {
    let mut found = Vec::new();
    if has_for_override(method) {
        found.push((origin, method));
    }
    found.extend(super_methods(context.resolver.index, origin, method).into_iter().filter(|(_, above)| has_for_override(above)));
    found
}

fn outermost_name(index: &crate::java::types::index::TypeIndex, class: &str) -> String {
    let package = index.get(class).map(|info| info.package.clone()).unwrap_or_default();
    let rest = if package.is_empty() { class } else { class.strip_prefix(&package).map_or(class, |rest| rest.trim_start_matches('.')) };
    let first = rest.split('.').next().unwrap_or(rest);
    if package.is_empty() { first.to_string() } else { format!("{package}.{first}") }
}

/// `Type.toString` of a class as its declaration sees it: qualified, with its type variables.
fn declared_text(context: &Context, class: &str) -> String {
    let Some(info) = context.resolver.index.get(class) else { return class.to_string() };
    if info.type_parameters.is_empty() {
        return class.to_string();
    }
    let names: Vec<&str> = info.type_parameters.iter().map(|(name, _)| name.as_str()).collect();
    format!("{class}<{}>", names.join(","))
}

fn outermost_type(node: Node) -> Option<Node> {
    let mut found = None;
    let mut current = parent(node);
    while let Some(at) = current {
        if TYPE_DECLARATIONS.contains(&at.kind()) {
            found = Some(at);
        }
        current = parent(at);
    }
    found
}

/// `super.m()` gives `Some(None)`, `Outer.super.m()` gives `Some(Some(Outer))`.
fn super_qualifier(call: Node) -> Option<Option<Node>> {
    let object = call.child_by_field_name("object")?;
    if object.kind() == "super" {
        return Some(None);
    }
    children(call).iter().any(|part| part.kind() == "super").then_some(Some(object))
}

fn super_call(context: &Context, call: Node, outermost: &str) -> bool {
    match super_qualifier(call) {
        Some(None) => true,
        Some(Some(qualifier)) => context.resolver.class_name(call, context.text(qualifier)).is_some_and(|name| name == outermost),
        None => false,
    }
}

fn enclosing_method_not_in_class(call: Node) -> Option<Node> {
    let mut current = parent(call);
    while let Some(at) = current {
        if at.kind() == "method_declaration" {
            return Some(at);
        }
        if TYPE_DECLARATIONS.contains(&at.kind()) || at.kind() == "class_body" {
            return None;
        }
        current = parent(at);
    }
    None
}

fn overrides_called(context: &Context, call: Node, name: &str, declaring: &str, called: &Method) -> bool {
    let Some(current) = enclosing_method_not_in_class(call) else { return false };
    if current.child_by_field_name("name").is_none_or(|part| context.text(part) != name) {
        return false;
    }
    let Some((origin, own)) = declared_method(context, current) else { return false };
    let index = context.resolver.index;
    super_methods(index, origin, own).iter().any(|(class, above)| class.name == declaring && above.parameters == called.parameters && above.name == called.name)
}

pub fn for_override_invocation(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|part| context.text(part)) else { return };
    let Some(top) = outermost_type(call) else { return };
    let Some(current) = context.resolver.scope.names.get(&top.id()) else { return };
    let Some(resolved) = context.resolver.resolve_call(call) else { return };
    let method = &resolved.method;
    if method.is_static {
        return;
    }
    let index = context.resolver.index;
    let Some(mut origin) = index.get(&resolved.declaring) else { return };
    let mut method = method;
    if matches!(super_qualifier(call), Some(Some(_))) && origin.name == *current {
        let Some((above_origin, above)) = super_methods(index, origin, method).into_iter().next() else { return };
        (origin, method) = (above_origin, above);
    }
    let candidates = overridden(context, origin, method);
    if candidates.is_empty() {
        return;
    }
    if super_call(context, call, current) && overrides_called(context, call, name, &origin.name, method) {
        return;
    }
    for (owner, _) in candidates {
        let declaring = outermost_name(index, &owner.name);
        if &declaring != current {
            let message = format!("{MESSAGE_BASE}must not be invoked directly (except by the declaring class, {})", declared_text(context, &declaring));
            return context.report_fixed("ForOverride", call, preferred(context, call), &message, &[]);
        }
    }
}

fn public_or_private(method: &Method, declaring: &ClassInfo) -> bool {
    method.flags & flag::PUBLIC != 0 || method.is_private || method.detail.access & 3 != 0 || (declaring.is_interface && !method.is_private)
}

pub fn for_override_method(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let Some((origin, method)) = declared_method(context, node) else { return };
    if method.is_static || !public_or_private(method, origin) {
        return;
    }
    let found = overridden(context, origin, method);
    let Some((nearest_class, nearest)) = found.first() else { return };
    let base = "must have protected or package-private visibility";
    let message = if std::ptr::eq(*nearest, method) {
        format!("{MESSAGE_BASE}{base}")
    } else {
        format!("Method overrides @ForOverride method {}.{}({}), so it {base}", nearest_class.name, nearest.name, nearest.shown)
    };
    context.report_fixed("ForOverride", node, name_position(node), &message, &[]);
}

const CALL_SUPER: [&str; 5] = [
    "android.support.annotation.CallSuper",
    "androidx.annotation.CallSuper",
    "com.google.errorprone.annotations.OverridingMethodsMustInvokeSuper",
    "javax.annotation.OverridingMethodsMustInvokeSuper",
    "edu.umd.cs.findbugs.annotations.OverrideMustInvoke",
];

fn abstract_method(declaration: Node, method: Option<&Method>) -> bool {
    method.map_or_else(|| has_modifier(declaration, "abstract"), |found| found.is_abstract)
}

pub fn missing_super_call_annotation(context: &Context, annotation: Node) {
    if !matches!(annotation.kind(), "annotation" | "marker_annotation") {
        return;
    }
    let Some(written) = annotation.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let full = context.resolver.class_name(annotation, written).unwrap_or_else(|| written.to_string());
    if !CALL_SUPER.contains(&full.as_str()) {
        return;
    }
    let Some(method) = ancestor(annotation, &["method_declaration", "constructor_declaration"]) else { return };
    let declared = declared_method(context, method);
    if !abstract_method(method, declared.map(|found| found.1)) {
        return;
    }
    let simple = full.rsplit('.').next().unwrap_or(&full);
    context.report_fixed("MissingSuperCall", annotation, annotation.start_byte(), &format!("@{simple} cannot be applied to an abstract method"), &[]);
}

fn calls_super(context: &Context, node: Node, name: &str) -> bool {
    if matches!(node.kind(), "class_body" | "lambda_expression") {
        return false;
    }
    if node.kind() == "method_invocation" && node.child_by_field_name("name").is_some_and(|part| context.text(part) == name) && super_qualifier(node).is_some() {
        return true;
    }
    children(node).into_iter().any(|part| calls_super(context, part, name))
}

pub fn missing_super_call_method(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let Some((origin, declared)) = declared_method(context, method) else { return };
    if declared.is_abstract {
        return;
    }
    let mut found = None;
    for (owner, above) in super_methods(context.resolver.index, origin, declared) {
        if let Some(kind) = CALL_SUPER.iter().find(|kind| above.detail.annotations.iter().any(|name| name == *kind)) {
            found = Some((format!("{}#{}", owner.name, above.name), kind.rsplit('.').next().unwrap_or(kind)));
        }
    }
    let Some((target, simple)) = found else { return };
    let name = context.text(method.child_by_field_name("name").unwrap_or(method));
    let Some(body) = method.child_by_field_name("body") else { return };
    if calls_super(context, body, name) || formals(method).iter().any(|parameter| calls_super(context, *parameter, name)) {
        return;
    }
    let message = format!("This method overrides {target}, which is annotated with @{simple}, but does not call the super method");
    context.report_fixed("MissingSuperCall", method, name_position(method), &message, &[]);
}

fn functional_interface(context: &Context, class: &str) -> bool {
    context.resolver.index.get(class).is_some_and(|info| info.class_annotations.iter().any(|name| name == "java.lang.FunctionalInterface"))
}

fn preserves_behaviour(context: &Context, method: Node, own: (&ClassInfo, &Method), class: &str) -> bool {
    let Some(body) = method.child_by_field_name("body") else { return false };
    let void_boxed = method.child_by_field_name("type").and_then(|kind| context.resolver.type_node(kind)).is_some_and(|kind| kind == Type::class("java.lang.Void"));
    let statements: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let calls_own = |statement: Node| -> bool {
        let expression = match statement.kind() {
            "expression_statement" => named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")),
            "return_statement" => named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")),
            _ => None,
        };
        let Some(call) = expression.filter(|part| part.kind() == "method_invocation") else { return false };
        context.resolver.resolve_call(call).is_some_and(|resolved| {
            resolved.declaring == class && resolved.method.name == own.1.name && resolved.method.parameters == own.1.parameters
        })
    };
    if void_boxed {
        let [first, second] = statements.as_slice() else { return false };
        if !calls_own(*first) {
            return false;
        }
        return second.kind() == "return_statement" && named_children(*second).iter().any(|part| part.kind() == "null_literal");
    }
    matches!(statements.as_slice(), [only] if calls_own(*only))
}

pub fn functional_interface_method_changed(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || !has_modifier(method, "default") {
        return;
    }
    let Some(class) = ancestor(method, &["interface_declaration", "class_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"]) else { return };
    let Some(class_name) = context.resolver.scope.names.get(&class.id()) else { return };
    if !annotations(context, class).iter().any(|(_, name)| name == "java.lang.FunctionalInterface") {
        return;
    }
    let index = context.resolver.index;
    let Some(info) = index.get(class_name) else { return };
    let Some((origin, declared)) = declared_method(context, method) else { return };
    let supers = super_methods(index, origin, declared);
    if supers.is_empty() {
        return;
    }
    let mut sams: Vec<(String, String, Vec<Type>)> = Vec::new();
    for parent in &info.interfaces {
        if functional_interface(context, parent) {
            if let Some((owner, sam)) = index.functional_method(parent) {
                sams.push((owner.name.clone(), sam.name.clone(), sam.parameters.clone()));
            }
        }
    }
    let intersects = supers.iter().any(|(owner, above)| sams.iter().any(|(class, name, parameters)| *class == owner.name && *name == above.name && *parameters == above.parameters));
    let Some((this_owner, this_sam)) = index.functional_method(class_name) else { return };
    if intersects && !preserves_behaviour(context, method, (this_owner, this_sam), &this_owner.name) {
        let message = "Casting a lambda to this @FunctionalInterface can cause a behavior change from casting to a functional superinterface, which is surprising to users.  Prefer decorator methods to this surprising behavior.";
        context.report_fixed("FunctionalInterfaceMethodChanged", method, name_position(method), message, &[]);
    }
}

