//! Checks that look at one statement or expression and, at most, the types around it.
use super::Context;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{has_modifier, modifiers};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

const BRACES: &str = "The Google Java Style Guide requires braces to be used with if, else, for, do and while statements, even when the body is empty or contains only a single statement.";

pub fn missing_braces(context: &Context, node: Node) {
    let bodies: Vec<Node> = match node.kind() {
        "if_statement" => {
            let other = node
                .child_by_field_name("alternative")
                .filter(|other| other.kind() != "if_statement");
            node.child_by_field_name("consequence")
                .into_iter()
                .chain(other)
                .collect()
        }
        "for_statement" | "enhanced_for_statement" | "while_statement" | "do_statement" => {
            node.child_by_field_name("body").into_iter().collect()
        }
        _ => return,
    };
    for body in bodies {
        if body.kind() != "block" {
            context.report("MissingBraces", node, body.start_byte(), BRACES);
        }
    }
}

pub fn empty_catch(context: &Context, node: Node) {
    if node.kind() != "catch_clause" {
        return;
    }
    let Some(block) = node.child_by_field_name("body") else {
        return;
    };
    if named_children(block).is_empty() {
        context.report(
            "EmptyCatch",
            node,
            node.start_byte(),
            "Caught exceptions should not be ignored",
        );
    }
}

fn annotation_simple_names<'f>(context: &'f Context, declaration: Node) -> Vec<&'f str> {
    modifiers(declaration)
        .map(children)
        .unwrap_or_default()
        .into_iter()
        .filter(|part| matches!(part.kind(), "annotation" | "marker_annotation"))
        .filter_map(|annotation| annotation.child_by_field_name("name"))
        .map(|name| context.text(name).rsplit('.').next().unwrap_or_default())
        .collect()
}

fn mutated_before_all(context: &Context, name: &str) -> bool {
    let mut found = false;
    walk(context.file.tree.root_node(), |method| {
        if found || method.kind() != "method_declaration" {
            return;
        }
        if !annotation_simple_names(context, method)
            .iter()
            .any(|own| matches!(*own, "BeforeClass" | "BeforeAll"))
        {
            return;
        }
        walk(method, |inner| {
            let target = match inner.kind() {
                "assignment_expression" => inner.child_by_field_name("left"),
                "update_expression" => named_children(inner).into_iter().next(),
                _ => None,
            };
            found |= target.is_some_and(|target| match target.kind() {
                "identifier" => context.text(target) == name,
                "field_access" => target
                    .child_by_field_name("field")
                    .is_some_and(|field| context.text(field) == name),
                _ => false,
            });
        });
    });
    found
}

pub fn non_final_static_field(context: &Context, node: Node) {
    if node.kind() != "field_declaration" || !has_modifier(node, "static") {
        return;
    }
    if has_modifier(node, "final") || has_modifier(node, "volatile") {
        return;
    }
    if parent(node)
        .is_some_and(|body| matches!(body.kind(), "interface_body" | "annotation_type_body"))
    {
        return;
    }
    const AVOID: &[&str] = &["Captor", "Inject", "LazyInit", "Mock", "TestParameter"];
    if annotation_simple_names(context, node)
        .iter()
        .any(|name| AVOID.contains(name))
    {
        return;
    }
    for declarator in children(node)
        .into_iter()
        .filter(|part| part.kind() == "variable_declarator")
    {
        let Some(name) = declarator.child_by_field_name("name") else {
            continue;
        };
        if !mutated_before_all(context, context.text(name)) {
            context.report(
                "NonFinalStaticField",
                node,
                name.start_byte(),
                "Static fields should almost always be final.",
            );
        }
    }
}

const SPECIFIC: &str = "Base exception classes should be treated as abstract. If the exception is intended to be caught, throw a domain-specific exception. Otherwise, prefer a more specific exception for clarity. Common alternatives include: AssertionError, IllegalArgumentException, IllegalStateException, and (Guava's) VerifyException.";

fn created_class(context: &Context, creation: Node) -> Option<String> {
    match context
        .resolver
        .type_node(creation.child_by_field_name("type")?)?
    {
        Type::Class(name, _) => Some(name),
        _ => None,
    }
}

pub fn throw_specific_exceptions(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression"
        || parent(node).is_none_or(|above| above.kind() != "throw_statement")
    {
        return;
    }
    if children(node)
        .iter()
        .any(|part| part.kind() == "class_body")
    {
        return;
    }
    let base = created_class(context, node).is_some_and(|name| {
        matches!(
            name.as_str(),
            "java.lang.RuntimeException" | "java.lang.Throwable" | "java.lang.Error"
        )
    });
    if base {
        context.report("ThrowSpecificExceptions", node, node.start_byte(), SPECIFIC);
    }
}

fn open_parenthesis(call: Node) -> usize {
    call.child_by_field_name("arguments")
        .map_or(call.start_byte(), |list| list.start_byte())
}

const SYSTEM_OUT: &str = "Production code should not print to standard out or standard error. Standard out and standard error should only be used for debugging.";

pub fn system_out(context: &Context, node: Node) {
    match node.kind() {
        "field_access" => {
            let (Some(object), Some(field)) = (
                node.child_by_field_name("object"),
                node.child_by_field_name("field"),
            ) else {
                return;
            };
            if !matches!(context.text(field), "out" | "err") {
                return;
            }
            let system = matches!(context.resolver.receiver(object), Some(Receiver::Static(name)) if name == "java.lang.System");
            if system {
                let dot = children(node)
                    .into_iter()
                    .find(|part| part.kind() == ".")
                    .map_or(field.start_byte(), |dot| dot.start_byte());
                context.report("SystemOut", node, dot, SYSTEM_OUT);
            }
        }
        "method_invocation" => {
            let name = node
                .child_by_field_name("name")
                .map(|name| context.text(name))
                .unwrap_or_default();
            let bad = match name {
                "printStackTrace" => context
                    .resolver
                    .matches_sig(node, "java.lang.Throwable#printStackTrace()"),
                "dumpStack" => context
                    .resolver
                    .matches_sig(node, "java.lang.Thread#dumpStack()"),
                "print" | "println" => context
                    .resolver
                    .matches_sig(node, &format!("java.lang.IO#{name}(_*)")),
                _ => false,
            };
            if bad {
                context.report("SystemOut", node, open_parenthesis(node), SYSTEM_OUT);
            }
        }
        _ => {}
    }
}

const DATE: &str = "java.util.Date";
const DATE_MESSAGE: &str =
    "Date has a bad API that leads to bugs; prefer java.time.Instant or LocalDate.";

pub fn java_util_date(context: &Context, node: Node) {
    match node.kind() {
        "object_creation_expression" => {
            if created_class(context, node).is_some_and(|name| name == DATE) {
                let at = children(node)
                    .into_iter()
                    .find(|part| part.kind() == "new")
                    .map_or(node.start_byte(), |new| new.start_byte());
                context.report("JavaUtilDate", node, at, DATE_MESSAGE);
            }
        }
        "method_invocation" => {
            let Some(call) = context.resolver.resolve_call(node) else {
                return;
            };
            let qualified = node
                .child_by_field_name("object")
                .is_some_and(|object| object.kind() != "super");
            let receiver = if qualified {
                call.receiver.name()
            } else {
                call.declaring.clone()
            };
            if receiver != DATE {
                return;
            }
            let method = &call.method;
            let exempt = (method.name == "toInstant" && !method.is_static)
                || (method.name == "from"
                    && method.is_static
                    && method.parameters.len() == 1
                    && method.parameters[0].name() == "java.time.Instant");
            if !exempt {
                context.report("JavaUtilDate", node, open_parenthesis(node), DATE_MESSAGE);
            }
        }
        _ => {}
    }
}

const LOCALE: &str = "Specify a `Locale` when calling `String#to{Lower,Upper}Case`. (Note: there are multiple suggested fixes; the third may be most appropriate if you're dealing with ASCII Strings.)";

pub fn string_case_locale_usage(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = node
        .child_by_field_name("name")
        .map(|name| context.text(name))
        .unwrap_or_default();
    if !matches!(name, "toLowerCase" | "toUpperCase")
        || !context
            .resolver
            .matches_sig(node, &format!("java.lang.String#{name}()"))
    {
        return;
    }
    let exact = context
        .resolver
        .resolve_call(node)
        .is_some_and(|call| call.receiver.name() == "java.lang.String");
    if exact {
        context.report(
            "StringCaseLocaleUsage",
            node,
            open_parenthesis(node),
            LOCALE,
        );
    }
}
