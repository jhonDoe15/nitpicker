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

/// The class's public instance `clone()` with a body.
fn public_clone<'t>(context: &Context, shape: &Shape<'t>) -> Option<Node<'t>> {
    shape.members.iter().copied().find(|member| {
        super::singletons::is_clone(context, *member) && has_modifier(*member, "public") && !has_modifier(*member, "static") && member.child_by_field_name("body").is_some()
    })
}

pub fn check(context: &Context, shape: &Shape) {
    if shape.class.kind() == "interface_declaration" || shape.class.kind() == "annotation_type_declaration" || !context.wants(PATTERNS) {
        return;
    }
    let index = context.resolver.index;
    let binary = names::binary(context, &shape.own);
    let cloneable = index.is_subtype(&shape.own, "java.lang.Cloneable");
    let open = !has_modifier(shape.class, "abstract");
    let concrete = shape.class.kind() != "enum_declaration" && open;
    let clone = public_clone(context, shape);
    if let Some(clone) = clone.filter(|_| shape.class.kind() == "class_declaration" && open) {
        let label = names::method(context, &shape.own, clone, None);
        let line = lines::method_start(context, clone);
        let supered = holds(clone, &|node| calls_clone(context, node, true));
        let visible = has_modifier(shape.class, "public") || has_modifier(shape.class, "protected");
        let returns = holds(clone, &|node| node.kind() == "return_statement");
        if let Some(line) = line {
            if !cloneable {
                let message = format!("{binary} defines clone() but doesn't implement Cloneable");
                let priority = if supered { 1 } else { 2 };
                context.report_listed("CN_IMPLEMENTS_CLONE_BUT_NOT_CLONEABLE", clone, line, message, place::function(&label), priority, vec![binary.clone()]);
            } else if !supered && visible && returns && !has_modifier(shape.class, "final") {
                let message = format!("{label} does not call super.clone()");
                let priority = if context.project.extended.contains(&shape.own) { 1 } else { 2 };
                context.report_listed("CN_IDIOM_NO_SUPER_CALL", clone, line, message, place::function(&label), priority, vec![label.clone()]);
            }
        }
    }
    let direct = index.get(&shape.own).is_some_and(|info| info.interfaces.iter().any(|name| name == "java.lang.Cloneable"));
    if direct && concrete && clone.is_none() {
        let mut used = false;
        walk(shape.class, |node| used |= calls_clone(context, node, false));
        if let Some(first) = shape.first_line.filter(|_| !used) {
            let message = format!("Class {binary} implements Cloneable but does not define or use clone method");
            context.report_listed("CN_IDIOM", shape.class, first, message, place::class(context, &shape.own), 2, vec![binary.clone()]);
        }
    }
}
