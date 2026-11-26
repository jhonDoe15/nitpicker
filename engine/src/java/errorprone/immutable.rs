//! ImmutableEnumChecker: an enum, or the body of an enum constant, with a field that can change or that holds
//! something that can. The check is off when `@Immutable` is not among the classes of the project, as it is for
//! Error Prone.
use super::Context;
use super::fixes::{self, Fix};
use super::fix_helpers::add_modifiers;
use super::hierarchy::{closure, simple_name};
use super::immutable_known::{IMMUTABLE, MUTABLE};
use crate::engine::source::{children, named_children};
use crate::java::helpers::{has_modifier, modifiers};
use crate::java::types::model::{ClassInfo, Type, flag};
use tree_sitter::Node;

const NAME: &str = "ImmutableEnumChecker";
const OTHER_NAME: &str = "Immutable";
const LAZY: &str = "com.google.errorprone.annotations.concurrent.LazyInit";
const ANNOTATED: &str = "enums are immutable by default; annotating them with @com.google.errorprone.annotations.Immutable is unnecessary";
const ANNOTATION: &str = "java.lang.annotation.Annotation";

/// A type as the field wrote it, wildcards kept.
enum Written {
    Primitive(String),
    /// The class, its type arguments unless it is raw, and the text javac prints for it.
    Class(String, Option<Vec<Argument>>, String),
    Array(Box<Written>),
    Variable(String),
}

enum Argument {
    Is(Written),
    Extends(Written),
    /// `?` or `? super X`, with the text javac prints for it.
    Open(String),
}

fn text(written: &Written) -> String {
    match written {
        Written::Primitive(name) | Written::Variable(name) => name.clone(),
        Written::Class(_, _, shown) => shown.clone(),
        Written::Array(element) => format!("{}[]", text(element)),
    }
}

fn shown(name: &str, arguments: Option<&Vec<Argument>>) -> String {
    let Some(arguments) = arguments else { return name.to_string() };
    let parts: Vec<String> = arguments
        .iter()
        .map(|argument| match argument {
            Argument::Is(kind) => text(kind),
            Argument::Extends(kind) => format!("? extends {}", text(kind)),
            Argument::Open(written) => written.clone(),
        })
        .collect();
    format!("{name}<{}>", parts.join(","))
}

fn arguments(context: &Context, list: Node) -> Option<Vec<Argument>> {
    named_children(list)
        .into_iter()
        .filter(|part| !part.kind().ends_with("comment"))
        .map(|part| {
            if part.kind() != "wildcard" {
                return written(context, part).map(Argument::Is);
            }
            let bound = named_children(part).into_iter().rev().find(|inner| !inner.kind().ends_with("annotation"));
            let lower = children(part).iter().any(|word| word.kind() == "super");
            match bound {
                Some(bound) if lower => Some(Argument::Open(format!("? super {}", text(&written(context, bound)?)))),
                Some(bound) => written(context, bound).map(Argument::Extends),
                None => Some(Argument::Open("?".to_string())),
            }
        })
        .collect()
}

fn written(context: &Context, node: Node) -> Option<Written> {
    match node.kind() {
        "integral_type" | "floating_point_type" | "boolean_type" | "void_type" => Some(Written::Primitive(context.text(node).to_string())),
        "array_type" => {
            let mut kind = written(context, node.child_by_field_name("element")?)?;
            let dimensions = node.child_by_field_name("dimensions")?;
            for _ in children(dimensions).iter().filter(|part| part.kind() == "[") {
                kind = Written::Array(Box::new(kind));
            }
            Some(kind)
        }
        "annotated_type" => written(context, named_children(node).into_iter().rev().find(|part| !part.kind().ends_with("annotation"))?),
        "generic_type" => {
            let parts = named_children(node);
            let base = written(context, *parts.first()?)?;
            let given = arguments(context, *parts.iter().find(|part| part.kind() == "type_arguments")?)?;
            let Written::Class(name, _, outer) = base else { return None };
            let print = shown(&outer, Some(&given));
            Some(Written::Class(name, Some(given), print))
        }
        "type_identifier" | "scoped_type_identifier" => match context.resolver.type_node(node)? {
            Type::Variable(name) => Some(Written::Variable(name)),
            Type::Class(name, _) => {
                let outer = named_children(node).into_iter().find(|part| part.kind() == "generic_type").and_then(|outer| written(context, outer));
                let print = match outer {
                    Some(outer) => format!("{}.{}", text(&outer), simple_name(&name)),
                    None => name.clone(),
                };
                Some(Written::Class(name, None, print))
            }
            _ => None,
        },
        _ => None,
    }
}

/// The bound of a type parameter, which the index keeps without its type arguments.
fn bound(kind: &Type) -> Written {
    match kind {
        Type::Primitive(name) => Written::Primitive((*name).to_string()),
        Type::Array(element) => Written::Array(Box::new(bound(element))),
        other => {
            let name = other.erased().name();
            Written::Class(name.clone(), None, name)
        }
    }
}

/// The type parameters `@Immutable` on the class or on the nearest marked supertype names; nothing when no
/// supertype is marked.
fn marked(context: &Context, info: &ClassInfo) -> Option<Vec<String>> {
    let index = context.resolver.index;
    if info.flags & flag::IMMUTABLE != 0 {
        return Some(info.container_of.clone());
    }
    let own = Type::Class(info.name.clone(), info.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect());
    for above in closure(index, &info.name) {
        let Some(parent) = index.get(&above) else { continue };
        let Some(held) = marked(context, parent) else { continue };
        let map = index.member_map(&own, &above);
        let kept = parent.type_parameters.iter().filter(|(formal, _)| held.contains(formal)).filter_map(|(formal, _)| match map.get(formal) {
            Some(Type::Variable(name)) if info.type_parameters.iter().any(|(own, _)| own == name) => Some(name.clone()),
            _ => None,
        });
        return Some(kept.collect());
    }
    None
}

fn known(name: &str) -> Option<Vec<String>> {
    IMMUTABLE.iter().find(|(class, _)| *class == name).map(|(_, held)| held.iter().map(|name| (*name).to_string()).collect())
}

/// Why a class marked immutable is not, with these type arguments. A bound read from the index has lost its type
/// arguments, so there a missing argument is not held against the class.
fn instantiation(context: &Context, info: &ClassInfo, held: &[String], given: Option<&Vec<Argument>>, from_bound: bool) -> Option<Vec<String>> {
    let simple = simple_name(&info.name);
    for (at, (parameter, above)) in info.type_parameters.iter().enumerate() {
        let strict = info.immutable_parameters.contains(parameter);
        if !strict && !held.contains(parameter) {
            continue;
        }
        let Some(given) = given else {
            if from_bound {
                continue;
            }
            return Some(vec![format!("'{simple}' required instantiation of '{parameter}' with type parameters, but was raw")]);
        };
        let why = match given.get(at)? {
            Argument::Is(kind) => unsafe_type(context, kind, false),
            _ if strict => None,
            Argument::Extends(kind) => unsafe_type(context, kind, false),
            Argument::Open(_) => unsafe_type(context, &bound(above), true),
        };
        if let Some(mut why) = why {
            why.insert(0, format!("'{simple}' was instantiated with mutable type for '{parameter}'"));
            return Some(why);
        }
    }
    None
}

/// Why values of a type can change, outermost reason first; nothing when they cannot.
fn unsafe_type(context: &Context, kind: &Written, from_bound: bool) -> Option<Vec<String>> {
    let index = context.resolver.index;
    let (name, given) = match kind {
        Written::Primitive(_) => return None,
        Written::Array(_) => return Some(vec!["arrays are mutable".to_string()]),
        Written::Variable(name) => return Some(vec![format!("'{name}' is a mutable type variable")]),
        Written::Class(name, given, _) => (name, given.as_ref()),
    };
    let info = index.get(name)?;
    if info.flags & (flag::ENUM | flag::ANNOTATION) != 0 || index.is_subtype(name, ANNOTATION) {
        return None;
    }
    if let Some(held) = known(name).or_else(|| marked(context, info)) {
        return instantiation(context, info, &held, given, from_bound);
    }
    if MUTABLE.contains(&name.as_str()) {
        return Some(vec![format!("'{}' is mutable", simple_name(name))]);
    }
    let under = |above: &str| index.has(above) && index.is_subtype(name, above);
    if under("com.google.protobuf.MessageLite") && !under("com.google.io.protocol.ProtocolMessage") {
        return under("com.google.protobuf.MutableMessageLite").then(|| vec![format!("'{}' is a mutable proto message", simple_name(name))]);
    }
    if under("com.google.protobuf.Internal.EnumLite") {
        return None;
    }
    Some(vec![format!("the declaration of type '{}' is not annotated with @{}", text(kind), flag::IMMUTABLE_NAME)])
}

fn annotation<'t>(context: &Context, declaration: Node<'t>, wanted: &str) -> Option<Node<'t>> {
    modifiers(declaration).map(children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).find(|part| {
        part.child_by_field_name("name").is_some_and(|name| context.resolver.class_name(declaration, context.text(name)).as_deref() == Some(wanted))
    })
}

fn quiet(context: &Context, node: Node) -> bool {
    context.suppressed(NAME, node) || context.suppressed(OTHER_NAME, node)
}

fn report(context: &Context, at: usize, pretty: &str, mut why: Vec<String>, first: String, fixes: &[Fix]) {
    why.insert(0, format!("'{pretty}' {first}"));
    let sentence = fixes::sentence(&context.file.text, fixes);
    context.report_always(NAME, at, &format!("enums should be immutable: {}{sentence}", why.join(", ")));
}

fn fields(context: &Context, body: Node, pretty: &str) {
    let members = children(body).into_iter().flat_map(|part| if part.kind() == "enum_body_declarations" { children(part) } else { vec![part] });
    for field in members.filter(|member| member.kind() == "field_declaration" && !has_modifier(*member, "static")) {
        if quiet(context, field) {
            continue;
        }
        let fixed = has_modifier(field, "final") || annotation(context, field, LAZY).is_some();
        let kind = field.child_by_field_name("type").and_then(|kind| written(context, kind));
        for declarator in children(field).into_iter().filter(|part| part.kind() == "variable_declarator") {
            let Some(name) = declarator.child_by_field_name("name") else { continue };
            let label = context.text(name);
            if !fixed {
                report(context, name.start_byte(), pretty, Vec::new(), format!("has non-final field '{label}'"), &[add_modifiers(Fix::new(), field, &["final"])]);
                continue;
            }
            let Some(mut kind) = kind.as_ref().map(|kind| copy(kind)) else { continue };
            let extra = declarator.child_by_field_name("dimensions").map(children).unwrap_or_default();
            for _ in extra.iter().filter(|part| part.kind() == "[") {
                kind = Written::Array(Box::new(kind));
            }
            if let Some(why) = unsafe_type(context, &kind, false) {
                report(context, name.start_byte(), pretty, why, format!("has field '{label}' of type '{}'", text(&kind)), &[]);
            }
        }
    }
}

fn copy(kind: &Written) -> Written {
    match kind {
        Written::Primitive(name) => Written::Primitive(name.clone()),
        Written::Variable(name) => Written::Variable(name.clone()),
        Written::Array(element) => Written::Array(Box::new(copy(element))),
        Written::Class(name, given, shown) => {
            let given = given.as_ref().map(|list| {
                list.iter()
                    .map(|argument| match argument {
                        Argument::Is(kind) => Argument::Is(copy(kind)),
                        Argument::Extends(kind) => Argument::Extends(copy(kind)),
                        Argument::Open(written) => Argument::Open(written.clone()),
                    })
                    .collect()
            });
            Written::Class(name.clone(), given, shown.clone())
        }
    }
}

/// An interface of the enum that is immutable but takes a type argument that is not.
fn interfaces(context: &Context, node: Node, keyword: usize, pretty: &str) {
    let index = context.resolver.index;
    let Some(list) = node.child_by_field_name("interfaces").and_then(|holder| named_children(holder).into_iter().find(|part| part.kind() == "type_list")) else { return };
    for kind in named_children(list).into_iter().filter_map(|part| written(context, part)) {
        let Written::Class(name, given, _) = &kind else { continue };
        let Some(info) = index.get(name) else { continue };
        let Some(held) = known(name).or_else(|| marked(context, info)) else { continue };
        if let Some(why) = instantiation(context, info, &held, given.as_ref(), false) {
            return report(context, keyword, pretty, why, format!("extends '{}'", simple_name(name)), &[]);
        }
    }
}

pub fn immutable_enum_checker(context: &Context, node: Node) {
    let index = context.resolver.index;
    let body = match node.kind() {
        "enum_declaration" => node.child_by_field_name("body"),
        "enum_constant" => node.child_by_field_name("body"),
        _ => return,
    };
    let (Some(body), Some(name)) = (body, node.child_by_field_name("name")) else { return };
    if !index.has(flag::IMMUTABLE_NAME) || quiet(context, node) {
        return;
    }
    let pretty = context.text(name);
    if node.kind() == "enum_constant" {
        return fields(context, body, pretty);
    }
    let Some(info) = context.resolver.scope.names.get(&node.id()).and_then(|class| index.get(class)) else { return };
    let keyword = children(node).into_iter().find(|part| part.kind() == "enum").map_or(node.start_byte(), |word| word.start_byte());
    let exempt = info.interfaces.iter().filter_map(|above| index.get(above)).any(|above| above.flags & flag::IMMUTABLE != 0);
    if info.flags & flag::IMMUTABLE != 0 && !exempt {
        let simple = modifiers(node).map(children).unwrap_or_default().into_iter().find(|part| {
            matches!(part.kind(), "annotation" | "marker_annotation")
                && part.child_by_field_name("name").is_some_and(|name| context.text(name).rsplit('.').next() == Some(OTHER_NAME))
        });
        let fix = simple.map(|found| Fix::new().delete(found.start_byte(), found.end_byte()));
        let sentence = fixes::sentence(&context.file.text, &fix.into_iter().collect::<Vec<_>>());
        context.report_always(NAME, simple.map_or(keyword, |found| found.start_byte()), &format!("{ANNOTATED}{sentence}"));
    }
    fields(context, body, pretty);
    interfaces(context, node, keyword, pretty);
}
