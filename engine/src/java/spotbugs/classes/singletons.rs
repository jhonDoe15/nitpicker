//! The singleton patterns: a class that keeps one instance of itself in a static field and hands it out from a
//! public static method. SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR, SING_SINGLETON_IMPLEMENTS_SERIALIZABLE,
//! SING_SINGLETON_IMPLEMENTS_CLONEABLE, SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE,
//! SING_SINGLETON_IMPLEMENTS_CLONE_METHOD and SING_SINGLETON_GETTER_NOT_SYNCHRONIZED.
use super::super::{Context, names, place};
use super::instances::{Held, Method, creates, own_code};
use super::{Shape, lines};
use crate::engine::source::{children, named_children};
use crate::java::helpers::{declarators, has_modifier};
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[
    "SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR",
    "SING_SINGLETON_IMPLEMENTS_SERIALIZABLE",
    "SING_SINGLETON_IMPLEMENTS_CLONEABLE",
    "SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE",
    "SING_SINGLETON_IMPLEMENTS_CLONE_METHOD",
    "SING_SINGLETON_GETTER_NOT_SYNCHRONIZED",
];

struct Getter<'t> {
    declaration: Node<'t>,
    field: String,
    lazy: bool,
    eager: bool,
}

pub fn check(context: &Context, shape: &Shape) {
    if shape.class.kind() != "class_declaration" || !context.wants(PATTERNS) || shape.statics.is_empty() {
        return;
    }
    let mut created: Vec<String> = Vec::new();
    for member in &shape.members {
        match member.kind() {
            "field_declaration" if has_modifier(*member, "static") => {
                for declarator in declarators(*member) {
                    let name = declarator.child_by_field_name("name").map(|name| context.text(name).to_string());
                    if declarator.child_by_field_name("value").is_some_and(|value| creates(context, shape, value)) {
                        created.extend(name);
                    }
                }
            }
            "static_initializer" => created.extend(Method::of(context, *member).creations(context, shape)),
            _ => {}
        }
    }
    let mut returning = Vec::new();
    let mut cancelled = false;
    for member in shape.members.iter().filter(|member| member.kind() == "method_declaration" && has_modifier(**member, "static")) {
        let method = Method::of(context, *member);
        let returned = method.returned(context, shape);
        let own_result = member.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).is_some_and(|kind| kind.erased().name() == shape.own);
        if !has_modifier(*member, "private") && own_result && returned.contains(&Held::Created) {
            cancelled = true;
        }
        if !has_modifier(*member, "public") {
            continue;
        }
        let inside = method.creations(context, shape);
        for held in returned {
            if let Held::Field(field) = held {
                let lazy = inside.contains(&field) && method.creates_when_null(context, shape, &field);
                returning.push(Getter { declaration: *member, eager: created.contains(&field), field, lazy });
            }
        }
    }
    let lazily: HashSet<String> = returning.iter().filter(|getter| getter.lazy).map(|getter| getter.field.clone()).collect();
    let getters: Vec<Getter> = returning.into_iter().filter(|getter| getter.eager || lazily.contains(&getter.field)).collect();
    if cancelled || getters.is_empty() {
        return;
    }
    report(context, shape, &getters, &created);
}

fn report(context: &Context, shape: &Shape, getters: &[Getter], created: &[String]) {
    let binary = names::binary(context, &shape.own);
    let type_place = place::class(context, &shape.own);
    let creates = ["constructor_declaration", "compact_constructor_declaration"];
    let constructors: Vec<Node> = shape.members.iter().copied().filter(|member| creates.contains(&member.kind())).collect();
    let open = if constructors.is_empty() {
        let line = shape.class.child_by_field_name("name").map(|name| context.line(name)).filter(|_| !has_modifier(shape.class, "private"));
        line.map(|line| (shape.class, line))
    } else {
        let first = constructors.iter().copied().find(|constructor| !has_modifier(*constructor, "private"));
        first.and_then(|constructor| Some((constructor, lines::constructor_start(context, constructor)?)))
    };
    let label = open.and_then(|(at, _)| super::super::statements::member_label(context, &shape.own, shape.class, at));
    if let (Some((at, line)), Some(label)) = (open, label) {
        let message = format!("Class ({binary}) using singleton design pattern has non-private constructor.");
        context.report_listed("SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR", at, line, message, place::function(&label), 2, vec![binary.clone()]);
    }
    let index = context.resolver.index;
    let cloneable = index.is_subtype(&shape.own, "java.lang.Cloneable");
    let clone = shape.members.iter().copied().find(|member| is_clone(context, *member)).map(|clone| {
        let covariant = clone.child_by_field_name("type").is_some_and(|written| !matches!(context.text(written), "Object" | "java.lang.Object"));
        (clone, covariant)
    });
    let thrower = clone.is_some_and(|(clone, covariant)| !covariant && throws_unsupported(context, clone));
    if let Some(first) = shape.first_line {
        if index.is_subtype(&shape.own, "java.io.Serializable") {
            let message = format!("Class ({binary}) using singleton design pattern directly or indirectly implements Serializable interface.");
            context.report_listed("SING_SINGLETON_IMPLEMENTS_SERIALIZABLE", shape.class, first, message, type_place.clone(), 2, vec![binary.clone()]);
        }
        let clone_line = clone.map(|(clone, covariant)| if covariant { Some(first) } else { lines::method_start(context, clone) });
        let direct = index.get(&shape.own).is_some_and(|info| info.interfaces.iter().any(|name| name == "java.lang.Cloneable"));
        if direct && !thrower {
            let message = format!("Class ({binary}) using singleton design pattern directly implements Cloneable interface.");
            match clone.zip(clone_line.flatten()) {
                Some(((clone, _), line)) => {
                    let label = names::method(context, &shape.own, clone, None);
                    context.report_listed("SING_SINGLETON_IMPLEMENTS_CLONEABLE", clone, line, message, place::function(&label), 2, vec![binary.clone()]);
                }
                None if clone.is_none() => context.report_listed("SING_SINGLETON_IMPLEMENTS_CLONEABLE", shape.class, first, message, type_place.clone(), 2, vec![binary.clone()]),
                None => {}
            }
        } else if cloneable && !thrower {
            let message = format!("Class ({binary}) using singleton design pattern indirectly implements Cloneable interface.");
            context.report_listed("SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE", shape.class, first, message, type_place.clone(), 2, vec![binary.clone()]);
        }
        if let Some((clone, _)) = clone.filter(|_| !cloneable && !thrower) {
            let label = names::method(context, &shape.own, clone, None);
            if let Some(line) = clone_line.flatten() {
                let message = format!("Class ({binary}) using singleton design pattern implements clone() method without being an unconditional CloneNotSupportedException-thrower.");
                context.report_listed("SING_SINGLETON_IMPLEMENTS_CLONE_METHOD", clone, line, message, place::function(&label), 2, vec![binary.clone()]);
            }
        }
    }
    let latest = |getter: &&Getter| created.iter().rposition(|field| *field == getter.field);
    let eager = getters.iter().filter(|getter| getter.eager).max_by_key(latest);
    let kept = eager.or(getters.last()).map(|getter| getter.field.clone());
    let chosen = getters.iter().rev().find(|getter| Some(&getter.field) == kept.as_ref());
    if let Some(getter) = chosen.filter(|getter| !synchronized(getter.declaration) && getters.iter().any(|other| other.lazy)) {
        let label = names::method(context, &shape.own, getter.declaration, None);
        if let Some(line) = lines::method_start(context, getter.declaration) {
            let message = format!("Instance-getter method of class using singleton design pattern ({binary}) is not synchronized.");
            context.report_listed("SING_SINGLETON_GETTER_NOT_SYNCHRONIZED", getter.declaration, line, message, place::function(&label), 2, vec![binary.clone()]);
        }
    }
}

fn synchronized(method: Node) -> bool {
    if has_modifier(method, "synchronized") {
        return true;
    }
    let mut code = Vec::new();
    own_code(method, &mut code);
    code.iter().any(|node| node.kind() == "synchronized_statement")
}

pub fn is_clone(context: &Context, member: Node) -> bool {
    member.kind() == "method_declaration"
        && member.child_by_field_name("name").is_some_and(|name| context.text(name) == "clone")
        && member.child_by_field_name("parameters").is_some_and(|parameters| named_children(parameters).iter().all(|part| part.kind().ends_with("comment")))
}

/// Whether a method cannot end but by throwing a `CloneNotSupportedException` it creates: no `return`, and a last
/// statement that throws a new one, written in place or kept in a local first.
pub fn throws_unsupported(context: &Context, method: Node) -> bool {
    let Some(body) = method.child_by_field_name("body") else { return false };
    let code = Method::of(context, method);
    if code.code.iter().any(|node| node.kind() == "return_statement") {
        return false;
    }
    let last = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).last();
    let Some(thrown) = last.filter(|last| last.kind() == "throw_statement").and_then(|last| last.named_child(0)) else { return false };
    let mut thrown = crate::java::types::expr::unwrap(thrown);
    if thrown.kind() == "identifier"
        && let Some(value) = code.single.get(context.text(thrown))
    {
        thrown = crate::java::types::expr::unwrap(*value);
    }
    thrown.kind() == "object_creation_expression"
        && !children(thrown).iter().any(|part| part.kind() == "class_body")
        && thrown.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).is_some_and(|kind| kind.erased().name() == "java.lang.CloneNotSupportedException")
}
