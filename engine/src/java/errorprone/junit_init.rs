//! JUnit4SetUpNotRun, JUnit4TearDownNotRun and JUnit4ClassAnnotationNonStatic, with the JUnit matchers the other
//! JUnit checks share.
use super::Context;
use super::fix_helpers::add_modifiers;
use super::fixes::Fix;
use super::guice::{annotations, has_annotation};
use super::hierarchy::{declared_method, formals, super_methods};
use super::nodes::name_position;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::scope::TYPE_DECLARATIONS;
use tree_sitter::Node;

pub const TEST: &str = "org.junit.Test";
const RUNNERS: [&str; 2] = ["org.mockito.junit.MockitoJUnitRunner", "org.junit.runners.BlockJUnit4ClassRunner"];

/// `hasAnnotationOnAnyOverriddenMethod`: the method or a method it overrides carries one of the annotations.
pub fn annotated_on_overridden(context: &Context, method: Node, wanted: &[&str]) -> bool {
    if has_annotation(context, method, wanted) {
        return true;
    }
    let Some((origin, declared)) = declared_method(context, method) else { return false };
    super_methods(context.resolver.index, origin, declared).iter().any(|(_, above)| above.detail.annotations.iter().any(|name| wanted.contains(&name.as_str())))
}

/// `JUnitMatchers.hasJUnitAnnotation`: any annotation from `org.junit` on the method or a method it overrides.
pub fn has_junit_annotation(context: &Context, method: Node) -> bool {
    if annotations(context, method).iter().any(|(_, name)| name.starts_with("org.junit.")) {
        return true;
    }
    let Some((origin, declared)) = declared_method(context, method) else { return false };
    super_methods(context.resolver.index, origin, declared).iter().any(|(_, above)| above.detail.annotations.iter().any(|name| name.starts_with("org.junit.")))
}

fn class_literal_type(context: &Context, value: Node) -> Option<String> {
    let value = crate::java::types::expr::unwrap(value);
    if value.kind() != "class_literal" {
        return None;
    }
    let written = value.named_child(0)?;
    Some(context.resolver.type_node(written)?.erased().name())
}

/// The expression of the `value` element of an annotation.
pub fn value_argument<'t>(context: &Context, annotation: Node<'t>) -> Option<Node<'t>> {
    let list = annotation.child_by_field_name("arguments")?;
    for argument in named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")) {
        match argument.kind() {
            "element_value_pair" if argument.child_by_field_name("key").is_some_and(|key| context.text(key) == "value") => return argument.child_by_field_name("value"),
            "element_value_pair" => {}
            _ => return Some(argument),
        }
    }
    None
}

/// An annotation whose `value` is a class literal of a subtype of one of the runners.
pub fn runner_annotation<'t>(context: &Context, class: Node<'t>, annotation_name: Option<&str>, runners: &[&str]) -> Option<Node<'t>> {
    let index = context.resolver.index;
    annotations(context, class).into_iter().find_map(|(annotation, name)| {
        if annotation_name.is_some_and(|wanted| wanted != name) {
            return None;
        }
        let runner = class_literal_type(context, value_argument(context, annotation)?)?;
        runners.iter().any(|known| index.has(known) && index.is_subtype(&runner, known)).then_some(annotation)
    })
}

fn class_name(context: &Context, class: Node) -> Option<String> {
    context.resolver.scope.names.get(&class.id()).cloned()
}

/// `JUnitMatchers.isJUnit4TestClass`.
pub fn is_junit4_test_class(context: &Context, class: Node) -> bool {
    if has_modifier(class, "abstract") || class_name(context, class).is_some_and(|name| context.resolver.index.is_subtype(&name, "junit.framework.TestCase")) {
        return false;
    }
    if runner_annotation(context, class, None, &RUNNERS).is_some() {
        return true;
    }
    members(class).into_iter().any(|member| member.kind() == "method_declaration" && annotated_on_overridden(context, member, &[TEST]))
}

pub fn members<'t>(class: Node<'t>) -> Vec<Node<'t>> {
    let Some(body) = class.child_by_field_name("body") else { return Vec::new() };
    let mut found = Vec::new();
    for part in named_children(body) {
        if part.kind() == "enum_body_declarations" {
            found.extend(named_children(part));
        } else {
            found.push(part);
        }
    }
    found
}

pub fn enclosing_class(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        if TYPE_DECLARATIONS.contains(&at.kind()) || at.kind() == "object_creation_expression" && children(at).iter().any(|part| part.kind() == "class_body") {
            return Some(at);
        }
        current = parent(at);
    }
    None
}

fn returns_void(context: &Context, method: Node) -> bool {
    method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "void")
}

fn looks_like_set_up_or_tear_down(context: &Context, method: Node) -> bool {
    formals(method).is_empty()
        && (has_modifier(method, "public") || has_modifier(method, "protected"))
        && !has_modifier(method, "abstract")
        && !has_modifier(method, "static")
        && returns_void(context, method)
}

fn simple_annotation_named(context: &Context, method: Node, simple: &str) -> bool {
    annotations(context, method).iter().any(|(_, name)| name.rsplit('.').next() == Some(simple))
}

/// The pieces that set-up and tear-down differ in.
struct Kind {
    check: &'static str,
    method: &'static str,
    simple: &'static str,
    own: [&'static str; 2],
    replacements: [(&'static str, &'static str); 2],
    message: &'static str,
}

const SET_UP: Kind = Kind {
    check: "JUnit4SetUpNotRun",
    method: "setUp",
    simple: "Before",
    own: ["org.junit.Before", "org.junit.BeforeClass"],
    replacements: [("org.junit.After", "org.junit.Before"), ("org.junit.AfterClass", "org.junit.BeforeClass")],
    message: "setUp() method will not be run; please add JUnit's @Before annotation",
};

const TEAR_DOWN: Kind = Kind {
    check: "JUnit4TearDownNotRun",
    method: "tearDown",
    simple: "After",
    own: ["org.junit.After", "org.junit.AfterClass"],
    replacements: [("org.junit.Before", "org.junit.After"), ("org.junit.BeforeClass", "org.junit.AfterClass")],
    message: "tearDown() method will not be run; please add JUnit's @After annotation",
};

fn unqualified(name: &str) -> &str {
    name.rsplit('.').next().unwrap_or(name)
}

/// `makeProtectedPublic`: the modifiers with `protected` written as `public`.
fn protected_public(context: &Context, method: Node, fix: Fix) -> Fix {
    let Some(holder) = crate::java::helpers::modifiers(method).filter(|_| has_modifier(method, "protected")) else { return fix };
    let text = context.text(holder).replacen("protected", "public", 1);
    fix.and(holder.start_byte(), holder.end_byte(), text)
}

fn not_run(context: &Context, method: Node, kind: &Kind) {
    if method.kind() != "method_declaration" || !looks_like_set_up_or_tear_down(context, method) {
        return;
    }
    let named = method.child_by_field_name("name").is_some_and(|name| context.text(name) == kind.method);
    if !named && !simple_annotation_named(context, method, kind.simple) {
        return;
    }
    if annotated_on_overridden(context, method, &kind.own[..1]) || has_annotation(context, method, &kind.own[1..]) || annotated_on_overridden(context, method, &[TEST]) {
        return;
    }
    if !enclosing_class(method).is_some_and(|class| is_junit4_test_class(context, class)) {
        return;
    }
    let found = annotations(context, method);
    for (bad, good) in kind.replacements {
        let Some((annotation, _)) = found.iter().rev().find(|(_, name)| name == bad) else { continue };
        let fix = Fix::replace(annotation.start_byte(), annotation.end_byte(), format!("@{}", unqualified(good))).with_imports();
        return context.report_fixed(kind.check, *annotation, annotation.start_byte(), kind.message, &[fix]);
    }
    if let Some((annotation, _)) = found.iter().find(|(annotation, _)| {
        annotation.child_by_field_name("name").is_some_and(|name| unqualified(context.text(name)) == kind.simple)
    }) {
        let fix = protected_public(context, method, Fix::new().with_imports());
        return context.report_fixed(kind.check, *annotation, annotation.start_byte(), kind.message, &[fix]);
    }
    let fix = protected_public(context, method, Fix::new().with_imports()).insert(method.start_byte(), format!("@{}\n", kind.simple));
    context.report_fixed(kind.check, method, name_position(method), kind.message, &[fix]);
}

pub fn set_up_not_run(context: &Context, method: Node) {
    not_run(context, method, &SET_UP);
}

pub fn tear_down_not_run(context: &Context, method: Node) {
    not_run(context, method, &TEAR_DOWN);
}

pub fn class_annotation_non_static(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let found: Vec<String> = annotations(context, method)
        .into_iter()
        .map(|(_, name)| name)
        .filter(|name| matches!(name.as_str(), "org.junit.AfterClass" | "org.junit.BeforeClass"))
        .collect();
    if found.is_empty() || has_modifier(method, "static") {
        return;
    }
    let names: Vec<&str> = found.iter().map(|name| unqualified(name)).collect();
    let message = format!("{} can only be applied to static methods.", names.join(" and "));
    let fix = add_modifiers(Fix::new(), method, &["static"]);
    context.report_fixed("JUnit4ClassAnnotationNonStatic", method, name_position(method), &message, &[fix]);
}
