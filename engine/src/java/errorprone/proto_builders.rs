//! Checks on protocol buffer builders: ProtoTruthMixedDescriptors, SetUnrecognized, RedundantSetterCall.
use super::consts::{constant, Const};
use super::fixes::Fix;
use super::lookup::field_of;
use super::owners::{is_descendant, receiver_name};
use super::parts::{arguments, preferred};
use super::Context;
use crate::java::types::model::Type;
use regex::Regex;
use std::collections::BTreeSet;
use std::sync::OnceLock;
use tree_sitter::Node;

fn method_name<'f>(context: &'f Context, call: Node) -> &'f str {
    call.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default()
}

/// The class that owns what an expression names: a field, or the method a call resolves to.
fn owner_class(context: &Context, expression: Node) -> Option<String> {
    match expression.kind() {
        "method_invocation" => context.resolver.resolve_call(expression).map(|resolved| resolved.declaring),
        _ => field_of(context, expression).map(|(declaring, _)| declaring.name.clone()),
    }
}

fn instance_below(context: &Context, call: Node, classes: &[&str], names: &[&str]) -> bool {
    call.kind() == "method_invocation"
        && names.contains(&method_name(context, call))
        && receiver_name(context, call, false).is_some_and(|owner| is_descendant(context, &owner, classes))
}

fn is_assert_that(context: &Context, call: Node) -> bool {
    call.kind() == "method_invocation"
        && method_name(context, call) == "assertThat"
        && receiver_name(context, call, true).is_some_and(|owner| owner == "com.google.common.truth.extensions.proto.ProtoTruth")
}

fn is_ignoring(context: &Context, call: Node) -> bool {
    instance_below(
        context,
        call,
        &["com.google.common.truth.extensions.proto.ProtoFluentAssertion", "com.google.common.truth.extensions.proto.ProtoSubject"],
        &["ignoringFields"],
    )
}

pub fn proto_truth_mixed_descriptors(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || method_name(context, node) != "ignoringFields" || !is_ignoring(context, node) {
        return;
    }
    let index = context.resolver.index;
    let types: BTreeSet<String> = arguments(node)
        .into_iter()
        .filter_map(|argument| owner_class(context, argument))
        .filter(|owner| index.is_subtype(owner, "com.google.protobuf.Message"))
        .collect();
    let message = "The arguments passed to `ignoringFields` are inconsistent with the proto which is the subject of the assertion.";
    if types.len() > 1 {
        context.report_fixed("ProtoTruthMixedDescriptors", node, preferred(node), message, &[]);
        return;
    }
    let Some(proto) = types.into_iter().next() else { return };
    let mut current = node.child_by_field_name("object");
    while let Some(receiver) = current {
        if is_assert_that(context, receiver) {
            if mismatched(context, receiver, &proto) {
                context.report_fixed("ProtoTruthMixedDescriptors", node, preferred(node), message, &[]);
            }
            return;
        }
        current = match receiver.kind() {
            "method_invocation" | "field_access" => receiver.child_by_field_name("object"),
            "method_reference" => receiver.named_child(0),
            _ => None,
        };
    }
}

fn mismatched(context: &Context, assertion: Node, proto: &str) -> bool {
    let args = arguments(assertion);
    let [argument] = args.as_slice() else { return false };
    let Some(mut subject) = context.resolver.type_of(*argument) else { return false };
    let index = context.resolver.index;
    if matches!(&subject, Type::Class(name, _) if index.is_subtype(name, "java.lang.Iterable")) {
        let Some(given) = index.arguments_as(&subject, "java.lang.Iterable") else { return false };
        match given.as_slice() {
            [] => return false,
            [only] => subject = only.clone(),
            _ => return false,
        }
    }
    matches!(&subject, Type::Class(name, _) if name != proto && index.is_subtype(name, "com.google.protobuf.GeneratedMessage"))
}

pub fn set_unrecognized(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    let name = method_name(context, node);
    if !(name.starts_with("add") || name.starts_with("set")) || !instance_below(context, node, &["com.google.protobuf.MessageLite.Builder"], &[name]) {
        return;
    }
    let args = arguments(node);
    let [argument] = args.as_slice() else { return };
    let Some((owner, field)) = field_of(context, *argument) else { return };
    let index = context.resolver.index;
    if field.name != "UNRECOGNIZED" || !index.is_subtype(&owner.name, "com.google.protobuf.Internal.EnumLite") {
        return;
    }
    let has_value = owner.fields.iter().any(|member| member.name == "UNRECOGNIZED_VALUE") || owner.methods.iter().any(|member| member.name == "UNRECOGNIZED_VALUE");
    if !has_value {
        let message = "Setting a proto field to an UNRECOGNIZED value will result in an exception at runtime when building.";
        context.report_fixed("SetUnrecognized", node, preferred(node), message, &[]);
    }
}

const BUILDERS: [&str; 2] = ["com.google.protobuf.GeneratedMessage.Builder", "com.google.protobuf.GeneratedMessageLite.Builder"];

fn setter_name() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();
    PATTERN.get_or_init(|| Regex::new(r"^(set|add|clear|put).+$").unwrap())
}

fn in_auto_value_builder(context: &Context, class: &str) -> bool {
    context.resolver.index.get(class).is_some_and(|info| info.class_annotations.iter().any(|name| name == "com.google.auto.value.AutoValue.Builder"))
}

/// A setter of a protocol buffer builder, or an abstract method of an `@AutoValue.Builder` that returns the builder.
fn fluent_setter(context: &Context, call: Node) -> bool {
    if call.kind() != "method_invocation" {
        return false;
    }
    if instance_below(context, call, &BUILDERS, &[method_name(context, call)]) && setter_name().is_match(method_name(context, call)) {
        return true;
    }
    let Some(resolved) = context.resolver.resolve_call(call) else { return false };
    resolved.method.is_abstract && in_auto_value_builder(context, &resolved.declaring) && resolved.method.returns.erased().name() == resolved.declaring
}

fn terminal(context: &Context, call: Node) -> bool {
    if !fluent_setter(context, call) {
        return false;
    }
    let Some(up) = crate::engine::source::parent(call) else { return true };
    !(up.kind() == "method_invocation" && up.child_by_field_name("object").is_some_and(|object| object.id() == call.id()) && fluent_setter(context, up))
}

#[derive(PartialEq, Eq, PartialOrd, Ord, Clone)]
enum Field {
    Single(String),
    Repeated(String, i32),
    Map(String, String, String),
    OneOf(String),
}

struct Setter<'t> {
    call: Node<'t>,
    name: String,
    argument: Node<'t>,
}

/// What tells two constant keys apart, and how the key prints.
fn key_text(value: &Const) -> Option<(String, String)> {
    Some(match value {
        Const::Int(number) => ("int".into(), number.to_string()),
        Const::Long(number) => ("long".into(), number.to_string()),
        Const::Bool(flag) => ("boolean".into(), flag.to_string()),
        Const::Str(text) => ("String".into(), text.clone()),
        Const::Char(unit) => ("char".into(), char::from_u32(u32::from(*unit))?.to_string()),
        Const::Float(_) | Const::Double(_) => return None,
    })
}

fn proto_fields(context: &Context, owner: &str) -> BTreeSet<String> {
    let Some(info) = context.resolver.index.get(owner) else { return BTreeSet::new() };
    info.fields
        .iter()
        .filter_map(|field| field.name.strip_suffix("_FIELD_NUMBER"))
        .map(|name| name.replace('_', "").to_ascii_uppercase())
        .collect()
}

fn upper_camel(constant: &str) -> String {
    constant
        .split('_')
        .map(|word| {
            let mut letters = word.chars();
            letters.next().map(|first| first.to_ascii_uppercase().to_string() + &letters.as_str().to_ascii_lowercase()).unwrap_or_default()
        })
        .collect()
}

fn one_of_setters(context: &Context, owner: &str) -> Vec<(String, String)> {
    let index = context.resolver.index;
    let mut found = Vec::new();
    for nested in index.nested(owner) {
        if !index.is_subtype(&nested, "com.google.protobuf.AbstractMessageLite.InternalOneOfEnum") {
            continue;
        }
        let simple = nested.rsplit('.').next().unwrap_or_default();
        let one_of = simple.strip_suffix("Case").unwrap_or(simple).to_string();
        let Some(info) = index.get(&nested) else { continue };
        for field in info.fields.iter().filter(|field| field.flags & crate::java::types::model::flag::ENUM != 0 && field.name != "ONEOF_NOT_SET") {
            found.push((format!("set{}", upper_camel(&field.name)), one_of.clone()));
        }
    }
    found
}

fn times(count: usize) -> String {
    if count == 2 { "twice".to_string() } else { format!("{count} times") }
}

pub fn redundant_setter_call(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || !terminal(context, node) {
        return;
    }
    let Some(resolved) = context.resolver.resolve_call(node) else { return };
    let index = context.resolver.index;
    let returned = resolved.method.returns.erased().name();
    let owner = returned.rsplit_once('.').map(|(outer, _)| outer.to_string()).filter(|outer| index.has(outer));
    let is_proto = owner.as_ref().is_some_and(|outer| index.is_subtype(outer, "com.google.protobuf.MessageLite"));
    let one_ofs = match (&owner, is_proto) {
        (Some(outer), true) => one_of_setters(context, outer),
        _ => Vec::new(),
    };
    let field_names = match (&owner, is_proto) {
        (Some(outer), true) => proto_fields(context, outer),
        _ => BTreeSet::new(),
    };
    let mut setters: Vec<(Field, Setter)> = Vec::new();
    let mut current = Some(node);
    while let Some(call) = current.filter(|call| fluent_setter(context, *call)) {
        let Some(each) = context.resolver.resolve_call(call) else { break };
        if each.method.returns.erased().name() != returned {
            break;
        }
        let mut name = each.method.name.clone();
        if name.ends_with("Builder") {
            break;
        }
        if is_proto && name.starts_with("set") {
            let without = name.replacen("set", "", 1);
            if !field_names.contains(&without.to_ascii_uppercase()) {
                if let Some(rest) = name.strip_suffix("Value") {
                    name = rest.to_string();
                }
                if let Some(rest) = name.strip_suffix("Bytes") {
                    name = rest.to_string();
                }
            }
        }
        let args = arguments(call);
        let auto = in_auto_value_builder(context, &each.declaring);
        let mut matches: Vec<(Field, Node)> = Vec::new();
        if (name.starts_with("set") || auto) && args.len() == 1 {
            matches.push((Field::Single(name.clone()), args[0]));
        }
        if name.starts_with("set") && args.len() == 2 {
            if let Some(Const::Int(position)) = constant(context, args[0]) {
                matches.push((Field::Repeated(name.clone(), position), args[1]));
            }
        }
        if name.starts_with("put") && args.len() == 2 {
            if let Some(key) = constant(context, args[0]) {
                let Some((kind, text)) = key_text(&key) else { return };
                matches.push((Field::Map(name.clone(), kind, text), args[1]));
            }
        }
        for (field, argument) in matches {
            let one_of = one_ofs.iter().find(|(setter, _)| *setter == name).map(|(_, one_of)| one_of.clone());
            setters.push((field, Setter { call, name: each.method.name.clone(), argument }));
            if let Some(one_of) = one_of {
                setters.push((Field::OneOf(one_of), Setter { call, name: each.method.name.clone(), argument }));
            }
        }
        current = call.child_by_field_name("object");
    }
    let mut fields: Vec<Field> = setters.iter().map(|(field, _)| field.clone()).collect();
    fields.sort();
    fields.dedup();
    for field in fields {
        let locations: Vec<&Setter> = setters.iter().filter(|(each, _)| *each == field).map(|(_, setter)| setter).collect();
        if locations.len() > 1 {
            describe(context, node, &field, &locations);
        }
    }
}

fn describe(context: &Context, node: Node, field: &Field, locations: &[&Setter]) {
    let removable = !matches!(field, Field::OneOf(_));
    let sources: BTreeSet<&str> = locations.iter().map(|setter| context.text(setter.argument)).collect();
    let mut fix = Fix::new();
    if removable && sources.len() == 1 {
        for setter in &locations[1..] {
            if let Some(object) = setter.call.child_by_field_name("object") {
                fix = fix.and(object.end_byte(), setter.call.end_byte(), "");
            }
        }
    }
    let shown = match field {
        Field::Single(name) => format!("{name}(..)"),
        Field::Repeated(name, position) => format!("{name}({position}, ..)"),
        Field::Map(name, _, key) => format!("{name}({key}, ..)"),
        Field::OneOf(name) => {
            let names: BTreeSet<&str> = locations.iter().map(|setter| setter.name.as_str()).collect();
            format!("The oneof `{name}` (set via {})", names.into_iter().collect::<Vec<_>>().join(", "))
        }
    };
    let same = if !removable { "" } else if sources.len() == 1 { " with the same argument" } else { " with different arguments" };
    let message = format!("{shown} was called {}{same}. Setting the same field multiple times is redundant, and could mask a bug.", times(locations.len()));
    let first = locations[0].argument;
    context.report_fixed("RedundantSetterCall", node, preferred(first), &message, &[fix]);
}
