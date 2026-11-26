//! Checks for calls and classes Error Prone bans or flags by name: class loaders, JNDI, `System.exit`, `T extends Object`.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use crate::engine::source::{ancestor, children, named_children};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use tree_sitter::Node;

const CLASS_LOADER: &str = "Using dangerous ClassLoader APIs may deserialize untrusted user input into bytecode, leading to remote code execution vulnerabilities";
const JNDI: &str = "Using JNDI may deserialize user input via the `Serializable` API which is extremely dangerous";

const CLASS_LOADER_CALLS: &[&str] = &[
    "java.lang.ClassLoader#defineClass(_*)",
    "jdk.internal.misc.Unsafe#defineClass(_*)",
    "jdk.internal.access.JavaLangAccess#defineClass(_*)",
    "java.lang.invoke.MethodHandles.Lookup#defineClass(_*)",
    "java.rmi.server.RMIClassLoader#loadClass(_*)",
    "java.rmi.server.RMIClassLoader#loadProxyClass(_*)",
    "java.rmi.server.RMIClassLoaderSpi#loadClass(_*)",
    "java.rmi.server.RMIClassLoaderSpi#loadProxyClass(_*)",
];

const JNDI_CALLS: &[&str] = &[
    "javax.naming.directory.DirContext#modifyAttributes(_*)",
    "javax.naming.directory.DirContext#getAttributes(_*)",
    "javax.naming.directory.DirContext#search(_*)",
    "javax.naming.directory.DirContext#getSchema(_*)",
    "javax.naming.directory.DirContext#getSchemaClassDefinition(_*)",
    "javax.naming.Context#lookup(_*)",
    "javax.naming.Context#bind(_*)",
    "javax.naming.Context#rebind(_*)",
    "javax.naming.Context#createSubcontext(_*)",
    "javax.jdo.JDOHelperTest#testGetPMFBadJNDI(_*)",
    "javax.jdo.JDOHelperTest#testGetPMFBadJNDIGoodClassLoader(_*)",
    "javax.jdo.JDOHelperTest#testGetPMFNullJNDI(_*)",
    "javax.jdo.JDOHelperTest#testGetPMFNullJNDIGoodClassLoader(_*)",
    "javax.jdo.JDOHelper#getPersistenceManagerFactory(_*)",
    "javax.management.remote.JMXConnectorFactory#connect(_*)",
    "javax.sql.rowset.spi.SyncFactory#getInstance(_*)",
    "javax.management.remote.rmi.RMIConnector.RMIClientCommunicatorAdmin#doStart(_*)",
    "javax.management.remote.rmi.RMIConnector#connect(_*)",
    "javax.naming.InitialContext#doLookup(_*)",
];

fn any_call(context: &Context, call: Node, signatures: &[&str]) -> bool {
    let Some(name) = call.child_by_field_name("name").map(|name| context.text(name)) else { return false };
    signatures.iter().any(|signature| signature.split_once('#').is_some_and(|(_, rest)| rest.starts_with(name) && rest[name.len()..].starts_with('('))
        && context.resolver.matches_sig(call, signature))
}

fn scan_calls(context: &Context, node: Node, signatures: &[&str]) -> bool {
    node.kind() == "method_invocation" && any_call(context, node, signatures)
}

fn pointed_at(node: Node) -> usize {
    node.child_by_field_name("arguments").map_or(node.start_byte(), |list| list.start_byte())
}

pub fn ban_class_loader(context: &Context, node: Node) {
    let found = match node.kind() {
        "method_invocation" => scan_calls(context, node, CLASS_LOADER_CALLS).then(|| pointed_at(node)),
        "object_creation_expression" => {
            let created = context.resolver.type_of(node);
            let descendant = matches!(&created, Some(Type::Class(name, _)) if context.resolver.index.is_subtype(name, "java.net.URLClassLoader"));
            descendant.then(|| node.start_byte())
        }
        "class_declaration" => {
            let direct = node
                .child_by_field_name("superclass")
                .and_then(|clause| named_children(clause).into_iter().find(|part| !part.kind().ends_with("comment")))
                .and_then(|written| context.resolver.type_node(written));
            let hit = matches!(direct, Some(Type::Class(name, _)) if name == "java.net.URLClassLoader");
            hit.then(|| children(node).into_iter().find(|part| part.kind() == "class").map_or(node.start_byte(), |word| word.start_byte()))
        }
        "class_body" if node.parent().is_some_and(|holder| holder.kind() == "object_creation_expression") => {
            let holder = node.parent().unwrap();
            let created = holder.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
            matches!(created, Some(Type::Class(name, _)) if name == "java.net.URLClassLoader").then(|| node.start_byte())
        }
        _ => None,
    };
    if let Some(at) = found {
        context.report_fixed("BanClassLoader", node, at, CLASS_LOADER, &[]);
    }
}

pub fn ban_jndi(context: &Context, node: Node) {
    if node.kind() == "method_invocation" && any_call(context, node, JNDI_CALLS) {
        context.report_fixed("BanJNDI", node, pointed_at(node), JNDI, &[]);
    }
}

fn is_main(context: &Context, method: Node) -> bool {
    if method.kind() != "method_declaration" || !has_modifier(method, "public") || !has_modifier(method, "static") {
        return false;
    }
    if method.child_by_field_name("name").is_none_or(|name| context.text(name) != "main") {
        return false;
    }
    if method.child_by_field_name("type").is_none_or(|written| written.kind() != "void_type") {
        return false;
    }
    let Some(list) = method.child_by_field_name("parameters") else { return false };
    let parameters: Vec<Node> = named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")).collect();
    let [only] = parameters.as_slice() else { return false };
    let element = match only.kind() {
        "formal_parameter" => context.resolver.declared_type(*only, None),
        "spread_parameter" => children(*only).into_iter().find(|part| part.kind() != "..." && part.is_named() && part.kind() != "variable_declarator" && part.kind() != "modifiers").and_then(|written| context.resolver.type_node(written)).map(|kind| Type::Array(Box::new(kind))),
        _ => None,
    };
    matches!(element, Some(Type::Array(inner)) if matches!(*inner, Type::Class(ref name, _) if name == "java.lang.String"))
}

const CLASS_KINDS: &[&str] = &[
    "class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration", "class_body",
];

pub fn system_exit_outside_main(context: &Context, node: Node) {
    if node.kind() != "method_invocation" || node.child_by_field_name("name").is_none_or(|name| context.text(name) != "exit") {
        return;
    }
    if !context.resolver.matches_sig(node, "java.lang.System#exit(_*)") {
        return;
    }
    if ancestor(node, &["method_declaration", "constructor_declaration"]).is_some_and(|method| is_main(context, method)) {
        return;
    }
    let Some(class) = ancestor(node, CLASS_KINDS) else { return };
    let body = if class.kind() == "class_body" { Some(class) } else { class.child_by_field_name("body") };
    let has_main = body.is_some_and(|body| children(body).into_iter().any(|member| is_main(context, member)));
    if !has_main {
        context.report_fixed("SystemExitOutsideMain", node, pointed_at(node), "Code that contains System.exit() is untestable.", &[]);
    }
}

pub fn extends_object(context: &Context, node: Node) {
    if node.kind() != "type_parameter" {
        return;
    }
    let Some(list) = children(node).into_iter().find(|part| part.kind() == "type_bound") else { return };
    for bound in named_children(list).into_iter().filter(|part| !part.kind().ends_with("comment")) {
        if !matches!(context.resolver.type_node(bound), Some(Type::Class(name, _)) if name == "java.lang.Object") {
            continue;
        }
        if bound.kind() == "type_identifier" && crate::java::types::scope::type_parameter(context.file, bound, context.text(bound)).is_some() {
            continue;
        }
        if bound.kind() != "annotated_type" {
            let non_null = qualify_type(context, node, "org.checkerframework.checker.nullness.qual.NonNull", &mut Fix::new());
            let fix = Fix::new().insert(bound.start_byte(), format!(" @{non_null} ")).with_imports();
            let message = "`T extends Object` is redundant (unless you are using the Checker Framework).";
            let at = children(bound).into_iter().rev().find(|part| part.kind() == ".").map_or(bound.start_byte(), |dot| dot.start_byte());
            context.report_fixed("ExtendsObject", node, at, message, &[fix]);
            return;
        }
    }
}
