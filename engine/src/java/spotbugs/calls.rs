//! Which classes of the run a class calls. SpotBugs puts a class off when it calls a method of a class it has not
//! read yet, so the order it reads the classes in follows these calls. Measured on test code: a call counts when
//! the method takes or gives back an object; calls to interfaces and to classes of the class path do not.
use super::Context;
use crate::engine::source::{named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Receiver;
use crate::java::types::model::{ClassInfo, Method, OBJECT, Type, flag};
use crate::java::types::scope::enclosing_types;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

const CALLS: &[&str] = &["method_invocation", "object_creation_expression", "explicit_constructor_invocation"];

fn object(kind: &Type) -> bool {
    !matches!(kind, Type::Primitive(_))
}

/// The class a call names in the compiled code: the type of the object, the class made, or the class around
/// the call that has the method.
fn owner(context: &Context, call: Node, by: &str) -> Option<String> {
    let resolver = context.resolver;
    let index = resolver.index;
    match call.kind() {
        "object_creation_expression" => match resolver.scope.names.get(&call.id()) {
            Some(anonymous) => Some(anonymous.clone()),
            None => resolver.type_node(call.child_by_field_name("type")?).map(|made| made.erased().name()),
        },
        "explicit_constructor_invocation" => {
            let above = call.child_by_field_name("constructor").is_some_and(|word| word.kind() == "super");
            above.then(|| index.get(by)?.superclass.clone()).flatten()
        }
        _ => match call.child_by_field_name("object") {
            Some(object) if object.kind() == "super" => index.get(by)?.superclass.clone(),
            Some(object) if lambda_parameter(context, object) => None,
            Some(object) => match resolver.receiver(object)? {
                Receiver::Value(kind @ Type::Class(..)) => Some(kind.erased().name()),
                Receiver::Static(name) => Some(name),
                Receiver::Value(_) => None,
            },
            None => {
                let name = context.text(call.child_by_field_name("name")?);
                let around = enclosing_types(resolver.scope, call).into_iter().find(|class| !index.methods(class, name).is_empty());
                around.or_else(|| resolver.resolve_call(call).map(|found| found.receiver.erased().name()))
            }
        },
    }
}

/// Whether a name is a parameter written without its type of a lambda that is an argument of a call that is an
/// argument itself. Its type would have to come from both calls at once, which costs seconds in files that build
/// tables of such lambdas; calls on these names are left out.
fn lambda_parameter(context: &Context, usage: Node) -> bool {
    if usage.kind() != "identifier" {
        return false;
    }
    let name = context.text(usage);
    let mut current = parent(usage);
    while let Some(at) = current {
        if at.kind() == "lambda_expression" {
            let named = at.child_by_field_name("parameters").is_some_and(|list| match list.kind() {
                "identifier" => context.text(list) == name,
                "inferred_parameters" => named_children(list).into_iter().any(|parameter| context.text(parameter) == name),
                _ => false,
            });
            if named {
                return nested_argument(at);
            }
        }
        current = parent(at);
    }
    false
}

fn nested_argument(lambda: Node) -> bool {
    let mut lists = 0;
    let mut current = parent(lambda);
    while let Some(at) = current {
        match at.kind() {
            "argument_list" => lists += 1,
            "method_invocation" | "object_creation_expression" | "parenthesized_expression" | "cast_expression" => {}
            _ => break,
        }
        current = parent(at);
    }
    lists >= 2
}

/// Whether the code sits where there is no instance: a static method, a static field or a static initializer.
fn fixed_place(node: Node) -> bool {
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "static_initializer" => return true,
            "method_declaration" | "field_declaration" => return has_modifier(at, "static") || parent(at).is_some_and(|body| body.kind() == "interface_body"),
            "constructor_declaration" | "class_body" | "enum_body" | "interface_body" => return at.kind() == "interface_body",
            _ => current = parent(at),
        }
    }
    false
}

/// Whether the called method takes or gives back an object. The methods of that name and argument count mostly
/// agree, which saves working out the argument types.
fn carries(context: &Context, call: Node, owner: &str) -> bool {
    let index = context.resolver.index;
    let constructor = call.kind() != "method_invocation";
    if constructor {
        // An anonymous class takes what it captures; the constructor of an inner class takes the instance around it.
        let inner = index.get(owner).is_some_and(|info| {
            let member = info.name.rsplit_once('.').is_some_and(|(holder, _)| index.from_source(holder) && index.get(holder).is_some_and(|around| !around.is_interface));
            member && info.flags & (flag::STATIC | flag::ENUM | flag::RECORD) == 0
        });
        if context.resolver.scope.names.contains_key(&call.id()) {
            return !fixed_place(call) || call.child_by_field_name("arguments").is_some_and(|list| !named_children(list).is_empty());
        }
        if inner {
            return true;
        }
    }
    let name = if constructor { "<init>" } else { call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default() };
    let given = call.child_by_field_name("arguments").map_or(0, |list| named_children(list).len());
    let takes = |method: &Method| method.parameters.iter().any(object) || (!constructor && object(&method.returns));
    let fits = |method: &Method| method.parameters.len() == given || (method.varargs && given + 1 >= method.parameters.len());
    // The compiled code names `java.lang.Object` for the methods every object has, and a constructor is never inherited.
    let named = |info: &ClassInfo| if constructor { info.name == owner } else { info.name != OBJECT };
    let verdicts: HashSet<bool> =
        index.methods(owner, name).into_iter().filter(|(info, method)| named(info) && fits(method)).map(|(_, method)| takes(method)).collect();
    match verdicts.len() {
        0 => false,
        1 => verdicts.contains(&true),
        _ => context.resolver.call_formals(call).is_some_and(|(found, _)| takes(&found.method)),
    }
}

/// Per class of the file: the classes of the run, other than itself and interfaces, whose methods it calls.
pub fn gather(context: &Context) -> HashMap<String, HashSet<String>> {
    let index = context.resolver.index;
    let mut found: HashMap<String, HashSet<String>> = context.classes.keys().map(|class| (class.clone(), HashSet::new())).collect();
    walk(context.file.tree.root_node(), |node| {
        if !CALLS.contains(&node.kind()) {
            return;
        }
        if let Some(anonymous) = context.resolver.scope.names.get(&node.id()).filter(|_| node.kind() == "object_creation_expression") {
            found.entry(anonymous.clone()).or_default();
        }
        let Some(by) = enclosing_types(context.resolver.scope, node).into_iter().next() else { return };
        let Some(owner) = owner(context, node, &by) else { return };
        let counts = owner != by && index.from_source(&owner) && index.get(&owner).is_some_and(|info| !info.is_interface);
        if counts && !found.get(&by).is_some_and(|known| known.contains(&owner)) && carries(context, node, &owner) {
            found.entry(by).or_default().insert(owner);
        }
    });
    found
}
