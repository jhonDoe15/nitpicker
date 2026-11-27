//! FormatStringAnnotation, with `StrictFormatStringValidation`: what may be passed as the `@FormatString` argument.
use super::Context;
use super::call_match::static_on_class;
use super::consts::{Const, constant};
use super::finals::{considered_final, local_of};
use super::format_checks::annotated_arguments;
use super::format_validation::{constant_strings, validate};
use super::hierarchy::declared_method;
use super::javac_print::printed;
use super::positions::{arguments, preferred};
use crate::engine::source::{children, named_children, parent};
use crate::java::types::expr::Binding;
use crate::java::types::model::{Method, Type};
use tree_sitter::Node;

const FORMAT_METHOD: &str = "com.google.errorprone.annotations.FormatMethod";
const FORMAT_STRING: &str = "com.google.errorprone.annotations.FormatString";
const CHECK: &str = "FormatStringAnnotation";

fn string() -> Type {
    Type::class("java.lang.String")
}

fn marked(names: Option<&Vec<String>>) -> bool {
    names.is_some_and(|names| names.iter().any(|name| name == FORMAT_STRING))
}

fn is_format_method(method: &Method) -> bool {
    method.detail.annotations.iter().any(|name| name == FORMAT_METHOD)
}

fn enclosing_method(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "method_declaration" | "constructor_declaration" => return Some(at),
            "lambda_expression" | "class_body" => return None,
            _ => current = parent(at),
        }
    }
    None
}

/// `isFormatStringParameter`: a `String` parameter of a `@FormatMethod` that is marked, or is its first `String`
/// parameter with no marked one after it.
fn is_format_string_parameter(method: &Method, at: usize) -> bool {
    if method.parameters.get(at) != Some(&string()) || !is_format_method(method) {
        return false;
    }
    if marked(method.detail.parameter_annotations.get(at)) {
        return true;
    }
    for (other, parameter) in method.parameters.iter().enumerate() {
        if *parameter == string() && (other < at || (other > at && marked(method.detail.parameter_annotations.get(other)))) {
            return false;
        }
    }
    true
}

fn shown_types(types: &[Type]) -> String {
    format!("[{}]", types.iter().map(super::compat::qualified).collect::<Vec<_>>().join(", "))
}

fn parameter_rule(context: &Context, format: Node, name: Node, arguments: &[Node]) -> Option<String> {
    let invalid = || Some(format!("Format strings must be compile time constants or parameters annotated @FormatString: {}", printed(context.file, format)));
    let Some(method) = enclosing_method(name) else { return invalid() };
    let Some((_, declared)) = declared_method(context, method) else { return None };
    let position = super::hierarchy::formals(method).iter().position(|formal| formal.child_by_field_name("name").is_some_and(|written| written.id() == name.id()))?;
    if !is_format_string_parameter(declared, position) {
        return invalid();
    }
    let expected: Vec<Type> = declared.generic_parameters[position + 1..].to_vec();
    let passed: Vec<Type> = arguments.iter().map(|argument| context.resolver.type_of(*argument).map(|found| found.erased())).collect::<Option<_>>()?;
    if expected.len() != passed.len() {
        return Some(format!(
            "The number of format arguments passed with an @FormatString must match the number of format arguments in the @FormatMethod header where the format string was declared.\n\tFormat args passed: {}\n\tFormat args expected: {}",
            passed.len(),
            expected.len()
        ));
    }
    let erase = |declared: &Type| match declared {
        Type::Variable(variable) => super::array_calls::variable_bound(context, name, variable).map_or_else(|| Type::class("java.lang.Object"), |bound| bound.erased()),
        other => other.erased(),
    };
    if expected.iter().zip(&passed).any(|(declared, found)| erase(declared) != *found) {
        return Some(format!(
            "The format argument types passed with an @FormatString must match the types of the format arguments in the @FormatMethod header where the format string was declared.\n\tFormat arg types passed: {}\n\tFormat arg types expected: {}",
            shown_types(&passed),
            shown_types(&expected)
        ));
    }
    None
}

/// The type of a declaration as javac prints it: as written, or the inferred type in full for `var`.
fn written_type(context: &Context, declaration: Node, name: Option<Node>) -> String {
    let written = declaration.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
    if written != "var" {
        return written.to_string();
    }
    let declarator = name.and_then(parent).filter(|above| above.kind() == "variable_declarator");
    let value = declarator.and_then(|above| above.child_by_field_name("value"));
    value.or(name).and_then(|node| context.resolver.type_of(node)).map(|found| super::compat::qualified(&found)).unwrap_or_else(|| written.to_string())
}

fn declaration_text(context: &Context, declaration: Node, declarator: Node) -> String {
    let modifiers: Vec<&str> = crate::java::helpers::modifiers(declaration).map(children).unwrap_or_default().iter().filter(|part| !part.is_named()).map(|part| context.text(*part)).collect();
    let written = written_type(context, declaration, declarator.child_by_field_name("name"));
    let name = declarator.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    let mut text = modifiers.iter().map(|keyword| format!("{keyword} ")).collect::<String>();
    text.push_str(&format!("{written} {name}"));
    if let Some(value) = declarator.child_by_field_name("value") {
        text.push_str(&format!(" = {}", printed(context.file, value)));
    }
    text
}

fn local_rule(context: &Context, format: Node, declaration: Node, name: &str, arguments: &[Node]) -> Option<String> {
    let declarator = named_children(declaration).into_iter().find(|part| part.kind() == "variable_declarator" && part.child_by_field_name("name").is_some_and(|written| context.text(written) == name))?;
    let Some(value) = declarator.child_by_field_name("value") else {
        return Some(format!(
            "Variables used as format strings must be initialized when they are declared.\nInvalid declaration: {}",
            declaration_text(context, declaration, declarator)
        ));
    };
    if !matches!(constant(context, value), Some(Const::Str(_))) {
        return Some(format!(
            "Local format string variables must only be assigned to compile time constant values. Invalid format string assignment: {}",
            declaration_text(context, declaration, declarator)
        ));
    }
    let _ = format;
    validate(context, None, &std::iter::once(value).chain(arguments.iter().copied()).collect::<Vec<_>>())
}

/// `StrictFormatStringValidation.validate`.
fn strict(context: &Context, format: Node, arguments: &[Node]) -> Option<String> {
    let mockito = ["org.mockito.Matchers", "org.mockito.ArgumentMatchers"].iter().any(|owner| {
        format.kind() == "method_invocation" && format.child_by_field_name("name").is_some_and(|name| static_on_class(context, format, owner, &[context.text(name)]))
    });
    if mockito {
        return None;
    }
    if !constant_strings(context, format).is_empty() {
        return validate(context, None, &std::iter::once(format).chain(arguments.iter().copied()).collect::<Vec<_>>());
    }
    let shown = printed(context.file, format);
    let name = match format.kind() {
        "identifier" => context.text(format),
        "field_access" => format.child_by_field_name("field").map(|field| context.text(field)).unwrap_or_default(),
        _ => "",
    };
    let binding = (!name.is_empty()).then(|| context.resolver.binding(format, name)).flatten();
    let Some(binding) = binding.or_else(|| (format.kind() == "field_access").then(|| context.resolver.binding(format, name)).flatten()) else {
        return Some(format!("Format strings must be either literals or variables. Other expressions are not valid.\nInvalid format string: {shown}"));
    };
    let is_captured = format.kind() == "identifier" && matches!(binding, Binding::Local(_)) && local_of(context, format, name).is_none();
    if !is_captured && !considered_final(context, if format.kind() == "field_access" { format.child_by_field_name("field")? } else { format }) {
        return Some("All variables passed as @FormatString must be final or effectively final".to_string());
    }
    let not_local = || {
        Some(format!(
            "Variables used as format strings that are not local variables must be compile time constants.\n{shown} is neither a local variable nor a compile time constant."
        ))
    };
    if matches!(binding, Binding::Field(..)) || format.kind() != "identifier" {
        return not_local();
    }
    let Some(local) = local_of(context, format, name).or_else(|| captured(context, format, name)) else { return None };
    let holder = parent(local.name)?;
    match holder.kind() {
        "formal_parameter" | "spread_parameter" => parameter_rule(context, format, local.name, arguments),
        "variable_declarator" if local.declaration.kind() == "local_variable_declaration" => local_rule(context, format, local.declaration, name, arguments),

        "inferred_parameters" | "lambda_expression" => Some(format!("Format strings must be compile time constants or parameters annotated @FormatString: {shown}")),
        _ if local.declaration.kind() == "enhanced_for_statement" => {
            let written = written_type(context, local.declaration, Some(local.name));
            let modifier = if crate::java::helpers::has_modifier(local.declaration, "final") { "final " } else { "" };
            Some(format!("Variables used as format strings must be initialized when they are declared.\nInvalid declaration: {modifier}{written} {name}"))
        }
        _ => not_local(),
    }
}

/// A local of an enclosing method seen from inside a local or anonymous class: Java makes it effectively final.
fn captured<'t>(context: &Context, usage: Node<'t>, name: &str) -> Option<super::finals::Local<'t>> {
    let mut current = parent(usage);
    while let Some(at) = current {
        if at.kind() == "class_body" {
            let holder = parent(at)?;
            if let Some(found) = local_of(context, holder, name) {
                return Some(found);
            }
        }
        current = parent(at);
    }
    None
}

fn invocation(context: &Context, node: Node, method: &Method) {
    let formatted = annotated_arguments(context, method, &arguments(node));
    let Some((format, rest)) = formatted.split_first() else { return };
    if let Some(message) = strict(context, *format, rest) {
        let at = match node.kind() {
            "explicit_constructor_invocation" | "enum_constant" => node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte()),
            _ => preferred(context, node),
        };
        context.report(CHECK, node, at, &message);
    }
}

fn declaration(context: &Context, node: Node) {
    let Some((_, method)) = declared_method(context, node) else { return };
    let format_method = is_format_method(method);
    let formals = super::hierarchy::formals(node);
    let (mut found_format, mut found_string) = (false, false);
    for (at, formal) in formals.iter().enumerate() {
        let is_string = method.parameters.get(at) == Some(&string()) && formal.kind() != "spread_parameter";
        found_string |= is_string;
        if !marked(method.detail.parameter_annotations.get(at)) {
            continue;
        }
        let name = preferred_name(*formal);
        if !format_method {
            let message = format!("A parameter can only be annotated @FormatString in a method annotated @FormatMethod: {}", context.text(*formal));
            context.report(CHECK, node, preferred_name(node), &message);
            return;
        }
        if !is_string {
            context.report(CHECK, *formal, name, "Only strings can be annotated @FormatString.");
            return;
        }
        if found_format {
            context.report(CHECK, node, preferred_name(node), "A method cannot have more than one @FormatString parameter.");
            return;
        }
        found_format = true;
    }
    if format_method && !found_string {
        context.report(CHECK, node, preferred_name(node), "An @FormatMethod must contain at least one String parameter.");
    }
}

fn preferred_name(node: Node) -> usize {
    let name = node.child_by_field_name("name").or_else(|| children(node).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name")));
    name.map_or(node.start_byte(), |name| name.start_byte())
}

pub fn format_string_annotation(context: &Context, node: Node) {
    match node.kind() {
        "method_invocation" => {
            if let Some(resolved) = context.resolver.resolve_call(node) {
                invocation(context, node, &resolved.method);
            }
        }
        "object_creation_expression" if !children(node).iter().any(|part| part.kind() == "class_body") => {
            if let Some(resolved) = context.resolver.resolve_constructor(node) {
                invocation(context, node, &resolved.method);
            }
        }
        "explicit_constructor_invocation" => {
            if let Some(resolved) = context.resolver.resolve_delegation(node) {
                invocation(context, node, &resolved.method);
            }
        }
        "enum_constant" if node.child_by_field_name("arguments").is_some() => {
            if let Some((resolved, _)) = context.resolver.call_formals(node) {
                invocation(context, node, &resolved.method);
            }
        }
        "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => declaration(context, node),
        _ => {}
    }
}
