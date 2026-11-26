//! CompileTimeConstant: arguments, fields and overrides that break a `@CompileTimeConstant` parameter or field.
use super::Context;
use super::flogger::{compile_time_constant, declaration_of};
use super::hierarchy::super_methods;
use super::nodes::name_position;
use super::positions::{arguments, preferred};
use crate::engine::source::{children, named_children};
use crate::java::types::expr::{Binding, Receiver, unwrap};
use crate::java::types::model::{Method, Type, flag};
use tree_sitter::Node;

const ANNOTATION: &str = "com.google.errorprone.annotations.CompileTimeConstant";
const MESSAGE: &str = "Non-compile-time constant expression passed to parameter with @CompileTimeConstant type annotation.";
const OVERRIDE_MESSAGE: &str = "Method with @CompileTimeConstant parameter can't override method without it.";

fn annotated_parameter(method: &Method, at: usize) -> bool {
    method.detail.parameter_annotations.get(at).is_some_and(|names| names.iter().any(|name| name == ANNOTATION))
}

fn final_message(name: &str) -> String {
    format!("{MESSAGE} Did you mean to make '{name}' final?")
}

/// The name of the annotated variable an expression is made of, for the "Did you mean" sentence.
fn annotated_variable(context: &Context, expression: Node) -> Option<String> {
    match expression.kind() {
        "identifier" => {
            let name = context.text(expression);
            match context.resolver.binding(expression, name)? {
                Binding::Field(_, _, field) => (field.flags & flag::COMPILE_TIME_CONSTANT != 0).then(|| name.to_string()),
                Binding::Local(_) => {
                    let (declaration, declarator) = declaration_of(context, expression)?;
                    let marked = context.resolver.annotation_names(declaration).iter().any(|found| found == ANNOTATION);
                    (declarator.is_none() && marked).then(|| name.to_string())
                }
            }
        }
        "field_access" => {
            let (object, name) = (expression.child_by_field_name("object")?, expression.child_by_field_name("field")?);
            let owner = match object.kind() {
                "this" => context.resolver.type_of(object)?.name(),
                _ => match context.resolver.receiver(object)? {
                    Receiver::Static(owner) => owner,
                    Receiver::Value(kind) => kind.erased().name(),
                },
            };
            let (_, field) = context.resolver.index.field(&owner, context.text(name))?;
            (field.flags & flag::COMPILE_TIME_CONSTANT != 0).then(|| context.text(name).to_string())
        }
        _ => None,
    }
}

fn mismatch(context: &Context, argument: Node) {
    let message = match annotated_variable(context, argument) {
        Some(name) => final_message(&name),
        None => MESSAGE.to_string(),
    };
    context.report_fixed("CompileTimeConstant", argument, preferred(context, argument), &message, &[]);
}

fn match_arguments(context: &Context, method: &Method, actuals: &[Node]) {
    let count = method.parameters.len();
    for at in 0..count {
        let Some(actual) = actuals.get(at).copied() else { return };
        if annotated_parameter(method, at) && !compile_time_constant(context, actual) {
            return mismatch(context, actual);
        }
    }
    if count == 0 || !method.varargs || !annotated_parameter(method, count - 1) {
        return;
    }
    for actual in actuals.iter().skip(count).copied() {
        if !compile_time_constant(context, actual) {
            return mismatch(context, actual);
        }
    }
}

fn invocation(context: &Context, node: Node) {
    if !matches!(node.kind(), "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" | "enum_constant") {
        return;
    }
    let actuals = arguments(node);
    if actuals.is_empty() || (node.kind() == "object_creation_expression" && children(node).iter().any(|part| part.kind() == "class_body")) {
        return;
    }
    let call = match node.kind() {
        "method_invocation" => context.resolver.resolve_call(node),
        _ => context.resolver.call_formals(node).map(|(call, _)| call),
    };
    if let Some(call) = call.filter(|call| call.method.detail.parameter_annotations.iter().any(|names| !names.is_empty())) {
        match_arguments(context, &call.method, &actuals);
    }
}

fn implicitly_final(node: Node) -> bool {
    let mut current = crate::engine::source::parent(node);
    while let Some(at) = current {
        match at.kind() {
            "interface_body" | "annotation_type_body" => return true,
            "class_body" | "enum_body" | "record_declaration" => return false,
            _ => current = crate::engine::source::parent(at),
        }
    }
    false
}

fn field(context: &Context, node: Node) {
    if !matches!(node.kind(), "field_declaration" | "constant_declaration") || !context.resolver.annotation_names(node).iter().any(|name| name == ANNOTATION) {
        return;
    }
    let is_final = crate::java::helpers::has_modifier(node, "final") || implicitly_final(node);
    for declarator in children(node).into_iter().filter(|part| part.kind() == "variable_declarator") {
        let Some(name) = declarator.child_by_field_name("name") else { continue };
        if !is_final {
            let message = final_message(context.text(name));
            context.report_fixed("CompileTimeConstant", declarator, name.start_byte(), &message, &[]);
        } else if let Some(value) = declarator.child_by_field_name("value").filter(|value| !compile_time_constant(context, *value)) {
            context.report_fixed("CompileTimeConstant", value, preferred(context, value), MESSAGE, &[]);
        }
    }
}

fn assignment(context: &Context, node: Node) {
    if node.kind() != "assignment_expression" || node.child_by_field_name("operator").is_none_or(|operator| context.text(operator) != "=") {
        return;
    }
    let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
    let target = unwrap(left);
    let annotated = match target.kind() {
        "identifier" => matches!(context.resolver.binding(target, context.text(target)), Some(Binding::Field(_, _, field)) if field.flags & flag::COMPILE_TIME_CONSTANT != 0),
        "field_access" => annotated_variable(context, target).is_some(),
        _ => false,
    };
    if annotated && !compile_time_constant(context, right) {
        context.report_fixed("CompileTimeConstant", right, preferred(context, right), MESSAGE, &[]);
    }
}

fn lacks_annotation(context: &Context, class: &crate::java::types::model::ClassInfo, method: &Method, indexes: &[usize]) -> bool {
    let index = context.resolver.index;
    let mut methods = vec![method];
    methods.extend(super_methods(index, class, method).into_iter().map(|(_, above)| above));
    methods.iter().any(|candidate| indexes.iter().any(|at| !annotated_parameter(candidate, *at)))
}

fn method(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let Some((class, declared)) = super::hierarchy::declared_method(context, node) else { return };
    let indexes: Vec<usize> = (0..declared.parameters.len()).filter(|at| annotated_parameter(declared, *at)).collect();
    if indexes.is_empty() {
        return;
    }
    let index = context.resolver.index;
    let above = super_methods(index, class, declared);
    if above.iter().any(|(_, method)| indexes.iter().any(|at| !annotated_parameter(method, *at))) {
        context.report_fixed("CompileTimeConstant", node, name_position(node), OVERRIDE_MESSAGE, &[]);
    }
}

fn descriptor<'c>(context: &'c Context, node: Node) -> Option<(Type, &'c crate::java::types::model::ClassInfo, &'c Method)> {
    let target = context.resolver.type_of(node)?;
    let (class, function) = context.resolver.index.functional_method(&target.name())?;
    Some((target, class, function))
}

fn lambda(context: &Context, node: Node) {
    let Some(parameters) = node.child_by_field_name("parameters").filter(|list| list.kind() == "formal_parameters") else { return };
    let listed: Vec<Node> = named_children(parameters).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let indexes: Vec<usize> =
        listed.iter().enumerate().filter(|(_, part)| context.resolver.annotation_names(**part).iter().any(|name| name == ANNOTATION)).map(|(at, _)| at).collect();
    if indexes.is_empty() {
        return;
    }
    let Some((_, class, function)) = descriptor(context, node) else { return };
    if lacks_annotation(context, class, function, &indexes) {
        context.report_fixed("CompileTimeConstant", node, node.start_byte(), OVERRIDE_MESSAGE, &[]);
    }
}

fn reference(context: &Context, node: Node) {
    let Some((target, class, function)) = descriptor(context, node) else { return };
    let taken = match &target {
        Type::Class(_, shown) if shown.is_empty() => function.parameters.clone(),
        _ => function.generic_parameters.iter().map(|kind| kind.substitute(&context.resolver.index.member_map(&target, &class.name))).collect(),
    };
    let Some((_, _, referenced, _)) = context.resolver.reference_method(node, &taken) else { return };
    let indexes: Vec<usize> = (0..referenced.parameters.len()).filter(|at| annotated_parameter(referenced, *at)).collect();
    if !indexes.is_empty() && lacks_annotation(context, class, function, &indexes) {
        context.report_fixed("CompileTimeConstant", node, node.start_byte(), OVERRIDE_MESSAGE, &[]);
    }
}

pub fn compile_time_constant_check(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" | "enum_constant" => invocation(context, node),
        "field_declaration" | "constant_declaration" => field(context, node),
        "assignment_expression" => assignment(context, node),
        "method_declaration" => method(context, node),
        "lambda_expression" => lambda(context, node),
        "method_reference" => reference(context, node),
        _ => {}
    }
}
