//! MemoizeConstantVisitorStateLookups: `state.getName("...")` and the like, looked up again at every call.
use super::call_match::{instance_on_exact_class, static_on_class};
use super::consts::{constant, Const};
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::hierarchy::simple_name;
use super::locale_fix::qualify_static_import;
use super::positions::preferred;
use super::Context;
use crate::engine::source::{children, named_children};
use crate::java::types::model::Type;
use std::collections::BTreeSet;
use tree_sitter::Node;

const VISITOR_STATE: &str = "com.google.errorprone.VisitorState";
const SUPPLIER: &str = "com.google.errorprone.suppliers.Supplier";
const LOOKUPS: [&str; 3] = ["getName", "getTypeFromString", "getSymbolFromString"];

struct CallSite<'t> {
    method: String,
    value: String,
    argument: Node<'t>,
    call: Node<'t>,
}

fn find_lookups<'t>(context: &Context, node: Node<'t>, found: &mut Vec<CallSite<'t>>) {
    if node.kind() == "method_invocation" && !context.suppressed("MemoizeConstantVisitorStateLookups", node) {
        if instance_on_exact_class(context, node, VISITOR_STATE, &LOOKUPS) && matches_string_parameter(context, node) {
            let argument = named_children(node.child_by_field_name("arguments").unwrap_or(node)).into_iter().find(|part| !part.kind().ends_with("comment"));
            if let (Some(argument), Some(object), Some(name)) = (argument, node.child_by_field_name("object"), node.child_by_field_name("name")) {
                if let (Some(Const::Str(value)), true) = (constant(context, argument), object.id() == object.id()) {
                    found.push(CallSite { method: context.text(name).to_string(), value, argument, call: node });
                }
            }
        } else if static_on_class(context, node, VISITOR_STATE, &["memoize"]) {
            return;
        }
    }
    for part in children(node) {
        if part.is_named() && !context.suppressed("MemoizeConstantVisitorStateLookups", part) {
            find_lookups(context, part, found);
        }
    }
}

fn matches_string_parameter(context: &Context, call: Node) -> bool {
    context.resolver.resolve_call(call).is_some_and(|resolved| resolved.method.parameters.iter().map(|kind| kind.name()).eq(["java.lang.String".to_string()]))
}

fn constant_prefix(value: &str) -> String {
    value.chars().map(|character| if character.is_ascii_alphanumeric() || character == '_' { character.to_ascii_uppercase() } else { '_' }).collect()
}

fn utf16_prefix(value: &str) -> String {
    let mut result = String::new();
    for unit in value.encode_utf16() {
        match char::from_u32(u32::from(unit)) {
            Some(character) if character.is_ascii_alphanumeric() || character == '_' => result.push(character.to_ascii_uppercase()),
            _ => result.push('_'),
        }
    }
    result
}

fn return_type_name(context: &Context, call: Node) -> Option<(String, String)> {
    match context.resolver.resolve_call(call)?.method.returns {
        Type::Class(name, _) => Some((simple_name(&name).to_string(), name)),
        _ => None,
    }
}

fn fix_class(context: &Context, class: Node, lookups: &[CallSite]) {
    let mut groups: Vec<(&str, Vec<(&str, Vec<&CallSite>)>)> = Vec::new();
    for site in lookups {
        let group = match groups.iter().position(|(value, _)| *value == site.value) {
            Some(at) => at,
            None => {
                groups.push((&site.value, Vec::new()));
                groups.len() - 1
            }
        };
        let methods = &mut groups[group].1;
        match methods.iter().position(|(method, _)| *method == site.method) {
            Some(at) => methods[at].1.push(site),
            None => methods.push((&site.method, vec![site])),
        }
    }
    let mut fix = Fix::new();
    let mut members: BTreeSet<String> = BTreeSet::new();
    for (value, methods) in &groups {
        let several = methods.len() > 1;
        for (method, instances) in methods {
            let prototype = instances.iter().find(|site| site.argument.kind() != "string_literal").copied().unwrap_or(instances[0]);
            let Some((simple, qualified)) = return_type_name(context, prototype.call) else { return };
            let prefix = utf16_prefix(value);
            let name = if several { format!("{prefix}_{}", constant_prefix(&simple)) } else { prefix };
            let argument_text = context.text(prototype.argument);
            let right = if *method == "getTypeFromString" {
                format!("{}({argument_text})", qualify_static_import(context, class, "com.google.errorprone.suppliers.Suppliers.typeFromString", &mut fix))
            } else {
                format!("{}.memoize(state -> state.{method}({argument_text}))", qualify_type(context, class, VISITOR_STATE, &mut fix))
            };
            let supplier = qualify_type(context, class, SUPPLIER, &mut fix);
            let held = qualify_type(context, class, &qualified, &mut fix);
            members.insert(format!("private static final {supplier}<{held}> {name} = {right};"));
            for instance in instances {
                let Some(receiver) = instance.call.child_by_field_name("object") else { continue };
                fix = fix.and(instance.call.start_byte(), instance.call.end_byte(), format!("{name}.get({})", context.text(receiver)));
            }
        }
    }
    let mut inserted = String::new();
    for member in &members {
        inserted.push_str("\n\n");
        inserted.push_str(member);
    }
    inserted.push('\n');
    fix = fix.insert(class.end_byte() - 1, inserted);
    let Some(first) = lookups.iter().min_by_key(|site| site.call.start_byte()) else { return };
    context.report_always_fixed(
        "MemoizeConstantVisitorStateLookups",
        preferred(context, first.call),
        "Anytime you need to look up a constant value from VisitorState, improve performance by creating a cache for it with VisitorState.memoize",
        &[fix],
    );
}

pub fn memoize_constant_visitor_state_lookups(context: &Context, root: Node) {
    let mut lookups = Vec::new();
    find_lookups(context, root, &mut lookups);
    if lookups.is_empty() {
        return;
    }
    for class in children(root) {
        if matches!(class.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration") {
            fix_class(context, class, &lookups);
        }
    }
}
