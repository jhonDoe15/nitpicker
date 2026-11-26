//! ClassInitializationDeadlock: a static initializer that uses a subclass of its own class.
use super::parts::preferred;
use super::qualify::qualify;
use super::Context;
use crate::engine::source::{children, named_children};
use crate::java::helpers::{declarators, has_modifier};
use crate::java::types::model::flag;
use tree_sitter::Node;

fn is_inner_non_static(context: &Context, name: &str) -> bool {
    let index = context.resolver.index;
    let (Some(info), Some((outer, _))) = (index.get(name), name.rsplit_once('.')) else { return false };
    let Some(outer_info) = index.get(outer) else { return false };
    !(info.flags & flag::STATIC != 0 || info.is_interface || info.enum_constants.is_some() || info.flags & (flag::RECORD | flag::ANNOTATION) != 0 || outer_info.is_interface)
}

fn effectively_private(context: &Context, name: &str) -> bool {
    let index = context.resolver.index;
    let mut current = name.to_string();
    loop {
        let last = current.rsplit('.').next().unwrap_or(&current);
        if last.starts_with(|character: char| character.is_ascii_digit()) {
            return true;
        }
        if index.get(&current).is_some_and(|info| info.flags & flag::PRIVATE != 0) {
            return true;
        }
        match current.rsplit_once('.') {
            Some((outer, _)) if index.has(outer) => current = outer.to_string(),
            _ => return false,
        }
    }
}

fn non_private_instantiator(context: &Context, name: &str) -> bool {
    if effectively_private(context, name) {
        return false;
    }
    let Some(info) = context.resolver.index.get(name) else { return false };
    let enumeration = info.enum_constants.is_some();
    let constructor = !enumeration && info.methods.iter().any(|method| method.name == "<init>" && !method.is_private && method.flags & flag::PRIVATE == 0);
    let factory = info.methods.iter().any(|method| method.is_static && !method.is_private && method.flags & flag::PRIVATE == 0 && method.name != "<clinit>")
        || info.fields.iter().any(|field| field.flags & flag::STATIC != 0 && !field.is_private);
    if !constructor && !factory {
        return false;
    }
    let simple = name.rsplit('.').next().unwrap_or(name);
    !simple.trim_start_matches('$').starts_with("AutoValue_")
}

fn direct_supers(context: &Context, name: &str) -> Vec<String> {
    let Some(info) = context.resolver.index.get(name) else { return Vec::new() };
    let mut list: Vec<String> = info.superclass.iter().cloned().collect();
    if info.superclass.is_none() && name != "java.lang.Object" {
        list.push("java.lang.Object".to_string());
    }
    list.extend(info.interfaces.iter().cloned());
    list
}

fn closure_edges(context: &Context, current: &str, stop: &str, edges: &mut Vec<(String, String)>, seen: &mut Vec<String>) {
    if current == stop {
        return;
    }
    for parent in direct_supers(context, current) {
        if !edges.iter().any(|edge| edge.0 == current && edge.1 == parent) {
            edges.push((current.to_string(), parent.clone()));
        }
        if seen.contains(&parent) {
            continue;
        }
        seen.push(parent.clone());
        closure_edges(context, &parent, stop, edges, seen);
    }
}

fn instantiators(context: &Context, from: &str, to: &str) -> Vec<String> {
    let mut edges = Vec::new();
    let mut seen = Vec::new();
    closure_edges(context, from, to, &mut edges, &mut seen);
    let mut order = Vec::new();
    let mut visited: Vec<String> = Vec::new();
    let mut stack = vec![to.to_string()];
    while let Some(current) = stack.pop() {
        if visited.contains(&current) {
            continue;
        }
        visited.push(current.clone());
        order.push(current.clone());
        let predecessors: Vec<String> = edges.iter().filter(|edge| edge.1 == current).map(|edge| edge.0.clone()).collect();
        stack.extend(predecessors.into_iter().rev());
    }
    order.into_iter().filter(|name| name != to && non_private_instantiator(context, name)).collect()
}

fn pretty(context: &Context, at: Node, name: &str) -> String {
    let info = context.resolver.index.get(name);
    let body = at.child_by_field_name("body");
    let inside = body.and_then(|body| body.named_child(0)).or(body).unwrap_or(at);
    let base = qualify(context, inside, name);
    match info {
        Some(info) if !info.type_parameters.is_empty() => {
            let names: Vec<&str> = info.type_parameters.iter().map(|(variable, _)| variable.as_str()).collect();
            format!("{base}<{}>", names.join(", "))
        }
        _ => base,
    }
}

fn handle(context: &Context, class_node: Node, own: &str, at: Node, used: &str, position: usize) {
    if used == own || !context.resolver.index.is_subtype(used, own) {
        return;
    }
    if used.starts_with(&format!("{own}.")) && is_inner_non_static(context, used) {
        return;
    }
    let found = instantiators(context, used, own);
    if found.is_empty() {
        return;
    }
    let mut message = format!(
        "Possible class initialization deadlock: {} is a subclass of the containing class {}",
        pretty(context, class_node, used),
        pretty(context, class_node, own)
    );
    if !found.iter().any(|name| name == used) {
        let names: Vec<String> = found.iter().map(|name| pretty(context, class_node, name)).collect();
        message.push_str(&format!(" (via {}, which can be initialized from outside the current file)", names.join(", ")));
    }
    context.report_fixed("ClassInitializationDeadlock", at, position, &message, &[]);
}

fn class_name_of(context: &Context, node: Node) -> Option<String> {
    let text: String = context.text(node).split_whitespace().collect();
    let found = context.resolver.class_name(node, &text)?;
    context.resolver.index.has(&found).then_some(found)
}

fn visit(context: &Context, class_node: Node, own: &str, node: Node) {
    match node.kind() {
        "class_body" | "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration" | "class_literal" => {}
        "scoped_type_identifier" | "scoped_identifier" | "field_access" => {
            let constant = node.kind() == "field_access" && super::consts::constant(context, node).is_some();
            if constant {
                return;
            }
            if let Some(found) = class_name_of(context, node) {
                let dot = children(node).into_iter().rev().find(|part| part.kind() == ".").map_or(node.start_byte(), |dot| dot.start_byte());
                handle(context, class_node, own, node, &found, dot);
            }
            if let Some(prefix) = node.child_by_field_name("object").or_else(|| node.child(0)) {
                visit(context, class_node, own, prefix);
            }
        }
        "type_identifier" | "identifier" => {
            let name = context.text(node);
            if node.kind() == "identifier" && (context.resolver.binding(node, name).is_some() || super::consts::constant(context, node).is_some()) {
                return;
            }
            if let Some(found) = class_name_of(context, node) {
                handle(context, class_node, own, node, &found, preferred(node));
            }
        }
        "method_invocation" => {
            for part in children(node) {
                if node.child_by_field_name("name").is_some_and(|name| name.id() == part.id()) {
                    continue;
                }
                visit(context, class_node, own, part);
            }
        }
        "variable_declarator" => {
            if let Some(value) = node.child_by_field_name("value") {
                visit(context, class_node, own, value);
            }
        }
        _ => {
            for part in children(node) {
                visit(context, class_node, own, part);
            }
        }
    }
}

pub fn class_initialization_deadlock(context: &Context, node: Node) {
    if !matches!(node.kind(), "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration") {
        return;
    }
    let Some(own) = context.resolver.scope.names.get(&node.id()).cloned() else { return };
    let Some(body) = node.child_by_field_name("body") else { return };
    if node.kind() == "interface_declaration" {
        let has_default = named_children(body).iter().any(|member| member.kind() == "method_declaration" && has_modifier(*member, "default"));
        if !has_default {
            return;
        }
    }
    let interface = matches!(node.kind(), "interface_declaration");
    let mut members: Vec<Node> = Vec::new();
    for member in children(body) {
        if member.kind() == "enum_body_declarations" {
            members.extend(children(member));
        } else {
            members.push(member);
        }
    }
    for member in members {
        match member.kind() {
            "field_declaration" | "constant_declaration" => {
                if !(interface || has_modifier(member, "static")) {
                    continue;
                }
                for declarator in declarators(member) {
                    if let Some(value) = declarator.child_by_field_name("value") {
                        visit(context, node, &own, value);
                    }
                }
            }
            "static_initializer" => {
                for part in children(member) {
                    visit(context, node, &own, part);
                }
            }
            "enum_constant" => {
                if let Some(arguments) = member.child_by_field_name("arguments") {
                    visit(context, node, &own, arguments);
                }
            }
            _ => {}
        }
    }
}
