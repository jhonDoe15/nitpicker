//! Checks on method references: ones that only repeat a functional interface value, and ones that are ambiguous.
use super::Context;
use super::fixes::Fix;
use crate::engine::source::{children, named_children};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Receiver;
use crate::java::types::model::Type;
use tree_sitter::Node;

const UNNECESSARY: &str = "This method reference is unnecessary, and can be replaced with the variable itself.";

/// Methods known to delegate to the abstract method of a functional interface: method, receiver class, target class.
const KNOWN_ALIASES: &[(&str, &str, &str)] = &[
    ("apply", "com.google.common.base.Predicate", "java.util.function.Predicate"),
    ("convert", "com.google.common.base.Converter", "com.google.common.base.Function"),
    ("contains", "com.google.common.collect.Range", "com.google.common.base.Predicate"),
];

pub fn unnecessary_method_reference(context: &Context, node: Node) {
    if node.kind() != "method_reference" {
        return;
    }
    let parts = children(node);
    let (Some(receiver), Some(name)) = (parts.first().copied(), parts.last().copied()) else { return };
    if context.text(name) == "new" || receiver.kind() == "super" || receiver.kind().ends_with("type") && receiver.kind() != "type_identifier" {
        return;
    }
    let Some(Type::Class(target, target_arguments)) = context.resolver.expected(node) else { return };
    let Some(target_info) = context.resolver.index.get(&target) else { return };
    let receiver_type = match context.resolver.receiver(receiver) {
        Some(Receiver::Value(Type::Class(owner, arguments))) => {
            if owner == target && invariant_clash(&arguments, &target_arguments) {
                return;
            }
            owner
        }
        Some(Receiver::Static(owner)) => owner,
        _ => return,
    };
    if !context.resolver.index.is_subtype(&receiver_type, &target) {
        return;
    }
    let Some((declaring, functional)) = context.resolver.index.functional_method(&target) else { return };
    let map = context.resolver.index.member_map(&Type::class(&target), &declaring.name);
    let taken: Vec<Type> = functional.generic_parameters.iter().map(|kind| kind.substitute(&map)).collect();
    let referenced = context.resolver.reference_method(node, &taken);
    let mut direct = false;
    if let Some((_, owner, method, _)) = referenced {
        let same = |other: &crate::java::types::model::Method| other.name == method.name && other.parameters == method.parameters;
        let abstract_here = target_info.methods.iter().any(|member| member.is_abstract);
        direct = if owner.name == target {
            target_info.methods.iter().any(|member| member.is_abstract && same(member))
        } else {
            !method.is_static && abstract_here && target_info.methods.iter().any(|member| !member.is_static && same(member))
        };
    }
    let alias = || {
        let called = context.text(name);
        KNOWN_ALIASES.iter().any(|(method, owner, wanted)| *method == called && context.resolver.index.is_subtype(&receiver_type, owner) && context.resolver.index.is_subtype(wanted, &target))
    };
    if !direct && !alias() {
        return;
    }
    let fix = Fix::replace(receiver.end_byte(), node.end_byte(), "");
    context.report_fixed("UnnecessaryMethodReference", node, node.start_byte(), UNNECESSARY, &[fix]);
}

/// Type arguments of the same class with different arguments of their own are not related: generics are invariant.
fn invariant_clash(receiver: &[Type], target: &[Type]) -> bool {
    receiver.len() == target.len()
        && receiver.iter().zip(target).any(|pair| match pair {
            (Type::Class(a, left), Type::Class(b, right)) => a == b && !left.is_empty() && !right.is_empty() && left != right,
            _ => false,
        })
}

fn pretty(context: &Context, node: Node) -> String {
    match node.kind() {
        "scoped_type_identifier" => context.text(node).rsplit('.').next().unwrap_or_default().to_string(),
        "generic_type" => {
            let parts = named_children(node);
            let base = parts.first().map(|base| pretty(context, *base)).unwrap_or_default();
            let given = parts.iter().find(|part| part.kind() == "type_arguments").map(|list| named_children(*list)).unwrap_or_default();
            let given: Vec<String> = given.into_iter().filter(|part| !part.kind().ends_with("comment")).map(|part| pretty(context, part)).collect();
            if given.is_empty() { base } else { format!("{base}<{}>", given.join(", ")) }
        }
        "array_type" => {
            let element = node.child_by_field_name("element").map(|element| pretty(context, element)).unwrap_or_default();
            let count = node.child_by_field_name("dimensions").map_or(1, |dimensions| context.text(dimensions).matches('[').count());
            format!("{element}{}", "[]".repeat(count))
        }
        "wildcard" => {
            let bound = named_children(node).into_iter().filter(|part| !part.kind().ends_with("comment") && !part.kind().ends_with("annotation")).last();
            match bound {
                Some(bound) => {
                    let word = if children(node).iter().any(|part| part.kind() == "super") { "super" } else { "extends" };
                    format!("? {word} {}", pretty(context, bound))
                }
                None => "?".to_string(),
            }
        }
        _ => context.text(node).to_string(),
    }
}

struct Declared<'t> {
    node: Node<'t>,
    name: String,
    key: String,
    private: bool,
    shown: String,
}

fn declared<'t>(context: &Context, member: Node<'t>, owner: &str) -> Option<Declared<'t>> {
    if member.kind() != "method_declaration" {
        return None;
    }
    let name = context.text(member.child_by_field_name("name")?).to_string();
    let list = member.child_by_field_name("parameters");
    let (erased, _, _) = context.resolver.parameters(list);
    let mut key = format!("{name}(");
    if !has_modifier(member, "static") {
        key.push_str(owner);
        key.push(';');
    }
    for kind in &erased {
        key.push_str(&kind.name());
        key.push(';');
    }
    let mut shown = Vec::new();
    for parameter in list.map(children).unwrap_or_default() {
        match parameter.kind() {
            "formal_parameter" => shown.push(pretty(context, parameter.child_by_field_name("type")?)),
            "spread_parameter" => {
                let written = named_children(parameter).into_iter().find(|part| !part.kind().ends_with("comment") && part.kind() != "modifiers" && part.kind() != "variable_declarator")?;
                shown.push(format!("{}[]", pretty(context, written)));
            }
            _ => {}
        }
    }
    Some(Declared { node: member, key, private: has_modifier(member, "private"), shown: format!("{name}({})", shown.join(", ")), name })
}

pub fn ambiguous_method_reference(context: &Context, node: Node) {
    let body = match node.kind() {
        "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" => node.child_by_field_name("body"),
        "class_body" if node.parent().is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant")) => Some(node),
        _ => None,
    };
    let Some(body) = body else { return };
    let owner = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, node);
    let Some(owner) = owner else { return };
    let mut methods: Vec<Declared> = Vec::new();
    let mut members = named_children(body);
    if let Some(extra) = members.iter().find(|part| part.kind() == "enum_body_declarations").copied() {
        members.extend(named_children(extra));
    }
    for member in members {
        if let Some(method) = declared(context, member, &owner) {
            methods.push(method);
        }
    }
    let mut taken: Vec<String> = Vec::new();
    for at in 0..methods.len() {
        let method = &methods[at];
        if taken.contains(&method.key) || context.suppressed("AmbiguousMethodReference", method.node) {
            continue;
        }
        let group: Vec<&Declared> = methods.iter().filter(|other| other.key == method.key).collect();
        if group.len() < 2 {
            continue;
        }
        taken.push(method.key.clone());
        if group.iter().filter(|other| !other.private).count() < 2 {
            continue;
        }
        let clash: Vec<&str> = group.iter().filter(|other| other.node != method.node && other.shown != method.shown).map(|other| other.shown.as_str()).collect();
        if clash.is_empty() {
            continue;
        }
        let message = format!("This method's reference is ambiguous, its name and functional interface type are the same as: {}", clash.join(", "));
        let Some(name) = method.node.child_by_field_name("name") else { continue };
        context.report_fixed("AmbiguousMethodReference", method.node, name.start_byte(), &message, &[]);
    }
}
