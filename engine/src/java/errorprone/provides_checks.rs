//! CloseableProvides and EmptySetMultibindingContributions: checks on Guice and Dagger `@Provides` methods.
use super::Context;
use super::annotation_args::annotation_arguments;
use super::call_match::static_on_class;
use super::fixes::Fix;
use super::incompatible_calls::erased_at;
use super::inject_checks::{annotation_class, annotations_of};
use super::nodes::{name_position, token};
use super::parts::class_of;
use super::positions::arguments;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::modifiers;
use crate::java::types::model::Type;
use tree_sitter::Node;

pub fn closeable_provides(context: &Context, node: Node) {
    if node.kind() != "method_declaration" {
        return;
    }
    let names = context.resolver.annotation_names(node);
    if !names.iter().any(|name| name == "com.google.inject.Provides" || name == "dagger.Provides") {
        return;
    }
    let Some(written) = node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)) else { return };
    let closeable = match erased_at(context, node, &written) {
        Type::Class(name, _) => name == "java.io.Closeable" || context.resolver.index.is_subtype(&name, "java.io.Closeable"),
        _ => false,
    };
    if closeable {
        context.report_fixed("CloseableProvides", node, name_position(node), "Providing Closeable resources makes their lifecycle unclear", &[]);
    }
}

const ONE_MODULE_ARGUMENTS: [&str; 6] = ["injects", "staticInjections", "overrides", "addsTo", "complete", "library"];

fn no_arguments(call: Node) -> bool {
    arguments(call).is_empty()
}

fn is_empty_set(context: &Context, expression: Node) -> bool {
    let no_parameters = |call: Node| context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters.is_empty());
    match expression.kind() {
        "method_invocation" => {
            static_on_class(context, expression, "java.util.Collections", &["emptySet"])
                || (static_on_class(context, expression, "com.google.common.collect.ImmutableSet", &["of"]) && no_parameters(expression))
                || (static_on_class(context, expression, "com.google.common.collect.ImmutableSortedSet", &["of"]) && no_parameters(expression))
                || (static_on_class(context, expression, "com.google.common.collect.Sets", &["newHashSet", "newLinkedHashSet", "newConcurrentHashSet"]) && no_parameters(expression))
                || static_on_class(context, expression, "java.util.EnumSet", &["noneOf"])
        }
        "object_creation_expression" => {
            no_arguments(expression)
                && expression.child_by_field_name("object").is_none()
                && !children(expression).iter().any(|part| part.kind() == "class_body")
                && class_of(context, expression).is_some_and(|class| matches!(class.as_str(), "java.util.HashSet" | "java.util.LinkedHashSet" | "java.util.TreeSet"))
        }
        _ => false,
    }
}

fn returns_empty_set(context: &Context, method: Node) -> bool {
    let Some(body) = method.child_by_field_name("body") else { return false };
    let statements: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let [only] = statements.as_slice() else { return false };
    only.kind() == "return_statement" && only.named_child(0).is_some_and(|expression| is_empty_set(context, expression))
}

const FLAG_ORDER: [&str; 17] = [
    "public", "private", "protected", "static", "final", "synchronized", "volatile", "transient", "native", "interface", "abstract", "default", "strictfp", "sealed",
    "non-sealed", "enum", "record",
];

/// `ASTHelpers.asFlagSet` of the modifiers javac keeps for a declaration, in the order of javac's flag names.
fn flag_names(declaration: Node) -> Vec<&'static str> {
    let written: Vec<&str> = modifiers(declaration).map(children).unwrap_or_default().iter().map(|part| part.kind()).collect();
    let implicit = match declaration.kind() {
        "interface_declaration" => "interface",
        "enum_declaration" | "enum_constant" => "enum",
        "record_declaration" => "record",
        _ => "",
    };
    FLAG_ORDER.iter().copied().filter(|flag| written.contains(flag) || *flag == implicit).collect()
}

fn joined_modifiers(context: &Context, declaration: Node, leading: Option<&str>, drop_annotations: bool, flags: Vec<&str>) -> String {
    let mut parts: Vec<String> = leading.iter().map(|text| text.to_string()).collect();
    for annotation in annotations_of(declaration) {
        let class = annotation_class(context, annotation);
        let dropped = drop_annotations && matches!(class.as_deref(), Some("dagger.Provides" | "dagger.producers.Produces" | "dagger.multibindings.ElementsIntoSet"));
        if !dropped {
            parts.push(context.text(annotation).to_string());
        }
    }
    parts.extend(flags.into_iter().map(String::from));
    parts.join(" ")
}

const CLASSES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

/// The nearest class around a node: a declared class, an anonymous class body, or the body of an enum constant.
fn enclosing_class(node: Node) -> Option<Node> {
    let mut current = parent(node);
    while let Some(at) = current {
        let anonymous = at.kind() == "class_body" && parent(at).is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant"));
        if CLASSES.contains(&at.kind()) || anonymous {
            return Some(at);
        }
        current = parent(at);
    }
    None
}

fn dagger_one_module(context: &Context, class: Node) -> bool {
    annotations_of(class).into_iter().any(|annotation| {
        annotation_class(context, annotation).as_deref() == Some("dagger.Module")
            && annotation_arguments(annotation).iter().any(|argument| {
                argument.kind() == "element_value_pair" && argument.child_by_field_name("key").is_some_and(|key| ONE_MODULE_ARGUMENTS.contains(&context.text(key)))
            })
    })
}

pub fn empty_set_multibinding_contributions(context: &Context, method: Node) {
    if method.kind() != "method_declaration" {
        return;
    }
    let names = context.resolver.annotation_names(method);
    if !(names.iter().any(|name| name == "dagger.Provides" || name == "dagger.producers.Produces") && names.iter().any(|name| name == "dagger.multibindings.ElementsIntoSet")) {
        return;
    }
    if method.child_by_field_name("parameters").is_some_and(|list| named_children(list).iter().any(|part| !part.kind().ends_with("comment"))) || !returns_empty_set(context, method) {
        return;
    }
    let Some(class) = enclosing_class(method) else { return };
    if class.kind() != "class_body" && dagger_one_module(context, class) {
        return;
    }
    let Some(own) = modifiers(method) else { return };
    let Some(body) = method.child_by_field_name("body") else { return };
    let mut flags = flag_names(method);
    flags.retain(|flag| !matches!(*flag, "static" | "final"));
    if !flags.contains(&"abstract") {
        flags.push("abstract");
    }
    let replacement = joined_modifiers(context, method, Some("@Multibinds"), true, flags);
    let mut fix = Fix::replace(own.start_byte(), own.end_byte(), replacement).and(body.start_byte(), body.end_byte(), ";").with_imports();
    let (holder, modifiers_of) = match class.kind() {
        "class_body" => (parent(class).filter(|holder| holder.kind() == "enum_constant"), None),
        _ => (Some(class), Some(class)),
    };
    let mut class_flags = if class.kind() == "class_body" { holder.map(flag_names).unwrap_or_default() } else { flag_names(class) };
    class_flags.retain(|flag| *flag != "final");
    if !class_flags.contains(&"abstract") {
        class_flags.push("abstract");
    }
    let class_text = match modifiers_of {
        Some(declared) => joined_modifiers(context, declared, None, false, class_flags),
        None => class_flags.join(" "),
    };
    let existing = modifiers_of.and_then(modifiers);
    fix = match existing {
        Some(existing) => fix.and(existing.start_byte(), existing.end_byte(), class_text),
        None => {
            let at = match (modifiers_of, holder) {
                (Some(declared), _) => token(declared, "class").or_else(|| token(declared, "enum")).or_else(|| token(declared, "record")).or_else(|| token(declared, "interface")).map_or(declared.start_byte(), |keyword| keyword.start_byte()),
                (None, Some(constant)) => constant.start_byte(),
                (None, None) => class.start_byte(),
            };
            fix.insert(at, class_text)
        }
    };
    let message = "@Multibinds is a more efficient and declarative mechanism for ensuring that a set multibinding is present in the graph.";
    context.report_fixed("EmptySetMultibindingContributions", method, name_position(method), message, &[fix]);
}
