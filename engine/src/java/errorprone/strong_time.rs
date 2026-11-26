//! StronglyTypeTime: an integral field that is only used to construct time types.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::lookup::field_of;
use crate::engine::source::{parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::Type;
use regex::Regex;
use std::sync::LazyLock;
use tree_sitter::Node;

static UNIT: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new("(?i)((_?IN)?_?(NANO|NANOSECOND|NSEC|_NS|MICRO|MSEC|USEC|MICROSECOND|MILLI|MILLISECOND|_MS|SEC|SECOND|MINUTE|MIN|HOUR|DAY)S?)?$").unwrap()
});

const FACTORIES: &[(&str, &[&str], Option<&str>)] = &[
    ("java.time.Duration", &["ofNanos", "ofMillis", "ofSeconds", "ofMinutes", "ofHours", "ofDays"], Some("long")),
    ("java.time.Instant", &["ofEpochMilli", "ofEpochSecond"], Some("long")),
    ("com.google.protobuf.util.Timestamps", &["fromNanos", "fromMicros", "fromMillis", "fromSeconds"], None),
    ("com.google.protobuf.util.Durations", &["fromNanos", "fromMicros", "fromMillis", "fromSeconds", "fromMinutes", "fromHours", "fromDays"], None),
    ("org.joda.time.Duration", &["millis", "standardSeconds", "standardMinutes", "standardHours", "standardDays"], Some("long")),
    ("org.joda.time.Instant", &["ofEpochMilli", "ofEpochSecond"], Some("long")),
];

fn rename(name: &str) -> String {
    let stripped = UNIT.replace_all(name, "").to_string();
    if stripped.is_empty() { name.to_string() } else { stripped }
}

/// The factory call that takes the field as its argument: the call, a key for the method, and the type it makes.
fn factory<'t>(context: &Context, usage: Node<'t>) -> Option<(Node<'t>, String, String)> {
    let list = parent(usage).filter(|holder| holder.kind() == "argument_list")?;
    let call = parent(list)?;
    match call.kind() {
        "method_invocation" => {
            let name = context.text(call.child_by_field_name("name")?);
            for (owner, names, parameter) in FACTORIES {
                if !names.contains(&name) {
                    continue;
                }
                let signature = format!("{owner}#{name}({})", parameter.map_or("_*", |kind| kind));
                if context.resolver.matches_sig(call, &signature) {
                    let (resolved, _) = context.resolver.call_formals(call)?;
                    let made = match &resolved.method.returns {
                        Type::Class(made, _) => made.clone(),
                        _ => return None,
                    };
                    return Some((call, format!("{owner}#{name}{:?}", resolved.method.parameters), made));
                }
            }
            None
        }
        "object_creation_expression" => {
            let (resolved, _) = context.resolver.call_formals(call)?;
            let class = resolved.declaring.clone();
            let known = matches!(class.as_str(), "org.joda.time.Instant" | "org.joda.time.DateTime");
            (known && resolved.method.parameters == [Type::Primitive("long")]).then(|| (call, format!("{class}#<init>"), class))
        }
        _ => None,
    }
}

pub fn strongly_type_time(context: &Context, root: Node) {
    let mut fields: Vec<(Node, Node, String, String)> = Vec::new();
    walk(root, |node| {
        if node.kind() != "field_declaration" || !has_modifier(node, "final") {
            return;
        }
        let list = declarators(node);
        if list.len() != 1 || !super::members::hidden(node) || context.suppressed("StronglyTypeTime", node) {
            return;
        }
        let declarator = list[0];
        if declarator.child_by_field_name("name").is_none() || declarator.child_by_field_name("value").is_none() {
            return;
        }
        let primitive = match context.resolver.declared_type(node, Some(declarator)) {
            Some(Type::Primitive(kind)) if matches!(kind, "int" | "long" | "float" | "double") => kind.to_string(),
            Some(Type::Class(boxed, _)) => match boxed.as_str() {
                "java.lang.Integer" => "int".to_string(),
                "java.lang.Long" => "long".to_string(),
                "java.lang.Float" => "float".to_string(),
                "java.lang.Double" => "double".to_string(),
                _ => return,
            },
            _ => return,
        };
        let Some(owner) = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node) else { return };
        fields.push((node, declarator, owner, primitive));
    });
    if fields.is_empty() {
        return;
    }
    let mut usages: Vec<Option<Vec<(Node, String, String)>>> = fields.iter().map(|_| Some(Vec::new())).collect();
    walk(root, |node| {
        if !matches!(node.kind(), "identifier" | "field_access") || !super::values::value_name(node) {
            return;
        }
        let name = if node.kind() == "identifier" { context.text(node) } else { node.child_by_field_name("field").map(|part| context.text(part)).unwrap_or_default() };
        let candidates: Vec<usize> = (0..fields.len()).filter(|at| fields[*at].1.child_by_field_name("name").is_some_and(|part| context.text(part) == name)).collect();
        if candidates.is_empty() {
            return;
        }
        let Some((declaring, field)) = field_of(context, node) else { return };
        for at in candidates {
            if fields[at].2 != declaring.name || field.name != name {
                continue;
            }
            let found = factory(context, node);
            match (found, usages[at].as_mut()) {
                (Some(found), Some(list)) => list.push(found),
                _ => usages[at] = None,
            }
        }
    });
    for (at, (declaration, declarator, _, primitive)) in fields.iter().enumerate() {
        let Some(list) = &usages[at] else { continue };
        let Some(first) = list.first() else { continue };
        if list.iter().any(|other| other.1 != first.1) {
            continue;
        }
        report(context, *declaration, *declarator, primitive, list);
    }
}

fn report(context: &Context, declaration: Node, declarator: Node, primitive: &str, list: &[(Node, String, String)]) {
    let (Some(name), Some(value)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { return };
    let (factory, _, made) = &list[0];
    let new_name = rename(context.text(name));
    let type_name = qualify_type(context, declaration, made, &mut Fix::new());
    let select = if factory.kind() == "method_invocation" {
        let end = factory.child_by_field_name("name").map_or(factory.end_byte(), |part| part.end_byte());
        context.file.text[factory.start_byte()..end].to_string()
    } else {
        let written = factory.child_by_field_name("type").map(|part| context.text(part)).unwrap_or_default();
        format!("new {written}")
    };
    let modifiers = crate::java::helpers::modifiers(declaration).map(|part| context.text(part)).unwrap_or_default();
    let text = format!("{modifiers} {type_name} {new_name} = {select}({});", context.text(value));
    let mut fix = Fix::replace(declaration.start_byte(), declaration.end_byte(), text);
    if type_name == made.rsplit('.').next().unwrap_or(made) {
        fix = fix.with_imports();
    }
    for (call, _, _) in list {
        fix = fix.and(call.start_byte(), call.end_byte(), new_name.clone());
    }
    let simple = made.rsplit(['.', '$']).next().unwrap_or(made);
    let message = format!("This {primitive} is only used to construct {simple} instances. It would be clearer to strongly type the field instead.");
    context.report_fixed("StronglyTypeTime", declaration, name.start_byte(), &message, &[fix]);
}
