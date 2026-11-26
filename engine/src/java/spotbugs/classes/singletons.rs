//! The singleton patterns: a class that keeps one instance of itself in a static field and hands it out from a
//! public static method. SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR, SING_SINGLETON_IMPLEMENTS_SERIALIZABLE,
//! SING_SINGLETON_IMPLEMENTS_CLONEABLE, SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE,
//! SING_SINGLETON_IMPLEMENTS_CLONE_METHOD and SING_SINGLETON_GETTER_NOT_SYNCHRONIZED.
use super::super::{Context, names, place};
use super::{Shape, lines};
use crate::engine::source::{children, named_children, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::scope::TYPE_DECLARATIONS;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &[
    "SING_SINGLETON_HAS_NONPRIVATE_CONSTRUCTOR",
    "SING_SINGLETON_IMPLEMENTS_SERIALIZABLE",
    "SING_SINGLETON_IMPLEMENTS_CLONEABLE",
    "SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE",
    "SING_SINGLETON_IMPLEMENTS_CLONE_METHOD",
    "SING_SINGLETON_GETTER_NOT_SYNCHRONIZED",
];

/// The nodes of a method's own code: not those of classes declared inside nor of lambdas.
fn own_code<'t>(node: Node<'t>, out: &mut Vec<Node<'t>>) {
    for part in children(node) {
        if part.kind() == "class_body" || part.kind() == "lambda_expression" || TYPE_DECLARATIONS.contains(&part.kind()) {
            continue;
        }
        out.push(part);
        own_code(part, out);
    }
}

/// Whether an expression creates an instance of exactly the class, not of a subclass written in place.
fn creates(context: &Context, shape: &Shape, expression: Node) -> bool {
    let expression = crate::java::types::expr::unwrap(expression);
    expression.kind() == "object_creation_expression"
        && !children(expression).iter().any(|part| part.kind() == "class_body")
        && expression.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).is_some_and(|kind| kind.erased().name() == shape.own)
}

/// What a value a method returns holds: a static field of the class, a new instance, or something else.
#[derive(PartialEq)]
enum Held {
    Field(String),
    Created,
    Other,
}

struct Method<'t> {
    code: Vec<Node<'t>>,
    single: HashMap<String, Node<'t>>,
}

impl<'t> Method<'t> {
    fn of(context: &Context, declaration: Node<'t>) -> Method<'t> {
        let mut code = Vec::new();
        own_code(declaration, &mut code);
        let mut values: HashMap<String, Vec<Option<Node<'t>>>> = HashMap::new();
        for node in &code {
            match node.kind() {
                "variable_declarator" if crate::engine::source::parent(*node).is_some_and(|holder| holder.kind() == "local_variable_declaration") => {
                    let Some(name) = node.child_by_field_name("name") else { continue };
                    values.entry(context.text(name).to_string()).or_default().push(node.child_by_field_name("value"));
                }
                "assignment_expression" | "update_expression" => {
                    let target = node.child_by_field_name("left").or_else(|| named_children(*node).into_iter().next());
                    if let Some(target) = target.filter(|target| target.kind() == "identifier") {
                        values.entry(context.text(target).to_string()).or_default().push(None);
                    }
                }
                _ => {}
            }
        }
        let single = values.into_iter().filter_map(|(name, list)| match list.as_slice() {
            [Some(value)] => Some((name, *value)),
            _ => None,
        });
        Method { code, single: single.collect() }
    }

    fn held(&self, context: &Context, shape: &Shape, value: Node, depth: usize) -> Held {
        let value = crate::java::types::expr::unwrap(value);
        if creates(context, shape, value) {
            return Held::Created;
        }
        if value.kind() == "identifier" && depth < 8 {
            let local = matches!(context.resolver.binding(value, context.text(value)), Some(crate::java::types::expr::Binding::Local(_)));
            if local {
                return self.single.get(context.text(value)).map_or(Held::Other, |init| self.held(context, shape, *init, depth + 1));
            }
        }
        match super::super::fields::field_key(context, value) {
            Some((class, name)) if class == shape.own && shape.statics.contains(&name) => Held::Field(name),
            _ => Held::Other,
        }
    }

    fn returned(&self, context: &Context, shape: &Shape) -> Vec<Held> {
        self.code
            .iter()
            .filter(|node| node.kind() == "return_statement")
            .filter_map(|node| node.named_child(0))
            .map(|value| self.held(context, shape, value, 0))
            .collect()
    }

    /// Whether the code compares the static field with `null`.
    fn tests_null(&self, context: &Context, shape: &Shape, field: &str) -> bool {
        self.code.iter().filter(|node| node.kind() == "binary_expression").any(|node| {
            let sides = [node.child_by_field_name("left"), node.child_by_field_name("right")];
            let null = sides.iter().flatten().any(|side| side.kind() == "null_literal");
            let named = sides.iter().flatten().any(|side| self.held(context, shape, *side, 0) == Held::Field(field.to_string()));
            null && named
        })
    }

    /// The static fields of the class this code stores a new instance in.
    fn creations(&self, context: &Context, shape: &Shape) -> HashSet<String> {
        let mut found = HashSet::new();
        for node in &self.code {
            if node.kind() != "assignment_expression" {
                continue;
            }
            let (Some(target), Some(value)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { continue };
            if !creates(context, shape, value) {
                continue;
            }
            if let Some((_, name)) = super::super::fields::field_key(context, target).filter(|(class, name)| *class == shape.own && shape.statics.contains(name)) {
                found.insert(name);
            }
        }
        found
    }
}

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
    let mut created: HashSet<String> = HashSet::new();
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
        if !has_modifier(*member, "private") && returned.contains(&Held::Created) {
            cancelled = true;
        }
        if !has_modifier(*member, "public") {
            continue;
        }
        let inside = method.creations(context, shape);
        for held in returned {
            if let Held::Field(field) = held {
                let lazy = inside.contains(&field) && method.tests_null(context, shape, &field);
                returning.push(Getter { declaration: *member, eager: created.contains(&field), field, lazy });
            }
        }
    }
    let lazily: HashSet<String> = returning.iter().filter(|getter| getter.lazy).map(|getter| getter.field.clone()).collect();
    let getters: Vec<Getter> = returning.into_iter().filter(|getter| getter.eager || lazily.contains(&getter.field)).collect();
    if cancelled || getters.is_empty() {
        return;
    }
    report(context, shape, &getters);
}

fn report(context: &Context, shape: &Shape, getters: &[Getter]) {
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
    let first = shape.first_line;
    if let Some(first) = first {
        if index.is_subtype(&shape.own, "java.io.Serializable") {
            let message = format!("Class ({binary}) using singleton design pattern directly or indirectly implements Serializable interface.");
            context.report_listed("SING_SINGLETON_IMPLEMENTS_SERIALIZABLE", shape.class, first, message, type_place.clone(), 2, vec![binary.clone()]);
        }
        let direct = index.get(&shape.own).is_some_and(|info| info.interfaces.iter().any(|name| name == "java.lang.Cloneable"));
        if direct {
            let message = format!("Class ({binary}) using singleton design pattern directly implements Cloneable interface.");
            context.report_listed("SING_SINGLETON_IMPLEMENTS_CLONEABLE", shape.class, first, message, type_place.clone(), 2, vec![binary.clone()]);
        } else if index.is_subtype(&shape.own, "java.lang.Cloneable") {
            let message = format!("Class ({binary}) using singleton design pattern indirectly implements Cloneable interface.");
            context.report_listed("SING_SINGLETON_INDIRECTLY_IMPLEMENTS_CLONEABLE", shape.class, first, message, type_place.clone(), 2, vec![binary.clone()]);
        }
    }
    if let Some(clone) = shape.members.iter().find(|member| is_clone(context, **member)).filter(|clone| !throws_unsupported(context, **clone)) {
        let label = names::method(context, &shape.own, *clone, None);
        if let Some(line) = lines::method_start(context, *clone) {
            let message = format!("Class ({binary}) using singleton design pattern implements clone() method without being an unconditional CloneNotSupportedException-thrower.");
            context.report_listed("SING_SINGLETON_IMPLEMENTS_CLONE_METHOD", *clone, line, message, place::function(&label), 2, vec![binary.clone()]);
        }
    }
    let kept = getters.iter().find(|getter| getter.eager).or(getters.first()).map(|getter| getter.field.clone());
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
    let mut found = false;
    walk(method, |node| found |= node.kind() == "synchronized_statement");
    found
}

pub fn is_clone(context: &Context, member: Node) -> bool {
    member.kind() == "method_declaration"
        && member.child_by_field_name("name").is_some_and(|name| context.text(name) == "clone")
        && member.child_by_field_name("parameters").is_some_and(|parameters| named_children(parameters).iter().all(|part| part.kind().ends_with("comment")))
}

/// Whether a method's body is nothing but `throw new CloneNotSupportedException(...)`.
fn throws_unsupported(context: &Context, method: Node) -> bool {
    let Some(body) = method.child_by_field_name("body") else { return false };
    let statements: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let [only] = statements.as_slice() else { return false };
    only.kind() == "throw_statement"
        && only.named_child(0).is_some_and(|thrown| {
            thrown.kind() == "object_creation_expression"
                && thrown.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)).is_some_and(|kind| kind.erased().name() == "java.lang.CloneNotSupportedException")
        })
}
