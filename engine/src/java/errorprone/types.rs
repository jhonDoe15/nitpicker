//! Checks that ask what a call, a class or a field is, and answer from the class hierarchy.
use super::fixes::Fix;
use super::hierarchy::{declared_method, super_methods};
use super::shape::{arguments, class_keyword, parts, preferred, suppressed_any};
use super::Context;
use crate::engine::source::{children, parent, walk};
use crate::java::types::model::{Type, flag};
use crate::java::types::scope::type_parameter;
use tree_sitter::Node;

fn class_body<'t>(node: Node<'t>) -> Option<Node<'t>> {
    match node.kind() {
        "class_declaration" | "record_declaration" | "enum_declaration" | "enum_constant" => node.child_by_field_name("body"),
        "object_creation_expression" => children(node).into_iter().find(|part| part.kind() == "class_body"),
        _ => None,
    }
}

fn fields_of<'t>(body: Node<'t>) -> Vec<Node<'t>> {
    let mut found = Vec::new();
    for member in children(body) {
        match member.kind() {
            "field_declaration" => found.push(member),
            "enum_body_declarations" => found.extend(children(member).into_iter().filter(|part| part.kind() == "field_declaration")),
            _ => {}
        }
    }
    found
}

const HIDING: [&str; 3] = ["HidingField", "hiding", "OvershadowingSubclassFields"];

pub fn hiding_field(context: &Context, node: Node) {
    let Some(body) = class_body(node) else { return };
    let index = context.resolver.index;
    let Some(mut current) = context.resolver.scope.names.get(&node.id()).and_then(|name| index.get(name)) else { return };
    let package = current.package.clone();
    let mut own: Vec<(Node, Node)> = Vec::new();
    for declaration in fields_of(body) {
        if crate::java::helpers::has_modifier(declaration, "static") || suppressed_any(context, &HIDING, declaration) {
            continue;
        }
        for declarator in children(declaration).into_iter().filter(|part| part.kind() == "variable_declarator") {
            own.push((declaration, declarator));
        }
    }
    if own.is_empty() {
        return;
    }
    let mut seen = 0;
    while let Some(parent_info) = current.superclass.as_deref().and_then(|name| index.get(name)) {
        seen += 1;
        if seen > 64 {
            return;
        }
        let mut remaining = Vec::new();
        for (declaration, declarator) in own {
            let name = declarator.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            let hidden = parent_info.fields.iter().find(|field| field.name == name && !field.is_private && field.flags & flag::STATIC == 0);
            let hidden = hidden.filter(|field| field.flags & (flag::PUBLIC | flag::PROTECTED) != 0 || parent_info.package == package || parent_info.is_interface);
            if hidden.is_none() {
                remaining.push((declaration, declarator));
                continue;
            }
            let simple = parent_info.name.rsplit('.').next().unwrap_or(&parent_info.name);
            let message = format!("Hiding fields of superclasses may cause confusion and errors. This field is hiding {simple}.{name}.");
            let at = declarator.child_by_field_name("name").map_or(declarator.start_byte(), |name| name.start_byte());
            context.report_fixed("HidingField", declarator, at, &message, &[]);
        }
        own = remaining;
        current = parent_info;
    }
}

const JAVA_LANG: &str = "java.lang.";

fn clashes(context: &Context, name: &str, own: &str) -> Option<String> {
    if name == "Compiler" || name == "Module" {
        return None;
    }
    let java_lang = format!("{JAVA_LANG}{name}");
    let info = context.resolver.index.get(&java_lang)?;
    (info.flags & flag::PUBLIC != 0 && own != java_lang).then_some(java_lang)
}

fn local_class(node: Node) -> bool {
    parent(node).is_some_and(|holder| !matches!(holder.kind(), "program" | "class_body" | "interface_body" | "enum_body" | "enum_body_declarations" | "annotation_type_body"))
}

const COMMON: [&str; 2] = ["AvoidCommonTypeNames", "JavaLangClash"];

pub fn avoid_common_type_names(context: &Context, node: Node) {
    let (name, at, own) = match node.kind() {
        "class_declaration" | "interface_declaration" | "enum_declaration" | "record_declaration" | "annotation_type_declaration" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            let qualified = context.resolver.scope.names.get(&node.id()).cloned().unwrap_or_default();
            let shown = if local_class(node) { context.text(name).to_string() } else { qualified };
            (name, class_keyword(node), shown)
        }
        "type_parameter" => {
            let Some(name) = children(node).into_iter().find(|part| part.kind() == "type_identifier") else { return };
            (name, node.start_byte(), context.text(name).to_string())
        }
        _ => return,
    };
    let text = context.text(name);
    let Some(clash) = clashes(context, text, &own) else { return };
    if suppressed_any(context, &COMMON, node) {
        return;
    }
    context.report_fixed("AvoidCommonTypeNames", node, at, &format!("{own} clashes with {clash}"), &[]);
}

const CONSTRAIN: &str = ", Integer.MIN_VALUE, Integer.MAX_VALUE)";

fn long_like(context: &Context, node: Node) -> bool {
    matches!(context.resolver.type_of(node).map(Type::unboxed_or_same), Some(Type::Primitive("long")))
}

fn long_to_int<'t>(context: &Context, arg: Node<'t>) -> Option<Node<'t>> {
    match arg.kind() {
        "cast_expression" => {
            let kind = arg.child_by_field_name("type")?;
            let value = arg.child_by_field_name("value")?;
            (context.text(kind) == "int" && context.resolver.type_of(value) == Some(Type::Primitive("long"))).then_some(value)
        }
        "method_invocation" => {
            let name = context.text(arg.child_by_field_name("name")?);
            let static_call = match name {
                "checkedCast" | "saturatedCast" => context.resolver.matches_sig(arg, "com.google.common.primitives.Ints#checkedCast(_)") || context.resolver.matches_sig(arg, "com.google.common.primitives.Ints#saturatedCast(_)"),
                "toIntExact" => context.resolver.matches_sig(arg, "java.lang.Math#toIntExact(_)"),
                _ => false,
            };
            if static_call {
                let inner = arguments(arg);
                return (inner.len() == 1 && inner.iter().all(|part| long_like(context, *part))).then(|| inner[0]);
            }
            if name != "intValue" || !context.resolver.matches_sig(arg, "java.lang.Long#intValue()") {
                return None;
            }
            let object = arg.child_by_field_name("object")?;
            matches!(context.resolver.type_of(object), Some(Type::Class(class, _)) if class == "java.lang.Long").then_some(object)
        }
        _ => None,
    }
}

pub fn unnecessary_long_to_int(context: &Context, node: Node) {
    if node.kind() != "method_invocation" {
        return;
    }
    for arg in arguments(node) {
        if !matches!(arg.kind(), "cast_expression" | "method_invocation") || context.resolver.type_of(arg) != Some(Type::Primitive("int")) {
            continue;
        }
        if context.resolver.expected(arg) != Some(Type::Primitive("long")) {
            continue;
        }
        let Some(inner) = long_to_int(context, arg) else { continue };
        let text = context.text(inner);
        let fixes = [
            Fix::replace(arg.start_byte(), arg.end_byte(), text),
            Fix::replace(arg.start_byte(), arg.end_byte(), format!("Longs.constrainToRange({text}{CONSTRAIN}")).with_imports(),
        ];
        let message = "Converting a long or Long to an int to pass as a long parameter is usually not necessary. If this conversion is intentional, consider `Longs.constrainToRange()` instead.";
        context.report_fixed("UnnecessaryLongToIntConversion", node, preferred(node), message, &fixes);
        return;
    }
}

pub fn lite_byte_string_utf8(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "toStringUtf8") {
        return;
    }
    let Some(object) = node.child_by_field_name("object").filter(|object| object.kind() == "method_invocation") else { return };
    if object.child_by_field_name("name").is_none_or(|name| context.text(name) != "toByteString") {
        return;
    }
    if context.resolver.matches_sig(node, "com.google.protobuf.ByteString#toStringUtf8()") && context.resolver.matches_sig(object, "com.google.protobuf.MessageLite#toByteString()") {
        let message = "This pattern will silently corrupt certain byte sequences from the serialized protocol message. Use ByteString or byte[] directly";
        context.report_fixed("LiteByteStringUtf8", node, preferred(node), message, &[]);
    }
}

fn is_url(kind: Option<&Type>) -> bool {
    matches!(kind, Some(Type::Class(name, _)) if name == "java.net.URL")
}

fn container_of_urls(context: &Context, node: Node) -> bool {
    let Some(kind) = context.resolver.type_of(node) else { return false };
    let index = context.resolver.index;
    for (container, at) in [("java.util.Set", 0), ("java.util.Map", 0), ("com.google.common.collect.BiMap", 1)] {
        if let Type::Class(name, _) = &kind {
            if index.is_subtype(name, container) {
                if let Some(arguments) = index.arguments_as(&kind, container) {
                    if is_url(arguments.get(at)) {
                        return true;
                    }
                }
            }
        }
    }
    false
}

const URLS: &str = "Avoid hash-based containers of java.net.URL--the containers rely on equals() and hashCode(), which cause java.net.URL to make blocking internet connections.";

pub fn url_equals_hash_code(context: &Context, node: Node) {
    let selected = match node.kind() {
        "object_creation_expression" => true,
        "method_invocation" => {
            let name = node.child_by_field_name("name").map(|name| context.text(name)).unwrap_or_default();
            let builder = name == "build"
                && (context.resolver.matches_sig(node, "com.google.common.collect.ImmutableSet.Builder#build()") || context.resolver.matches_sig(node, "com.google.common.collect.ImmutableMap.Builder#build()"));
            builder || context.resolver.resolve_call(node).is_some_and(|call| {
                call.method.is_static && ["com.google.common.collect.ImmutableSet", "com.google.common.collect.ImmutableMap", "com.google.common.collect.HashBiMap"].contains(&call.declaring.as_str())
            })
        }
        _ => false,
    };
    if selected && container_of_urls(context, node) {
        context.report_fixed("URLEqualsHashCode", node, preferred(node), URLS, &[]);
    }
}

fn can_be_overridden(context: &Context, method: Node) -> bool {
    let has = |word: &str| crate::java::helpers::has_modifier(method, word);
    let in_interface = parent(method).is_some_and(|body| body.kind() == "interface_body");
    if has("abstract") || (in_interface && method.child_by_field_name("body").is_none() && !has("static") && !has("default") && !has("private")) {
        return true;
    }
    if has("static") || has("private") || has("final") || method.kind() == "constructor_declaration" {
        return false;
    }
    let body = parent(method).and_then(|body| if body.kind() == "enum_body_declarations" { parent(body) } else { Some(body) });
    let Some(owner) = body.and_then(parent) else { return false };
    match owner.kind() {
        "object_creation_expression" | "enum_constant" => false,
        "record_declaration" => false,
        "class_declaration" => !crate::java::helpers::has_modifier(owner, "final"),
        "enum_declaration" => owner.child_by_field_name("body").is_some_and(|body| children(body).into_iter().any(|part| part.kind() == "enum_constant" && part.child_by_field_name("body").is_some())),
        _ => true,
    }
}

fn used_elsewhere(context: &Context, scope: Node, parameter: Node, name: Node) -> bool {
    let mut used = false;
    let text = context.text(name);
    walk(scope, |inner| {
        if used || inner.kind() != "type_identifier" || inner.id() == name.id() || context.text(inner) != text {
            return;
        }
        used = type_parameter(context.file, inner, text).is_some_and(|declared| declared.id() == parameter.id());
    });
    used
}

fn type_parameter_fix(context: &Context, parameter: Node, list: Node, all: &[Node]) -> Fix {
    let at = all.iter().position(|part| part.id() == parameter.id()).unwrap_or(0);
    if all.len() == 1 {
        return Fix::replace(list.start_byte(), list.end_byte(), "");
    }
    if at == all.len() - 1 {
        return Fix::replace(all[at - 1].end_byte(), parameter.end_byte(), "");
    }
    let _ = context;
    Fix::replace(parameter.start_byte(), all[at + 1].start_byte(), "")
}

fn handle_parameters(context: &Context, declaration: Node, scope: Node) {
    let Some(list) = children(declaration).into_iter().find(|part| part.kind() == "type_parameters") else { return };
    let all: Vec<Node> = children(list).into_iter().filter(|part| part.kind() == "type_parameter").collect();
    for parameter in &all {
        let Some(name) = children(*parameter).into_iter().find(|part| part.kind() == "type_identifier") else { continue };
        if used_elsewhere(context, scope, *parameter, name) {
            continue;
        }
        let fix = type_parameter_fix(context, *parameter, list, &all);
        context.report_fixed("UnusedTypeParameter", *parameter, parameter.start_byte(), "This type parameter is unused and can be removed.", &[fix]);
    }
}

pub fn unused_type_parameter(context: &Context, node: Node) {
    match node.kind() {
        "class_declaration" if crate::java::helpers::has_modifier(node, "final") && !skipped_by_outer(context, node) => handle_parameters(context, node, node),
        "record_declaration" if !skipped_by_outer(context, node) => handle_parameters(context, node, node),
        "method_declaration" | "constructor_declaration" => {
            if children(node).iter().all(|part| part.kind() != "type_parameters") || can_be_overridden(context, node) {
                return;
            }
            let overrides = declared_method(context, node).is_some_and(|(info, method)| !super_methods(context.resolver.index, info, method).is_empty());
            if !overrides && !skipped_by_outer(context, node) {
                handle_parameters(context, node, node);
            }
        }
        _ => {}
    }
}

/// The scanner does not look inside a method it skips: its nested classes and methods are not visited.
fn skipped_by_outer(context: &Context, node: Node) -> bool {
    let mut current = parent(node);
    while let Some(holder) = current {
        if matches!(holder.kind(), "method_declaration" | "constructor_declaration") {
            let overrides = declared_method(context, holder).is_some_and(|(info, method)| !super_methods(context.resolver.index, info, method).is_empty());
            if can_be_overridden(context, holder) || overrides || skipped_by_outer(context, holder) {
                return true;
            }
        }
        current = parent(holder);
    }
    false
}
