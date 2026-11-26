//! Checks that look at one statement or expression and, at most, the types around it.
use super::Context;
use super::boxed::effectively_private;
use super::fixes::Fix;
use super::fix_helpers::{add_modifiers, qualify_type};
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::helpers::{has_modifier, modifiers};
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

const BRACES: &str = "The Google Java Style Guide requires braces to be used with if, else, for, do and while statements, even when the body is empty or contains only a single statement.";

pub fn missing_braces(context: &Context, node: Node) {
    let bodies: Vec<Node> = match node.kind() {
        "if_statement" => {
            let other = node.child_by_field_name("alternative").filter(|other| other.kind() != "if_statement");
            node.child_by_field_name("consequence").into_iter().chain(other).collect()
        }
        "for_statement" | "enhanced_for_statement" | "while_statement" | "do_statement" => {
            node.child_by_field_name("body").into_iter().collect()
        }
        _ => return,
    };
    for body in bodies {
        if body.kind() != "block" {
            let fix = Fix::new().insert(body.start_byte(), "{").insert(body.end_byte(), "}");
            context.report_fixed("MissingBraces", node, body.start_byte(), BRACES, &[fix]);
        }
    }
}

pub fn empty_catch(context: &Context, node: Node) {
    if node.kind() != "catch_clause" {
        return;
    }
    let Some(block) = node.child_by_field_name("body") else { return };
    if named_children(block).is_empty() {
        context.report("EmptyCatch", node, node.start_byte(), "Caught exceptions should not be ignored");
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

fn is_before_all(context: &Context, method: Node) -> bool {
    method.kind() == "method_declaration"
        && annotation_simple_names(context, method).iter().any(|own| matches!(*own, "BeforeClass" | "BeforeAll"))
}

fn mutates<'t>(context: &Context<'t>, inner: Node<'t>, declarator: Node<'t>, name: &str) -> bool {
    let target = match inner.kind() {
        "assignment_expression" => inner.child_by_field_name("left"),
        "update_expression" => named_children(inner).into_iter().next(),
        _ => None,
    };
    let named = target.is_some_and(|target| match target.kind() {
        "identifier" => context.text(target) == name,
        "field_access" => target.child_by_field_name("field").is_some_and(|field| context.text(field) == name),
        _ => false,
    });
    named && target.is_some_and(|target| match super::symbol_key::reference_key(context, target) {
        Some(found) => super::symbol_key::declared_key(context, declarator).is_some_and(|own| own == found),
        None => true,
    })
}

/// Whether the field is assigned in a `@BeforeAll` method, and whether it is assigned anywhere else.
fn mutations<'t>(context: &Context<'t>, declarator: Node<'t>, name: &str) -> (bool, bool) {
    let (mut before, mut other) = (false, false);
    walk(context.file.tree.root_node(), |inner| {
        if !mutates(context, inner, declarator, name) {
            return;
        }
        if std::iter::successors(parent(inner), |at| parent(*at)).any(|at| is_before_all(context, at)) {
            before = true;
        } else {
            other = true;
        }
    });
    (before, other)
}

pub fn non_final_static_field(context: &Context, node: Node) {
    if node.kind() != "field_declaration" || !has_modifier(node, "static") {
        return;
    }
    if has_modifier(node, "final") || has_modifier(node, "volatile") {
        return;
    }
    if parent(node).is_some_and(|body| matches!(body.kind(), "interface_body" | "annotation_type_body")) {
        return;
    }
    const AVOID: &[&str] = &["Captor", "Inject", "LazyInit", "Mock", "TestParameter"];
    if annotation_simple_names(context, node).iter().any(|name| AVOID.contains(name)) {
        return;
    }
    for declarator in children(node).into_iter().filter(|part| part.kind() == "variable_declarator") {
        let Some(name) = declarator.child_by_field_name("name") else { continue };
        let (before, other) = mutations(context, declarator, context.text(name));
        if before {
            continue;
        }
        let removable = !other && effectively_private(node);
        let fixes = if removable { vec![final_fix(context, node, declarator)] } else { Vec::new() };
        context.report_fixed("NonFinalStaticField", node, name.start_byte(), "Static fields should almost always be final.", &fixes);
    }
}

/// Adds `final`, and a default value when the field has none; the position of the default is where Error Prone puts it.
fn final_fix(context: &Context, field: Node, declarator: Node) -> Fix {
    let fix = add_modifiers(Fix::new(), field, &["final"]);
    if declarator.child_by_field_name("value").is_some() {
        return fix;
    }
    let last = children(field).into_iter().filter(|part| part.kind() == "variable_declarator").last().is_some_and(|last| last.id() == declarator.id());
    let end = if last { field.end_byte() } else { declarator.end_byte() };
    let initial = match context.resolver.declared_type(field, Some(declarator)) {
        Some(Type::Primitive(name)) => match name {
            "boolean" => "false",
            "short" => "(short) 0",
            "byte" => "(byte) 0",
            "char" => "(char) 0",
            _ => "0",
        },
        _ => "null",
    };
    fix.insert(end - 1, format!(" = {initial}"))
}

const SPECIFIC: &str = "Base exception classes should be treated as abstract. If the exception is intended to be caught, throw a domain-specific exception. Otherwise, prefer a more specific exception for clarity. Common alternatives include: AssertionError, IllegalArgumentException, IllegalStateException, and (Guava's) VerifyException.";

fn created_class(context: &Context, creation: Node) -> Option<String> {
    match context.resolver.type_node(creation.child_by_field_name("type")?)? {
        Type::Class(name, _) => Some(name),
        _ => None,
    }
}

pub fn throw_specific_exceptions(context: &Context, node: Node) {
    if node.kind() != "object_creation_expression" || parent(node).is_none_or(|above| above.kind() != "throw_statement") {
        return;
    }
    if children(node).iter().any(|part| part.kind() == "class_body") {
        return;
    }
    let base = created_class(context, node)
        .is_some_and(|name| matches!(name.as_str(), "java.lang.RuntimeException" | "java.lang.Throwable" | "java.lang.Error"));
    if base {
        let replacement = if created_class(context, node).is_some_and(|name| name == "java.lang.RuntimeException") {
            "com.google.common.base.VerifyException"
        } else {
            "java.lang.AssertionError"
        };
        let mut fix = Fix::new();
        let written = qualify_type(context, node, replacement, &mut fix);
        if let Some(kind) = node.child_by_field_name("type") {
            fix = fix.and(kind.start_byte(), kind.end_byte(), written);
        }
        context.report_fixed("ThrowSpecificExceptions", node, node.start_byte(), SPECIFIC, &[fix]);
    }
}

fn open_parenthesis(call: Node) -> usize {
    call.child_by_field_name("arguments").map_or(call.start_byte(), |list| list.start_byte())
}

const SYSTEM_OUT: &str = "Production code should not print to standard out or standard error. Standard out and standard error should only be used for debugging.";

pub fn system_out(context: &Context, node: Node) {
    match node.kind() {
        "field_access" => {
            let (Some(object), Some(field)) = (node.child_by_field_name("object"), node.child_by_field_name("field")) else { return };
            if !matches!(context.text(field), "out" | "err") {
                return;
            }
            let system = matches!(context.resolver.receiver(object), Some(Receiver::Static(name)) if name == "java.lang.System");
            if system {
                let dot = children(node).into_iter().find(|part| part.kind() == ".").map_or(field.start_byte(), |dot| dot.start_byte());
                context.report("SystemOut", node, dot, SYSTEM_OUT);
            }
        }
        "method_invocation" => {
            let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            let bad = match name {
                "printStackTrace" => context.resolver.matches_sig(node, "java.lang.Throwable#printStackTrace()"),
                "dumpStack" => context.resolver.matches_sig(node, "java.lang.Thread#dumpStack()"),
                "print" | "println" => context.resolver.matches_sig(node, &format!("java.lang.IO#{name}(_*)")),
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
const DATE_MESSAGE: &str = "Date has a bad API that leads to bugs; prefer java.time.Instant or LocalDate.";

pub fn java_util_date(context: &Context, node: Node) {
    match node.kind() {
        "object_creation_expression" => {
            if created_class(context, node).is_some_and(|name| name == DATE) {
                let at = children(node).into_iter().find(|part| part.kind() == "new").map_or(node.start_byte(), |new| new.start_byte());
                context.report("JavaUtilDate", node, at, DATE_MESSAGE);
            }
        }
        "method_invocation" => {
            let Some(call) = context.resolver.resolve_call(node) else { return };
            let qualified = node.child_by_field_name("object").is_some_and(|object| object.kind() != "super");
            let receiver = if qualified { call.receiver.name() } else { call.declaring.clone() };
            if receiver != DATE {
                return;
            }
            let method = &call.method;
            let exempt = (method.name == "toInstant" && !method.is_static)
                || (method.name == "from" && method.is_static && method.parameters.len() == 1 && method.parameters[0].name() == "java.time.Instant");
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
    let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
    if !matches!(name, "toLowerCase" | "toUpperCase") || !context.resolver.matches_sig(node, &format!("java.lang.String#{name}()")) {
        return;
    }
    let exact = context.resolver.resolve_call(node).is_some_and(|call| call.receiver.name() == "java.lang.String");
    if exact {
        context.report_fixed("StringCaseLocaleUsage", node, open_parenthesis(node), LOCALE, &locale_fixes(context, node, name));
    }
}

fn locale_fixes(context: &Context, call: Node, name: &str) -> Vec<Fix> {
    let close = call.end_byte() - 1;
    let locale = |text: &str| Fix::new().with_imports().insert(close, text);
    let mut ascii = Fix::new();
    if let Some(receiver) = call.child_by_field_name("object") {
        let qualified = qualify_type(context, call, "com.google.common.base.Ascii", &mut ascii);
        ascii = ascii.and(call.start_byte(), call.end_byte(), format!("{qualified}.{name}({})", context.text(receiver)));
    }
    vec![locale("Locale.ROOT"), locale("Locale.getDefault()"), ascii]
}
