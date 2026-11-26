//! JUnit4TestNotRun and JUnit4TestsNotRunWithinEnclosed.
use super::Context;
use super::fix_helpers::{add_modifiers, remove_modifiers, qualify_type};
use super::fixes::Fix;
use super::guice::{annotations, has_annotation};
use super::hierarchy::formals;
use super::junit_init::{TEST, has_junit_annotation, is_junit4_test_class, members, runner_annotation, value_argument};
use super::nodes::name_position;
use crate::engine::source::{named_children, walk};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const MESSAGE: &str = "This looks like a test method but is not run; please add @Test and @Ignore, or, if this is a helper method, reduce its visibility.";
const PARAMETERISED: &str = "com.google.testing.junit.testparameterinjector.";
const EXEMPT: [&str; 2] = ["com.pdsl.runners.PdslTest", "com.pholser.junit.quickcheck.Property"];

fn parameterised(context: &Context, declaration: Node) -> bool {
    annotations(context, declaration).iter().any(|(_, name)| name.starts_with(PARAMETERISED))
}

fn injectable(context: &Context, parameter: Node) -> bool {
    if has_annotation(context, parameter, &["org.junit.experimental.theories.FromDataPoints"]) {
        return true;
    }
    let Some(kind) = context.resolver.declared_type(parameter, None) else { return false };
    match &kind {
        Type::Primitive(name) => *name == "boolean" && parameter.child_by_field_name("dimensions").is_none(),
        Type::Class(name, _) => context.resolver.index.get(name).is_some_and(|info| info.enum_constants.is_some()),
        _ => false,
    }
}

fn possible_test_method(context: &Context, method: Node) -> bool {
    method.kind() == "method_declaration"
        && has_modifier(method, "public")
        && method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "void")
        && (parameterised(context, method) || formals(method).into_iter().all(|parameter| injectable(context, parameter)))
        && !has_junit_annotation(context, method)
}

/// The key a method is known by: its name and erased parameter types.
fn signature(context: &Context, method: Node) -> Option<(String, Vec<String>)> {
    let name = context.text(method.child_by_field_name("name")?).to_string();
    let parameters = formals(method).into_iter().map(|parameter| context.resolver.declared_type(parameter, None).map(|kind| kind.erased().name())).collect::<Option<Vec<_>>>()?;
    Some((name, parameters))
}

fn describe(context: &Context, method: Node) {
    let name = context.text(method.child_by_field_name("name").unwrap_or(method));
    let mut test = remove_modifiers(Fix::new(), method, &["static"]).with_imports().insert(method.start_byte(), "@Test ");
    let mut ignore = test.clone().insert(method.start_byte(), "@Ignore ");
    test = test.with_imports();
    ignore = ignore.with_imports();
    let private = remove_modifiers(add_modifiers(Fix::new(), method, &["private"]), method, &["public", "protected"]);
    let fixes = if name.starts_with("disabl") || name.starts_with("ignor") { [ignore, test, private] } else { [test, ignore, private] };
    context.report_fixed("JUnit4TestNotRun", method, name_position(method), MESSAGE, &fixes);
}

fn handle_method(context: &Context, method: Node) {
    if annotations(context, method).iter().any(|(_, name)| EXEMPT.contains(&name.as_str())) {
        return;
    }
    if parameterised(context, method) || formals(method).into_iter().any(|parameter| parameterised(context, parameter)) {
        return describe(context, method);
    }
    let name = context.text(method.child_by_field_name("name").unwrap_or(method));
    if name.starts_with("test") || name.contains('_') {
        return describe(context, method);
    }
    if !annotations(context, method).is_empty() {
        return;
    }
    if !has_modifier(method, "static") {
        describe(context, method);
    }
}

pub fn junit4_test_not_run(context: &Context, class: Node) {
    if !crate::java::types::scope::TYPE_DECLARATIONS.contains(&class.kind()) || !is_junit4_test_class(context, class) {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
    let mut suspicious: Vec<(Node, (String, Vec<String>))> = Vec::new();
    for member in members(class) {
        if possible_test_method(context, member) && !context.suppressed("JUnit4TestNotRun", member) {
            if let Some(key) = signature(context, member) {
                suspicious.push((member, key));
            }
        }
    }
    if suspicious.is_empty() {
        return;
    }
    walk(class, |node| {
        if suspicious.is_empty() {
            return;
        }
        match node.kind() {
            "method_invocation" => {
                let Some(resolved) = context.resolver.resolve_call(node) else { return };
                let key = (resolved.method.name.clone(), resolved.method.parameters.iter().map(Type::name).collect::<Vec<_>>());
                if resolved.declaring == *own {
                    suspicious.retain(|(_, known)| *known != key);
                }
            }
            "method_reference" => {
                let parts = crate::engine::source::children(node);
                let (Some(first), Some(last)) = (parts.first(), parts.last()) else { return };
                let name = context.text(*last);
                let qualifier = if context.text(*first) == "this" { Some(own.clone()) } else { context.resolver.receiver(*first).map(|receiver| match receiver {
                    crate::java::types::expr::Receiver::Static(owner) => owner,
                    crate::java::types::expr::Receiver::Value(kind) => kind.erased().name(),
                }) };
                if qualifier.as_deref() == Some(own.as_str()) {
                    suspicious.retain(|(_, (known, _))| known != name);
                }
            }
            _ => {}
        }
    });
    for (method, _) in suspicious {
        handle_method(context, method);
    }
}

fn is_test_case(context: &Context, method: Node) -> bool {
    if method.kind() != "method_declaration" {
        return false;
    }
    let junit3 = context.text(method.child_by_field_name("name").unwrap_or(method)).starts_with("test")
        && formals(method).is_empty()
        && has_modifier(method, "public")
        && method.child_by_field_name("type").is_some_and(|kind| context.text(kind) == "void");
    junit3 || has_annotation(context, method, &[TEST, "org.junit.experimental.theories.Theory"])
}

fn collect_extended(context: &Context, root: Node) -> Vec<String> {
    let mut extended = Vec::new();
    walk(root, |node| {
        if node.kind() == "class_declaration" {
            let written = node.child_by_field_name("superclass").and_then(|part| named_children(part).into_iter().next());
            extended.extend(written.and_then(|written| context.resolver.type_node(written)).map(|kind| kind.erased().name()));
        }
    });
    extended
}

pub fn junit4_tests_not_run_within_enclosed(context: &Context, root: Node) {
    let extended = collect_extended(context, root);
    walk(root, |class| {
        if !crate::java::types::scope::TYPE_DECLARATIONS.contains(&class.kind()) || class.kind() == "annotation_type_declaration" {
            return;
        }
        if runner_annotation(context, class, Some("org.junit.runner.RunWith"), &["org.junit.experimental.runners.Enclosed"]).is_none() {
            return;
        }
        let Some(own) = context.resolver.scope.names.get(&class.id()) else { return };
        if extended.contains(own) {
            return;
        }
        let run_with = annotations(context, class).into_iter().find(|(_, name)| name.rsplit('.').next() == Some("RunWith"));
        for member in members(class).into_iter().filter(|member| is_test_case(context, *member)) {
            let mut fix = Fix::new();
            let junit4 = qualify_type(context, class, "org.junit.runners.JUnit4", &mut fix);
            if let Some(value) = run_with.as_ref().and_then(|(annotation, _)| value_argument(context, *annotation)) {
                let value = crate::java::types::expr::unwrap(value);
                fix = fix.and(value.start_byte(), value.end_byte(), format!("{junit4}.class"));
            }
            let message = "This test is annotated @Test, but given it's within a class using the Enclosed runner, will not run.";
            context.report_always_fixed("JUnit4TestsNotRunWithinEnclosed", name_position(member), message, &[fix]);
        }
    });
}
