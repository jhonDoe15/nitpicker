//! UseBinds: a Dagger 2 `@Provides` or `@Produces` method that only returns its one parameter, in a module whose
//! other instance methods are all such methods, can be an abstract `@Binds` method.
//!
//! Error Prone writes the method's remaining modifiers from a `HashSet` of `Modifier`, whose order changes between
//! runs of the JVM when two or more are left; the engine writes them in the order of the `Modifier` enum.
use super::Context;
use super::fixes::Fix;
use super::guice::{annotations, has_annotation};
use super::nodes::name_position;
use crate::engine::source::{children, named_children};
use crate::java::helpers::modifiers;
use tree_sitter::Node;

const BINDING: [&str; 2] = ["dagger.Provides", "dagger.producers.Produces"];
/// `javax.lang.model.element.Modifier` in its declared order.
const ORDER: &[&str] = &[
    "public", "protected", "private", "abstract", "default", "static", "sealed", "non-sealed", "final", "transient", "volatile", "synchronized",
    "native", "strictfp",
];
const DAGGER_1: &[&str] = &["injects", "staticInjections", "overrides", "addsTo", "complete", "library"];

fn words(declaration: Node) -> Vec<String> {
    let Some(holder) = modifiers(declaration) else { return Vec::new() };
    let mut found: Vec<String> =
        children(holder).into_iter().filter(|part| !matches!(part.kind(), "marker_annotation" | "annotation") && !part.kind().ends_with("comment")).map(|part| part.kind().to_string()).collect();
    found.sort_by_key(|word| ORDER.iter().position(|known| known == word));
    found
}

fn members(class: Node) -> Vec<Node> {
    let mut found = class.child_by_field_name("body").map(children).unwrap_or_default();
    if let Some(rest) = found.iter().copied().find(|part| part.kind() == "enum_body_declarations") {
        found.extend(children(rest));
    }
    found
}

fn parameter_name<'t>(context: &'t Context, parameter: Node) -> Option<&'t str> {
    let name = parameter.child_by_field_name("name").or_else(|| {
        children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|declarator| declarator.child_by_field_name("name"))
    })?;
    Some(context.text(name))
}

/// One parameter and a body of `return <that parameter>;`.
fn simple(context: &Context, method: Node) -> bool {
    let parameters: Vec<Node> = method.child_by_field_name("parameters").map(named_children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter")).collect();
    let all = method.child_by_field_name("parameters").map(named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).count();
    let [parameter] = parameters.as_slice() else { return false };
    if all != 1 {
        return false;
    }
    let Some(body) = method.child_by_field_name("body") else { return false };
    let statements: Vec<Node> = named_children(body).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let [statement] = statements.as_slice() else { return false };
    if statement.kind() != "return_statement" {
        return false;
    }
    let Some(returned) = statement.named_child(0).filter(|value| value.kind() == "identifier") else { return false };
    let name = parameter_name(context, *parameter);
    name == Some(context.text(returned)) && !context.resolver.binding(returned, context.text(returned)).is_some_and(|found| matches!(found, crate::java::types::expr::Binding::Field(..)))
}

fn can_bind(context: &Context, method: Node) -> bool {
    has_annotation(context, method, &BINDING) && simple(context, method)
}

fn dagger_2_module(context: &Context, class: Node) -> bool {
    annotations(context, class).iter().any(|(annotation, name)| match name.as_str() {
        "dagger.producers.ProducerModule" => true,
        "dagger.Module" => {
            let pairs = annotation.child_by_field_name("arguments").map(named_children).unwrap_or_default();
            !pairs.iter().any(|pair| pair.kind() == "element_value_pair" && pair.child_by_field_name("key").is_some_and(|key| DAGGER_1.contains(&context.text(key))))
        }
        _ => false,
    })
}

fn binds_method(context: &Context, method: Node, interface: bool) -> Option<Fix> {
    let holder = modifiers(method)?;
    let mut written = vec!["@Binds".to_string()];
    for (annotation, name) in annotations(context, method) {
        if !BINDING.contains(&name.as_str()) {
            written.push(context.text(annotation).to_string());
            continue;
        }
        let Some(pair) = annotation.child_by_field_name("arguments").map(named_children).unwrap_or_default().into_iter().find(|part| part.kind() == "element_value_pair") else { continue };
        let value = pair.child_by_field_name("value")?;
        let last = if value.kind() == "field_access" { value.child_by_field_name("field")? } else { value };
        written.push(
            match context.text(last) {
                "SET" => "@IntoSet",
                "SET_VALUES" => "@ElementsIntoSet",
                "MAP" => "@IntoMap",
                _ => return None,
            }
            .to_string(),
        );
    }
    let mut flags: Vec<String> = words(method).into_iter().filter(|word| word != "static" && word != "final").collect();
    if !interface && !flags.iter().any(|word| word == "abstract") {
        flags.push("abstract".to_string());
        flags.sort_by_key(|word| ORDER.iter().position(|known| known == word));
    }
    written.extend(flags);
    let body = method.child_by_field_name("body")?;
    Some(Fix::replace(holder.start_byte(), holder.end_byte(), written.join(" ")).and(body.start_byte(), body.end_byte(), ";").with_imports())
}

/// Util.makeConcreteClassAbstract: the class made abstract, with a private constructor when it was final with none.
fn abstract_class(context: &Context, class: Node) -> Fix {
    let mut flags = words(class);
    let was_final = flags.iter().any(|word| word == "final");
    let was_abstract = flags.iter().any(|word| word == "abstract");
    if class.kind() == "interface_declaration" || (!was_final && was_abstract) {
        return Fix::new();
    }
    flags.retain(|word| word != "final");
    if !was_abstract {
        flags.push("abstract".to_string());
        flags.sort_by_key(|word| ORDER.iter().position(|known| known == word));
    }
    let mut written: Vec<String> = annotations(context, class).into_iter().map(|(annotation, _)| context.text(annotation).to_string()).collect();
    written.extend(flags);
    let text = written.join(" ");
    let mut fix = match modifiers(class) {
        Some(holder) => Fix::replace(holder.start_byte(), holder.end_byte(), text),
        None => Fix::replace(class.start_byte(), class.start_byte(), text),
    };
    let constructors = members(class).into_iter().any(|member| member.kind() == "constructor_declaration");
    if was_final && !constructors {
        let name = class.child_by_field_name("name").map_or("", |name| context.text(name));
        let mut indent = "  ";
        for member in members(class).into_iter().filter(|member| member.is_named() && !member.kind().ends_with("comment")) {
            if member.kind() == "method_declaration" {
                fix = fix.and(member.start_byte(), member.start_byte(), format!("{indent}private {name}() {{}} // no instances\n{indent}"));
                break;
            }
            indent = "";
        }
    }
    fix
}

pub fn use_binds(context: &Context, method: Node) {
    if method.kind() != "method_declaration" || !can_bind(context, method) {
        return;
    }
    let Some(class) = crate::engine::source::ancestor(method, &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "object_creation_expression"]) else { return };
    if class.kind() == "object_creation_expression" || !dagger_2_module(context, class) {
        return;
    }
    if class.child_by_field_name("superclass").is_some() {
        return;
    }
    let blocking = members(class).into_iter().filter(|member| member.kind() == "method_declaration").any(|sibling| {
        let flags = words(sibling);
        !flags.iter().any(|word| word == "static" || word == "abstract") && !can_bind(context, sibling)
    });
    if blocking {
        return;
    }
    let Some(fix) = binds_method(context, method, class.kind() == "interface_declaration") else { return };
    let fix = fix.merged(abstract_class(context, class));
    context.report_fixed("UseBinds", method, name_position(method), "@Binds is a more efficient and declarative mechanism for delegating a binding.", &[fix]);
}
