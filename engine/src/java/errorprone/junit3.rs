//! JUnit3TestNotRun and DeadException, with the JUnit 3 matchers they share.
use super::Context;
use super::fix_helpers::{add_modifiers, remove_modifiers};
use super::fixes::Fix;
use super::hierarchy::{declared_method, formals, super_methods};
use super::junit_init::{TEST, annotated_on_overridden, enclosing_class, is_junit4_test_class, members, runner_annotation};
use super::nodes::name_position;
use super::guice::annotations;
use crate::engine::source::{ancestor, children, named_children, parent, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const RUN_WITH: &str = "org.junit.runner.RunWith";
const IGNORE: &str = "org.junit.Ignore";
const RUNNERS: [&str; 2] = ["org.mockito.junit.MockitoJUnitRunner", "org.junit.runners.BlockJUnit4ClassRunner"];

fn class_name(context: &Context, class: Node) -> Option<String> {
    context.resolver.scope.names.get(&class.id()).cloned()
}

fn is_test_case_descendant(context: &Context, class: Node) -> bool {
    class_name(context, class).is_some_and(|name| context.resolver.index.is_subtype(&name, "junit.framework.TestCase"))
}

/// `ASTHelpers.hasAnnotation` on a class: the class itself, or a superclass when the annotation is `@Inherited`.
fn has_class_annotation(context: &Context, class: Node, wanted: &str) -> bool {
    if annotations(context, class).iter().any(|(_, name)| name == wanted) {
        return true;
    }
    let index = context.resolver.index;
    let inherited = index.get(wanted).is_some_and(|info| info.class_annotations.iter().any(|name| name == "java.lang.annotation.Inherited"));
    let Some(name) = class_name(context, class) else { return false };
    inherited && index.superclasses(&name).iter().filter_map(|above| index.get(above)).any(|above| above.class_annotations.iter().any(|found| found == wanted))
}

fn has_junit4_test_cases(context: &Context, class: Node) -> bool {
    members(class).into_iter().any(|member| member.kind() == "method_declaration" && annotated_on_overridden(context, member, &[TEST]))
}

fn top_level(class: Node) -> bool {
    parent(class).is_none_or(|up| up.kind() == "program")
}

/// `JUnitMatchers.isJUnit3TestClass`.
pub fn is_junit3_test_class(context: &Context, class: Node) -> bool {
    class.kind() != "object_creation_expression"
        && is_test_case_descendant(context, class)
        && !has_class_annotation(context, class, RUN_WITH)
        && !has_modifier(class, "abstract")
        && top_level(class)
        && !has_junit4_test_cases(context, class)
}

/// `JUnitMatchers.isAmbiguousJUnitVersion`.
pub(super) fn is_ambiguous_junit_version(context: &Context, class: Node) -> bool {
    class.kind() != "object_creation_expression"
        && is_test_case_descendant(context, class)
        && (runner_annotation(context, class, None, &RUNNERS).is_some() || has_junit4_test_cases(context, class))
}

fn junit4_class(context: &Context, class: Node) -> bool {
    class.kind() != "object_creation_expression" && is_junit4_test_class(context, class)
}

fn is_junit3_test_case(context: &Context, method: Node) -> bool {
    method.child_by_field_name("name").is_some_and(|name| context.text(name).starts_with("test"))
        && formals(method).is_empty()
        && has_modifier(method, "public")
        && returns_void(context, method)
}

fn returns_void(context: &Context, method: Node) -> bool {
    method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "void")
}

/// How much of the start of a name `MISSPELLED_NAME.lookingAt` takes, alternative by alternative.
fn misspelled_prefix(name: &str) -> Option<usize> {
    let chars: Vec<char> = name.chars().collect();
    let take = |text: &str, any: &[usize]| -> Option<usize> {
        let pattern: Vec<char> = text.chars().collect();
        if chars.len() < pattern.len() {
            return None;
        }
        let fits = pattern.iter().enumerate().all(|(at, wanted)| any.contains(&at) || chars[at] == *wanted);
        fits.then_some(pattern.len())
    };
    let found = take("t_est", &[1])
        .or_else(|| take("te_st", &[2]))
        .or_else(|| take("tst", &[]))
        .or_else(|| take("tet", &[]))
        .or_else(|| take("tes", &[]))
        .or_else(|| take("etst", &[]))
        .or_else(|| take("tset", &[]))
        .or_else(|| take("tets", &[]))
        .or_else(|| take("t_st", &[1]))
        .or_else(|| take("te_t", &[2]));
    let lowered: String = chars.iter().take(4).collect::<String>().to_lowercase();
    found.or_else(|| (chars.len() >= 4 && lowered == "test" && chars.iter().take(4).all(|part| part.is_ascii())).then_some(4))
}

fn called(context: &Context, class: &str, method: Node) -> bool {
    let Some(name) = method.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    let Some((_, declared)) = declared_method(context, method) else { return false };
    let mut found = false;
    walk(context.file.tree.root_node(), |node| {
        if found || node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|part| context.text(part) != name) {
            return;
        }
        found = match context.resolver.resolve_call(node) {
            Some(resolved) => resolved.declaring == class && resolved.method.parameters == declared.parameters,
            None => super::positions::arguments(node).len() == declared.parameters.len(),
        };
    });
    found
}

fn upper_first(name: &str) -> String {
    let mut chars = name.chars();
    match chars.next() {
        Some(first) => first.to_uppercase().chain(chars).collect(),
        None => String::new(),
    }
}

pub fn junit3_test_not_run(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let Some(name) = method.child_by_field_name("name").map(|name| context.text(name).to_string()) else { return };
    let Some(class) = enclosing_class(method).filter(|class| is_junit3_test_class(context, *class)) else { return };
    if is_junit3_test_case(context, method) {
        return;
    }
    let simple_end = class_name(context, class).is_some_and(|full| full.rsplit('.').next().is_some_and(|simple| simple.ends_with("Base")));
    if !(formals(method).is_empty() || has_modifier(method, "public")) || simple_end || !returns_void(context, method) {
        return;
    }
    let Some(class_full) = class_name(context, class) else { return };
    let Some((origin, declared)) = declared_method(context, method) else { return };
    if called(context, &class_full, method) || !super_methods(context.resolver.index, origin, declared).is_empty() {
        return;
    }
    let would_run = annotated_on_overridden(context, method, &[TEST]) && !annotated_on_overridden(context, method, &[IGNORE]);
    let prefix = misspelled_prefix(&name);
    if !name.starts_with("test") && prefix.is_none() && !would_run {
        return;
    }
    let mut fix = Fix::new();
    if !name.starts_with("test") {
        let fixed = match prefix {
            Some(length) => format!("test{}", name.chars().skip(length).collect::<String>()),
            None => format!("test{}", upper_first(&name)),
        };
        if let Some(part) = method.child_by_field_name("name") {
            fix = fix.and(part.start_byte(), part.end_byte(), fixed);
        }
    }
    fix = add_modifiers(fix, method, &["public"]);
    fix = remove_modifiers(fix, method, &["private", "protected", "static"]);
    let message = "Test method will not be run; please correct method signature (Should be public, non-static, and method name should begin with \"test\").";
    context.report_fixed("JUnit3TestNotRun", method, name_position(method), message, &[fix]);
}

fn statements_of(node: Node) -> Vec<Node> {
    named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

fn last_statement(creation: Node, statement: Node) -> bool {
    let Some(holder) = ancestor(creation, &["block", "switch_block_statement_group", "switch_rule"]) else { return false };
    let list: Vec<Node> = match holder.kind() {
        "switch_block_statement_group" => statements_of(holder).into_iter().filter(|part| part.kind() != "switch_label").collect(),
        "switch_rule" => statements_of(holder).into_iter().filter(|part| part.kind() != "switch_label").collect(),
        _ => statements_of(holder),
    };
    list.last().is_some_and(|last| last.id() == statement.id())
}

pub fn dead_exception(context: &Context, creation: Node) {
    if creation.kind() != "object_creation_expression" {
        return;
    }
    let Some(statement) = parent(creation).filter(|up| up.kind() == "expression_statement") else { return };
    if parent(statement).is_some_and(|up| up.kind() == "switch_rule") {
        return;
    }
    if !matches!(context.resolver.type_of(creation), Some(Type::Class(name, _)) if context.resolver.index.is_subtype(&name, "java.lang.Throwable")) {
        return;
    }
    if let Some(class) = enclosing_class(creation) {
        if is_junit3_test_class(context, class) || is_ambiguous_junit_version(context, class) || junit4_class(context, class) {
            return;
        }
    }
    let bare_if = parent(statement).is_some_and(|up| up.kind() == "if_statement");
    let last = last_statement(creation, statement) || bare_if;
    let start = creation.start_byte();
    let fix = if last { Fix::new().insert(start, "throw ") } else { Fix::new().delete(statement.start_byte(), statement.end_byte()) };
    let at = children(creation).into_iter().find(|part| part.kind() == "new").map_or(start, |word| word.start_byte());
    context.report_fixed("DeadException", creation, at, "Exception created but not thrown", &[fix]);
}
