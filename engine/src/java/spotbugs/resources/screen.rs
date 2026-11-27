//! Which classes of a file SpotBugs looks at for a detector that first checks the methods a class calls: the class
//! of each call as javac names it, method references and constructors included.
use super::super::Context;
use crate::engine::source::walk;
use crate::java::types::model::OBJECT;
use crate::java::types::scope::enclosing_types;
use std::collections::HashSet;
use tree_sitter::Node;

const CALLS: &[&str] = &["method_invocation", "object_creation_expression", "explicit_constructor_invocation", "method_reference"];

/// The classes whose own code (lambdas included, nested and anonymous classes not) calls a method of a class
/// `wanted` accepts.
pub fn callers(context: &Context, wanted: &dyn Fn(&str) -> bool) -> HashSet<String> {
    let index = context.resolver.index;
    let extends = |class: &&String| index.get(class).and_then(|info| info.superclass.as_deref()).is_some_and(wanted);
    let mut found: HashSet<String> = context.classes.keys().filter(extends).cloned().collect();
    walk(context.file.tree.root_node(), |node| {
        if !CALLS.contains(&node.kind()) {
            return;
        }
        let Some(by) = enclosing_types(context.resolver.scope, node).into_iter().next() else { return };
        if owner(context, node, &by).is_some_and(|owner| wanted(&owner)) {
            found.insert(by);
        }
    });
    found
}

/// The class javac names for a call: `java.lang.Object` for a method only `Object` declares.
pub fn owner(context: &Context, call: Node, by: &str) -> Option<String> {
    let (owner, name) = match call.kind() {
        "method_reference" => {
            let qualifier = call.named_child(0)?;
            let kind = context.resolver.type_node(qualifier).or_else(|| context.resolver.type_of(qualifier))?;
            let name = call.named_child(u32::try_from(call.named_child_count()).ok()?.checked_sub(1)?).filter(|last| last.id() != qualifier.id());
            (kind.erased().name(), name.map_or("new", |name| context.text(name)))
        }
        "method_invocation" => (super::super::calls::owner(context, call, by)?, context.text(call.child_by_field_name("name")?)),
        _ => return super::super::calls::owner(context, call, by),
    };
    if name == "new" {
        return Some(owner);
    }
    let methods = context.resolver.index.methods(&owner, name);
    let only_object = !methods.is_empty() && methods.iter().all(|(info, _)| info.name == OBJECT);
    Some(if only_object { OBJECT.to_string() } else { owner })
}
