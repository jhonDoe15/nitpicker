//! DM_DEFAULT_ENCODING: a call of a JDK method or constructor that turns bytes into text, or text into bytes,
//! with the platform's default charset. The list is what SpotBugs 4.9.8 reports on test code. SpotBugs looks the
//! called method up again from the type it tracks for the receiver (what was stored, `this` for `super.m()` and
//! `super(...)`) and names that type; it reports when the lookup still lands on the JDK's own. A call that names a
//! subclass counts only in a class whose code also calls a listed JDK member directly. One finding per method and
//! called method, at its first call.
use super::super::observed::{field_stores, local_values};
use super::super::{Context, fields::field_key, names};
use super::Compiled;
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::{Type, flag};
use std::collections::HashSet;
use tree_sitter::Node;

pub const PATTERN: &str = "DM_DEFAULT_ENCODING";

const STREAM: &str = "java.io.OutputStream";
const IN: &str = "java.io.InputStream";
const FILE: &str = "java.io.File";
const NAME: &str = "java.lang.String";
const DESCRIPTOR: &str = "java.io.FileDescriptor";
const BOOLEAN: &str = "boolean";

/// Constructors that take the default charset, by class and erased parameters.
const CONSTRUCTORS: &[(&str, &[&str])] = &[
    ("java.lang.String", &["byte[]"]),
    ("java.lang.String", &["byte[]", "int", "int"]),
    ("java.io.InputStreamReader", &[IN]),
    ("java.io.OutputStreamWriter", &[STREAM]),
    ("java.io.FileReader", &[NAME]),
    ("java.io.FileReader", &[FILE]),
    ("java.io.FileReader", &[DESCRIPTOR]),
    ("java.io.FileWriter", &[NAME]),
    ("java.io.FileWriter", &[FILE]),
    ("java.io.FileWriter", &[NAME, BOOLEAN]),
    ("java.io.FileWriter", &[FILE, BOOLEAN]),
    ("java.io.FileWriter", &[DESCRIPTOR]),
    ("java.io.PrintStream", &[STREAM]),
    ("java.io.PrintStream", &[STREAM, BOOLEAN]),
    ("java.io.PrintStream", &[NAME]),
    ("java.io.PrintStream", &[FILE]),
    ("java.io.PrintWriter", &[NAME]),
    ("java.io.PrintWriter", &[FILE]),
    ("java.io.PrintWriter", &[STREAM]),
    ("java.io.PrintWriter", &[STREAM, BOOLEAN]),
    ("java.util.Scanner", &[IN]),
    ("java.util.Scanner", &[FILE]),
    ("java.util.Scanner", &["java.nio.channels.ReadableByteChannel"]),
    ("java.util.Formatter", &[NAME]),
    ("java.util.Formatter", &[FILE]),
    ("java.util.Formatter", &[STREAM]),
];

/// Instance methods that take the default charset, by declaring class and name; none has parameters.
const METHODS: &[(&str, &str)] = &[("java.lang.String", "getBytes"), ("java.io.ByteArrayOutputStream", "toString")];

fn type_name(kind: &Type) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", type_name(element)),
        other => other.erased().name(),
    }
}

fn listed_constructor(class: &str, parameters: &[Type]) -> bool {
    let parameters: Vec<String> = parameters.iter().map(type_name).collect();
    CONSTRUCTORS.iter().any(|(listed, wanted)| *listed == class && wanted.iter().copied().eq(parameters.iter().map(String::as_str)))
}

/// The class whose method of that name and parameters a call on `class` runs.
fn lands(context: &Context, class: &str, name: &str, parameters: &[Type]) -> Option<String> {
    let wanted: Vec<String> = parameters.iter().map(type_name).collect();
    let found = context.resolver.index.methods(class, name).into_iter().find(|(_, method)| method.parameters.iter().map(type_name).eq(wanted.iter().cloned()));
    found.map(|(info, _)| info.name.clone())
}

fn same(all: Vec<Option<Type>>) -> Option<Type> {
    let mut all = all.into_iter();
    let first = all.next()??;
    all.all(|next| next.as_ref().map(Type::name) == Some(first.name())).then_some(first)
}

const DEPTH: usize = 6;

/// A field's type as SpotBugs tracks it: what the class stores in it when that is always one type, nothing when the
/// stores differ, and the declared type for a public field or one the file never stores.
fn field_tracked(context: &Context, key: &(String, String), declared: Type, public: bool, depth: usize) -> Option<Type> {
    if public || !context.classes.contains_key(&key.0) {
        return Some(declared);
    }
    let stores = field_stores(context);
    let values: Vec<Node> = stores.get(key).into_iter().flatten().map(|value| unwrap(*value)).filter(|value| value.kind() != "null_literal").collect();
    if values.is_empty() {
        return Some(declared);
    }
    same(values.into_iter().map(|value| tracked(context, value, depth + 1)).collect())
}

/// The type SpotBugs tracks for a value: a local is what was stored in it, or its declared type where different
/// types meet; a conditional of two types is unknown.
pub fn tracked(context: &Context, value: Node, depth: usize) -> Option<Type> {
    let value = unwrap(value);
    let resolver = context.resolver;
    if depth > DEPTH {
        return resolver.type_of(value);
    }
    match value.kind() {
        "null_literal" => None,
        "cast_expression" => {
            let cast = resolver.type_of(value)?;
            let inner = value.child_by_field_name("value").and_then(|inner| tracked(context, inner, depth + 1));
            Some(inner.filter(|inner| resolver.index.is_subtype(&inner.name(), &cast.name())).unwrap_or(cast))
        }
        "object_creation_expression" if crate::engine::source::children(value).iter().any(|part| part.kind() == "class_body") => None,
        "ternary_expression" => {
            let sides = [value.child_by_field_name("consequence")?, value.child_by_field_name("alternative")?];
            same(sides.into_iter().map(unwrap).filter(|side| side.kind() != "null_literal").map(|side| tracked(context, side, depth + 1)).collect())
        }
        "identifier" => match resolver.binding(value, context.text(value)) {
            Some(Binding::Field(_, declaring, field)) => {
                field_tracked(context, &(declaring.name.clone(), field.name.clone()), field.kind.clone(), field.flags & flag::PUBLIC != 0, depth)
            }
            Some(Binding::Local(declared)) => {
                let held = local_values(context, value, context.text(value));
                let known: Vec<Node> = held.into_iter().map(unwrap).filter(|held| held.kind() != "null_literal").collect();
                if known.is_empty() {
                    return declared;
                }
                same(known.into_iter().map(|held| tracked(context, held, depth + 1)).collect()).or(declared)
            }
            None => resolver.type_of(value),
        },
        "field_access" => {
            let declared = resolver.type_of(value)?;
            let Some(key) = field_key(context, value) else { return Some(declared) };
            let public = resolver.index.field(&key.0, &key.1).is_some_and(|(_, field)| field.flags & flag::PUBLIC != 0);
            field_tracked(context, &key, declared, public, depth)
        }
        _ => resolver.type_of(value),
    }
}

fn superclass(context: &Context, own: &str) -> Option<String> {
    context.resolver.index.get(own).map(|info| info.superclass.clone().unwrap_or_else(|| "java.lang.Object".to_string()))
}

/// The class javac names in the call it writes: the receiver's declared type, the class itself for a call on
/// `this`, its superclass for `super`.
pub fn written_owner(context: &Context, own: &str, call: Node) -> Option<String> {
    match call.child_by_field_name("object") {
        None => Some(own.to_string()),
        Some(object) if object.kind() == "this" => Some(own.to_string()),
        Some(object) if object.kind() == "super" => superclass(context, own),
        Some(object) => match context.resolver.type_of(object)?.erased() {
            Type::Class(class, _) => Some(class),
            _ => None,
        },
    }
}

fn wanted_call<'a>(context: &Context<'a>, node: Node) -> Option<(&'a str, crate::java::types::expr::Call)> {
    let name = context.text(node.child_by_field_name("name")?);
    let name = METHODS.iter().find(|(_, wanted)| *wanted == name)?.1;
    let call = context.resolver.resolve_call(node)?;
    (!call.method.is_static && call.method.parameters.is_empty()).then_some((name, call))
}

/// Whether the code calls a listed JDK member by name, as the class file then refers to it.
fn direct(context: &Context, own: &str, node: Node) -> bool {
    let resolver = context.resolver;
    match node.kind() {
        "object_creation_expression" => resolver.resolve_constructor(node).is_some_and(|call| listed_constructor(&call.declaring, &call.method.parameters)),
        "explicit_constructor_invocation" => {
            let up = node.child_by_field_name("constructor").is_some_and(|part| part.kind() == "super");
            up && resolver.call_formals(node).is_some_and(|(call, _)| listed_constructor(&call.declaring, &call.method.parameters))
        }
        "method_invocation" => wanted_call(context, node).is_some_and(|(name, _)| written_owner(context, own, node).is_some_and(|owner| METHODS.contains(&(owner.as_str(), name)))),
        _ => false,
    }
}

/// What a call or creation calls, as the message names it.
fn reliance(context: &Context, own: &str, node: Node) -> Option<String> {
    let resolver = context.resolver;
    match node.kind() {
        "object_creation_expression" => {
            if crate::engine::source::children(node).iter().any(|part| part.kind() == "class_body") {
                return None;
            }
            let call = resolver.resolve_constructor(node)?;
            listed_constructor(&call.declaring, &call.method.parameters).then(|| super::called(context, &call.declaring, "<init>", &call.method.parameters))
        }
        "explicit_constructor_invocation" => {
            if node.child_by_field_name("constructor").is_none_or(|part| part.kind() != "super") {
                return None;
            }
            let (call, _) = resolver.call_formals(node)?;
            if !listed_constructor(&call.declaring, &call.method.parameters) || lands(context, own, "<init>", &call.method.parameters)? != call.declaring {
                return None;
            }
            Some(super::called(context, own, "<init>", &call.method.parameters))
        }
        "method_invocation" => {
            let (name, _) = wanted_call(context, node)?;
            let owner = written_owner(context, own, node)?;
            let declaring = lands(context, &owner, name, &[])?;
            if !METHODS.contains(&(declaring.as_str(), name)) {
                return None;
            }
            let receiver = match node.child_by_field_name("object") {
                None => own.to_string(),
                Some(object) if matches!(object.kind(), "this" | "super") => own.to_string(),
                Some(object) => match tracked(context, object, 0)?.erased() {
                    Type::Class(class, _) => class,
                    _ => return None,
                },
            };
            if lands(context, &receiver, name, &[])? != declaring {
                return None;
            }
            Some(super::called(context, &receiver, name, &[]))
        }
        _ => None,
    }
}

pub fn check(context: &Context, own: &str, methods: &[Compiled]) {
    if !context.wants(&[PATTERN]) {
        return;
    }
    let referred = methods.iter().flat_map(|method| method.nodes.iter()).any(|node| direct(context, own, *node));
    if !referred {
        return;
    }
    for method in methods {
        let mut seen = HashSet::new();
        for node in &method.nodes {
            let Some(called) = reliance(context, own, *node) else { continue };
            if !seen.insert(called.clone()) {
                continue;
            }
            let line = node.child_by_field_name("arguments").map_or_else(|| context.line(*node), |arguments| context.line(arguments));
            let class = crate::java::types::scope::enclosing_types(context.resolver.scope, *node).into_iter().next();
            let package = class.as_deref().map(|class| names::package_of(&names::binary(context, class)).to_string()).unwrap_or_default();
            let shown = class.as_deref().map(|class| names::binary(context, class)).unwrap_or_default();
            let message = format!("Found reliance on default encoding in {}: {called}", method.label);
            let place = format!("function:{called}|{package}@{shown}");
            context.report_listed(PATTERN, *node, line, message, place, 1, vec![method.label.clone(), called]);
        }
    }
}
