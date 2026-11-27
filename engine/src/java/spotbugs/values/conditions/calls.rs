//! Which calls make SpotBugs forget a value it read from a field. As measured, a call forgets the fields that some
//! code of the run stores into outside constructors and initializers, on any object, unless the method is one
//! SpotBugs knows changes nothing: a JDK method without side effects (`returns/jdk.rs`) made on a JDK class and
//! without varargs, or a method of the file whose body has code, only works on its locals and calls such methods
//! (a method that calls itself back counts as such). Making an object forgets the same fields when its constructor
//! in the file does more than store into its own fields, or for a few JDK classes; a lambda forgets nothing.
use super::super::super::Context;
use crate::engine::source::{ancestor, named_children, parent, walk};
use super::super::super::returns::jdk;
use crate::java::Java;
use crate::java::types::expr::Binding;
use crate::java::types::scope::{FileScope, Resolver};
use std::collections::HashSet;
use tree_sitter::Node;

/// JDK classes whose constructors SpotBugs takes as changing fields, as measured.
const JDK_MAKING_CHANGES: &[&str] = &[
    "java.lang.Thread", "java.io.File", "java.util.Random", "java.util.Scanner", "java.util.Date", "java.lang.ThreadLocal",
    "java.util.concurrent.locks.ReentrantLock",
];

const JDK_PURE: &[(&str, &str)] =
    &[("java.lang.Math", "abs"), ("java.lang.String", "valueOf"), ("java.lang.String", "length"), ("java.lang.Object", "hashCode")];

const MEMBERS: &[&str] = &[
    "method_declaration", "constructor_declaration", "compact_constructor_declaration", "lambda_expression", "static_initializer",
    "field_declaration", "block",
];
const BUILDING: &[&str] = &["constructor_declaration", "compact_constructor_declaration", "field_declaration", "block"];

/// The fields the run stores into outside constructors and initializers, by declaring class and name (`?` for a
/// class the store does not tell), from its files read again the first time a value read from a field meets a call.
/// One thread reads them: the others of the pool wait for the answer and could not help.
pub fn rewritten<'a>(context: &Context<'a>) -> &'a HashSet<(String, String)> {
    let project = context.project;
    let elsewhere = context.elsewhere;
    project.rewritten.get_or_init(|| {
        let mut paths: Vec<&String> = project.sources.values().collect();
        paths.sort();
        paths.dedup();
        paths
            .iter()
            .filter_map(|path| crate::engine::runner::parse(&(*path).into(), &Java))
            .flat_map(|file| {
                let scope = FileScope::of(&file);
                let resolver = Resolver::new(&project.index, &file, &scope);
                let (other, _) = Context::of(&resolver, project, elsewhere, Some(Vec::new()));
                stored(&other)
            })
            .collect()
    })
}

fn stored(context: &Context) -> Vec<(String, String)> {
    let mut found = Vec::new();
    walk(context.file.tree.root_node(), |node| {
        let target = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left"),
            "update_expression" => named_children(node).into_iter().next(),
            _ => None,
        };
        let Some(target) = target.map(crate::java::types::expr::unwrap) else { return };
        if member(node).is_none_or(|member| BUILDING.contains(&member.kind())) {
            return;
        }
        match super::super::super::fields::field_key(context, target) {
            Some(key) => found.push(key),
            None if target.kind() == "field_access" => {
                found.extend(target.child_by_field_name("field").map(|field| ("?".to_string(), context.text(field).to_string())));
            }
            None => {}
        }
    });
    found
}

/// The method, constructor, lambda or initializer whose code holds the node.
fn member(node: Node) -> Option<Node> {
    let mut at = parent(node);
    while let Some(holder) = at {
        let initializer = holder.kind() != "block" || parent(holder).is_some_and(|around| around.kind() == "class_body");
        if MEMBERS.contains(&holder.kind()) && initializer {
            return Some(holder);
        }
        at = parent(holder);
    }
    None
}

/// Whether a call or the making of an object may change fields.
pub fn changes(context: &Context, node: Node) -> bool {
    changes_within(context, node, &mut HashSet::new())
}

fn changes_within(context: &Context, call: Node, visiting: &mut HashSet<usize>) -> bool {
    let making = call.kind() == "object_creation_expression";
    if making && named_children(call).iter().any(|part| part.kind() == "class_body") {
        return false;
    }
    let resolved = if making { context.resolver.resolve_constructor(call) } else { context.resolver.resolve_call(call) };
    let Some(resolved) = resolved else { return !making };
    let receiver = resolved.receiver.erased().name();
    if making && JDK_MAKING_CHANGES.contains(&resolved.declaring.as_str()) {
        return true;
    }
    if !making && JDK_PURE.iter().any(|(owner, name)| resolved.declaring == *owner && resolved.method.name == *name) {
        return false;
    }
    let ours = context.project.sources.contains_key(&receiver) || context.classes.contains_key(&resolved.declaring);
    if !making && !ours && !resolved.method.varargs {
        let parameters = jdk::parameters(&resolved.method.parameters);
        if jdk::known(&receiver, &resolved.method.name, &parameters).is_some_and(|known| known.pure || known.ignored) {
            return false;
        }
    }
    let Some(class) = context.classes.get(&resolved.declaring) else { return !making };
    let wanted = if making { "constructor_declaration" } else { "method_declaration" };
    let body = class.child_by_field_name("body");
    let declared = body.map(named_children).unwrap_or_default().into_iter().find(|member| {
        member.kind() == wanted
            && (making || member.child_by_field_name("name").is_some_and(|name| context.text(name) == resolved.method.name))
            && member.child_by_field_name("parameters").is_some_and(|list| {
                named_children(list).iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).count()
                    == resolved.method.parameters.len()
            })
    });
    let Some(code) = declared.and_then(|declared| declared.child_by_field_name("body")) else { return !making };
    if !visiting.insert(code.id()) {
        return false;
    }
    if !making && named_children(code).iter().all(|part| part.kind().ends_with("comment")) {
        return true;
    }
    let mut changing = false;
    walk(code, |node| {
        if changing || ancestor(node, &["lambda_expression", "class_body"]).is_some_and(|around| around.start_byte() > code.start_byte()) {
            return;
        }
        let stored = |target: Node| !local(context, target) && !(making && own(context, target));
        changing = match node.kind() {
            "assignment_expression" => node.child_by_field_name("left").is_some_and(stored),
            "update_expression" => named_children(node).into_iter().next().is_some_and(stored),
            "method_invocation" | "object_creation_expression" => changes_within(context, node, visiting),
            "synchronized_statement" | "throw_statement" => true,
            _ => false,
        };
    });
    changing
}

/// A field of the object a constructor makes: `f` or `this.f`.
fn own(context: &Context, target: Node) -> bool {
    let target = crate::java::types::expr::unwrap(target);
    match target.kind() {
        "identifier" => matches!(context.resolver.binding(target, context.text(target)), Some(Binding::Field(..))),
        "field_access" => target.child_by_field_name("object").is_some_and(|object| object.kind() == "this"),
        _ => false,
    }
}

fn local(context: &Context, target: Node) -> bool {
    let target = crate::java::types::expr::unwrap(target);
    target.kind() == "identifier" && matches!(context.resolver.binding(target, context.text(target)), Some(Binding::Local(_)))
}
