//! ChainedAssertionLosesContext: `assertThat(...)` inside a `Subject` method should use `check(...)`.
use super::Context;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::lookup::field_of;
use super::positions::{arguments, preferred};
use super::truth_checks::on_descendant;
use crate::engine::source::{children, parent};
use crate::java::types::model::Type;
use crate::java::types::scope::enclosing_type;
use tree_sitter::Node;

const TRUTH: &str = "com.google.common.truth.Truth";
const PROTO_TRUTH: &str = "com.google.common.truth.extensions.proto.ProtoTruth";
const SUBJECT: &str = "com.google.common.truth.Subject";
const SUBJECT_FACTORY: &str = "com.google.common.truth.Subject.Factory";
const CUSTOM_FACTORY: &str = "com.google.common.truth.CustomSubjectBuilder.Factory";

fn in_subject_method(context: &Context, call: Node) -> bool {
    let Some(method) = crate::engine::source::ancestor(call, &["method_declaration", "constructor_declaration", "compact_constructor_declaration"]) else { return false };
    if crate::java::helpers::has_modifier(method, "static") {
        return false;
    }
    let Some(body) = parent(method) else { return false };
    let plain = match body.kind() {
        "class_body" => parent(body).is_some_and(|owner| matches!(owner.kind(), "class_declaration" | "object_creation_expression")),
        _ => false,
    };
    if !plain {
        return false;
    }
    let Some(class) = enclosing_type(context.file, context.resolver.scope, method) else { return false };
    class == SUBJECT || context.resolver.index.is_subtype(&class, SUBJECT)
}

fn refers_to_actual_field(context: &Context, expression: Node) -> bool {
    match expression.kind() {
        "identifier" => context.text(expression) == "actual" && field_of(context, expression).is_some(),
        "field_access" => expression.child_by_field_name("field").is_some_and(|name| context.text(name) == "actual") && field_of(context, expression).is_some(),
        _ => false,
    }
}

fn is_actual_method(context: &Context, expression: Node) -> bool {
    expression.kind() == "method_invocation"
        && ["actual", "getSubject"].iter().any(|name| on_descendant(context, expression, SUBJECT, name))
        && arguments(expression).is_empty()
}

/// `ImplementAssertionWithChaining.makeCheckDescription`: the quoted chain of calls from `actual()`.
fn check_description(context: &Context, actual: Node) -> Option<String> {
    let mut invocation = actual;
    let mut parts: Vec<String> = Vec::new();
    loop {
        if invocation.kind() != "method_invocation" {
            return None;
        }
        let object = invocation.child_by_field_name("object")?;
        if !arguments(invocation).is_empty() {
            return None;
        }
        parts.insert(0, format!("{}()", context.text(invocation.child_by_field_name("name")?)));
        if is_actual_method(context, object) || refers_to_actual_field(context, object) {
            return Some(format!("\"{}\"", parts.join(".")));
        }
        invocation = object;
    }
}

fn is_with_message_or_about(context: &Context, call: Node) -> bool {
    ["withMessage", "about"].iter().any(|name| on_descendant(context, call, "com.google.common.truth.StandardSubjectBuilder", name))
}

fn is_builder_that(context: &Context, call: Node) -> bool {
    ["CustomSubjectBuilder", "SimpleSubjectBuilder", "StandardSubjectBuilder"].iter().any(|name| on_descendant(context, call, &format!("com.google.common.truth.{name}"), "that"))
}

fn that_description(context: &Context, call: Node) -> Option<String> {
    let mut current = call;
    loop {
        let up = parent(current).filter(|up| up.kind() == "method_invocation" && up.child_by_field_name("object") == Some(current))?;
        if is_with_message_or_about(context, up) {
            current = up;
        } else if is_builder_that(context, up) {
            let given = arguments(up);
            let [only] = given.as_slice() else { return None };
            return check_description(context, *only);
        } else {
            return None;
        }
    }
}

fn returns_factory(context: &Context, returned: &Type) -> bool {
    let index = context.resolver.index;
    matches!(returned, Type::Class(name, _) if [SUBJECT_FACTORY, CUSTOM_FACTORY].iter().any(|target| name == target || index.is_subtype(name, target)))
}

/// `tryFindFactory`: the one factory method declared next to `assertThat` or on its subject class.
fn find_factory(context: &Context, call: Node) -> Option<(String, String)> {
    let resolved = context.resolver.resolve_call(call)?;
    if resolved.declaring == PROTO_TRUTH {
        return Some((PROTO_TRUTH.to_string(), "protos".to_string()));
    }
    let index = context.resolver.index;
    let mut owners = vec![resolved.declaring.clone()];
    if let Type::Class(subject, _) = &resolved.method.returns {
        if *subject != resolved.declaring {
            owners.push(subject.clone());
        }
    }
    let mut found: Vec<(String, String, bool)> = Vec::new();
    for owner in owners {
        let Some(info) = index.get(&owner) else { continue };
        for method in info.methods.iter().filter(|method| returns_factory(context, &method.returns)) {
            let key = (owner.clone(), method.name.clone(), method.parameters.is_empty());
            if !found.contains(&key) {
                found.push(key);
            }
        }
    }
    match found.as_slice() {
        [(owner, name, true)] => Some((owner.clone(), name.clone())),
        _ => None,
    }
}

fn select_start(call: Node) -> usize {
    call.child_by_field_name("object").unwrap_or_else(|| call.child_by_field_name("name").unwrap_or(call)).start_byte()
}

fn select_position(call: Node) -> usize {
    match call.child_by_field_name("object") {
        Some(_) => children(call).into_iter().find(|part| !part.is_named() && part.kind() == ".").map_or(call.start_byte(), |dot| dot.start_byte()),
        None => call.child_by_field_name("name").map_or(call.start_byte(), |name| name.start_byte()),
    }
}

pub fn chained_assertion_loses_context(context: &Context, call: Node) {
    if call.kind() != "method_invocation" {
        return;
    }
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return };
    if !matches!(name, "assertThat" | "assertAbout" | "assertWithMessage" | "assert_") || !in_subject_method(context, call) {
        return;
    }
    let select_end = call.child_by_field_name("name").map_or(call.end_byte(), |name| name.end_byte());
    let on_select = |text: String| Fix::replace(select_start(call), select_end, text);
    let message = "Inside a Subject, use check(...) instead of assert*() to preserve user-supplied messages and other settings.";
    let args = arguments(call);
    if name == "assertThat" && static_on_class(context, call, TRUTH, &["assertThat"]) {
        let [only] = args.as_slice() else { return };
        let Some(description) = check_description(context, *only) else { return };
        context.report_fixed("ChainedAssertionLosesContext", call, select_position(call), message, &[on_select(format!("check({description}).that"))]);
    } else if name == "assertThat" && context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.is_static) {
        let Some((_, method)) = find_factory(context, call) else { return };
        let [only] = args.as_slice() else { return };
        let Some(description) = check_description(context, *only) else { return };
        let fix = on_select(format!("check({description}).about({method}()).that")).with_imports();
        context.report_fixed("ChainedAssertionLosesContext", call, preferred(context, call), message, &[fix]);
    } else if name == "assertAbout" && static_on_class(context, call, TRUTH, &["assertAbout"]) {
        let Some(description) = that_description(context, call) else { return };
        context.report_fixed("ChainedAssertionLosesContext", call, select_position(call), message, &[on_select(format!("check({description}).about"))]);
    } else if name == "assertWithMessage" && static_on_class(context, call, TRUTH, &["assertWithMessage"]) {
        let Some(description) = that_description(context, call) else { return };
        context.report_fixed("ChainedAssertionLosesContext", call, select_position(call), message, &[on_select(format!("check({description}).withMessage"))]);
    } else if name == "assert_" && static_on_class(context, call, TRUTH, &["assert_"]) {
        let Some(description) = that_description(context, call) else { return };
        let fix = Fix::replace(call.start_byte(), call.end_byte(), format!("check({description})"));
        context.report_fixed("ChainedAssertionLosesContext", call, preferred(context, call), message, &[fix]);
    }
}
