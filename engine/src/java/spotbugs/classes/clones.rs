//! The clone idiom: CN_IDIOM (a class implements `Cloneable` without defining or using `clone()`),
//! CN_IDIOM_NO_SUPER_CALL (a public `clone()` of a cloneable class that does not call `super.clone()`) and
//! CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE (a public `clone()` in a class that is not cloneable).
use super::super::{Context, names, place};
use super::{Shape, lines};
use crate::engine::source::{children, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &["CN_IDIOM", "CN_IDIOM_NO_SUPER_CALL", "CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE"];

fn calls_clone(context: &Context, call: Node, on_super: bool) -> bool {
    call.kind() == "method_invocation"
        && call.child_by_field_name("name").is_some_and(|name| context.text(name) == "clone")
        && call.child_by_field_name("arguments").is_some_and(|arguments| arguments.named_child_count() == 0)
        && (!on_super || call.child_by_field_name("object").is_some_and(|object| object.kind() == "super"))
}

/// Whether the method's own code, outside lambdas and classes declared inside, holds a node that passes `test`.
fn holds(method: Node, test: &dyn Fn(Node) -> bool) -> bool {
    let mut stack = children(method);
    while let Some(node) = stack.pop() {
        if test(node) {
            return true;
        }
        if node.kind() != "class_body" && node.kind() != "lambda_expression" && !TYPE_DECLARATIONS.contains(&node.kind()) {
            stack.extend(children(node));
        }
    }
    false
}

/// The class's public instance `clone()`, with a body or native.
fn public_clone<'t>(context: &Context, shape: &Shape<'t>) -> Option<Node<'t>> {
    shape.members.iter().copied().find(|member| super::singletons::is_clone(context, *member) && has_modifier(*member, "public") && !has_modifier(*member, "static"))
}

/// Whether a method cannot end but by throwing: no `return` and a `throw`, or a call of `System.exit`.
fn never_returns(context: &Context, method: Node) -> bool {
    let exits = holds(method, &|node| {
        node.kind() == "method_invocation"
            && node.child_by_field_name("name").is_some_and(|name| context.text(name) == "exit")
            && node.child_by_field_name("object").is_some_and(|object| matches!(context.text(object), "System" | "java.lang.System"))
    });
    exits || (!holds(method, &|node| node.kind() == "return_statement") && holds(method, &|node| node.kind() == "throw_statement"))
}

/// Whether others can see the class: public or protected, or a member of an interface.
fn visible(class: Node) -> bool {
    let in_interface = crate::engine::source::parent(class)
        .and_then(crate::engine::source::parent)
        .is_some_and(|holder| matches!(holder.kind(), "interface_declaration" | "annotation_type_declaration"));
    has_modifier(class, "public") || has_modifier(class, "protected") || in_interface
}

fn covariant(context: &Context, method: Node) -> bool {
    method.child_by_field_name("type").is_some_and(|written| !matches!(context.text(written), "Object" | "java.lang.Object"))
}

pub fn check(context: &Context, shape: &Shape) {
    let kind = shape.class.kind();
    if kind == "interface_declaration" || kind == "annotation_type_declaration" || !context.wants(PATTERNS) {
        return;
    }
    let index = context.resolver.index;
    let binary = names::binary(context, &shape.own);
    let cloneable = index.is_subtype(&shape.own, "java.lang.Cloneable");
    let anonymous = kind == "object_creation_expression";
    let open = !has_modifier(shape.class, "abstract");
    let clone = public_clone(context, shape);
    let classy = matches!(kind, "class_declaration" | "record_declaration") || anonymous;
    if let Some(clone) = clone.filter(|clone| classy && open && (clone.child_by_field_name("body").is_some() || has_modifier(*clone, "native"))) {
        let label = names::method(context, &shape.own, clone, None);
        let line = if has_modifier(clone, "native") { Some(0) } else { lines::method_start(context, clone) };
        let supered = holds(clone, &|node| calls_clone(context, node, true));
        if let Some(line) = line {
            if !cloneable && !super::singletons::throws_unsupported(context, clone) {
                let covariant = covariant(context, clone);
                let in_clone = anonymous && crate::engine::source::ancestor(shape.class, &["method_declaration"]).is_some_and(|around| super::singletons::is_clone(context, around));
                let message = format!("{binary} defines clone() but doesn't implement Cloneable");
                let priority = if supered || covariant || in_clone { 1 } else { 2 };
                context.report_listed("CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE", clone, line, message, place::function(&label), priority, vec![binary.clone()]);
            } else if !supered && kind == "class_declaration" && visible(shape.class) && !never_returns(context, clone) && !has_modifier(shape.class, "final") {
                let message = format!("{label} does not call super.clone()");
                let priority = if context.project.extended.contains(&shape.own) { 1 } else { 2 };
                context.report_listed("CN_IDIOM_NO_SUPER_CALL", clone, line, message, place::function(&label), priority, vec![label.clone()]);
            }
        }
    }
    let info = index.get(&shape.own);
    let direct = info.is_some_and(|info| info.interfaces.iter().any(|name| name == "java.lang.Cloneable"));
    let inherited = info.and_then(|info| info.superclass.as_ref()).is_some_and(|superclass| index.is_subtype(superclass, "java.lang.Cloneable"));
    if direct && !inherited && kind != "enum_declaration" && open && clone.is_none() && !shape.members.iter().any(|member| super::singletons::is_clone(context, *member) && covariant(context, *member)) {
        let mut used = false;
        walk(shape.class, |node| used |= calls_clone(context, node, false));
        if let Some(first) = shape.first_line.filter(|_| !used) {
            let message = format!("Class {binary} implements Cloneable but does not define or use clone method");
            context.report_listed("CN_IDIOM", shape.class, first, message, place::class(context, &shape.own), 2, vec![binary.clone()]);
        }
    }
}
