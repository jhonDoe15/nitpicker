//! FindSelfComparison2 on values read from a field that only calls made out of date: a call keeps them when it has no
//! side effect (a JDK constructor, a JDK method of `returns/jdk.rs` without one or whose ignored result is reported, or
//! a method of the run that `returns` settles the same way, where a `throw` has none and a method returning `void` with
//! no code has one), and so does any call when the run stores into the field only in constructors and initializers
//! (Lombok's setters count, from the class files or from `@Setter` and `@Data`). Those findings wait for the whole run.
use super::super::super::{Context, lombok, names, returns};
use super::super::flow::values::Key;
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::HashSet;
use tree_sitter::Node;

/// What the calls that made a value read from `field` out of date need for the finding to count; `None` when
/// none of them can have an effect.
pub fn wait(context: &Context, field: &Key, causes: &[Option<Node>]) -> Option<returns::Wait> {
    let (mut calls, mut certain) = (Vec::new(), false);
    for cause in causes {
        match cause.and_then(|node| returns::call_of(context, node)) {
            Some(call) if context.resolver.index.from_source(&call.declaring) => calls.push(returns::key_of(&call)),
            Some(call) => certain |= !returns::jdk_quiet(context, &call),
            None => certain = true,
        }
    }
    (certain || !calls.is_empty()).then(|| returns::Wait::Stale { field: field.clone(), calls, certain })
}

/// The fields the file stores into outside constructors, initializers and field initializers.
pub fn written(context: &Context) -> HashSet<Key> {
    let mut found = HashSet::new();
    crate::engine::source::walk(context.file.tree.root_node(), |node| {
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => node.named_child(0),
            _ => None,
        };
        let Some(target) = target.map(crate::java::types::expr::unwrap) else { return };
        if outside_construction(node) {
            found.extend(super::super::super::fields::field_key(context, target));
        }
    });
    for (own, class) in &context.classes {
        let setters = ["Setter", "Data"].iter().any(|name| lombok::annotated(context, *class, name));
        let body = class.child_by_field_name("body").map(crate::engine::source::named_children).unwrap_or_default();
        for field in body.into_iter().filter(|member| member.kind() == "field_declaration" && !has_modifier(*member, "static") && !has_modifier(*member, "final")) {
            if setters || lombok::annotated(context, field, "Setter") {
                let named = declarators(field).into_iter().filter_map(|declarator| declarator.child_by_field_name("name"));
                found.extend(named.map(|name| (own.clone(), context.text(name).to_string())));
            }
        }
        let binary = names::binary(context, own);
        let setters = lombok::written(context, own).filter(|method| method.name != "<init>");
        let stored = setters.flat_map(|method| method.accesses.iter()).filter(|access| access.store && access.owner == binary);
        found.extend(stored.map(|access| (own.clone(), access.name.clone())));
    }
    found
}

/// Whether the nearest code around a node is a method or a lambda.
fn outside_construction(node: Node) -> bool {
    let mut at = node.parent();
    while let Some(holder) = at {
        match holder.kind() {
            "method_declaration" | "lambda_expression" => return true,
            "constructor_declaration" | "compact_constructor_declaration" | "static_initializer" | "field_declaration" => return false,
            "block" if holder.parent().is_some_and(|body| body.kind() == "class_body") => return false,
            kind if TYPE_DECLARATIONS.contains(&kind) => return false,
            _ => at = holder.parent(),
        }
    }
    false
}
