//! IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD: code of a class with an outer instance calls, on `this`,
//! an inherited method while a class around it declares an instance method with the same name and descriptor.
//! SpotBugs only looks at classes that keep the outer instance in a field, and at calls in the methods javac writes
//! for the class itself, not in its lambdas. One finding per method and called method, at its first call.
use super::super::{Context, names, place};
use super::Compiled;
use super::outer_this::keeps_outer;
use crate::java::types::model::Method;
use crate::java::types::scope::enclosing_types;
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERN: &str = "IA_AMBIGUOUS_INVOCATION_OF_INHERITED_OR_OUTER_METHOD";

/// Whether a call goes to a method of `own` on `this`: written without a receiver and found in `own` first, or
/// written on `this` or `Own.this`.
fn on_this(context: &Context, own: &str, call: Node) -> bool {
    let name = call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    match call.child_by_field_name("object") {
        None => enclosing_types(context.resolver.scope, call).first().is_some_and(|first| first == own) && !context.resolver.index.methods(own, name).is_empty(),
        Some(object) if object.kind() == "this" => true,
        Some(object) if object.kind() == "field_access" && object.child_by_field_name("field").is_some_and(|field| field.kind() == "this") => {
            object.child_by_field_name("object").and_then(|outer| context.resolver.class_name(call, context.text(outer))).is_some_and(|outer| outer == own)
        }
        _ => false,
    }
}

/// The class and method of an enclosing class that declare an instance method like `called`.
fn outer_method<'i>(context: &'i Context, own: &str, called: &Method) -> Option<(String, &'i Method)> {
    let index = context.resolver.index;
    let class = context.classes.get(own)?;
    super::outer_this::outers(context, own, *class).into_iter().find_map(|outer| {
        let info = index.get(&outer)?;
        let found = info.methods.iter().find(|method| !method.is_static && method.name == called.name && method.parameters == called.parameters && method.returns.erased() == called.returns.erased())?;
        Some((outer, found))
    })
}

pub fn check(context: &Context, own: &str, class: Node, methods: &[Compiled]) {
    if !context.wants(&[PATTERN]) || !keeps_outer(context, own, class) {
        return;
    }
    let index = context.resolver.index;
    let binary = names::binary(context, own);
    for method in methods.iter().filter(|method| !method.lambda) {
        let mut seen = HashSet::new();
        for call in method.nodes.iter().copied().filter(|node| node.kind() == "method_invocation") {
            if !on_this(context, own, call) {
                continue;
            }
            let Some(resolved) = context.resolver.resolve_call(call) else { continue };
            if resolved.method.is_static || resolved.method.is_private || resolved.declaring == own || resolved.declaring == "java.lang.Object" {
                continue;
            }
            let Some((outer, found)) = outer_method(context, own, &resolved.method).filter(|(outer, _)| *outer != resolved.declaring) else { continue };
            let declaring = if index.get(&resolved.declaring).is_some_and(|info| info.is_interface) { own.to_string() } else { resolved.declaring.clone() };
            let inherited = super::called(context, &declaring, &resolved.method.name, &resolved.method.parameters);
            if !seen.insert(inherited.clone()) {
                continue;
            }
            let shown = names::binary(context, &declaring);
            let priority = if names::package_of(&shown) == names::package_of(&binary) { 2 } else { 1 };
            let target = super::called(context, &outer, &found.name, &found.parameters);
            let line = call.child_by_field_name("arguments").map_or_else(|| context.line(call), |arguments| context.line(arguments));
            let message = format!("Potentially ambiguous invocation of either an outer or inherited method {inherited} in {}", method.label);
            context.report_listed(PATTERN, call, line, message, place::function(&target), priority, vec![inherited, method.label.clone()]);
        }
    }
}
