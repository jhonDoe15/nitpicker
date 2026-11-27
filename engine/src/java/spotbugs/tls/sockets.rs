//! UnencryptedSocketDetector, UnencryptedServerSocketDetector and WeakTLSDetector's DEFAULT_HTTP_CLIENT, measured
//! on test code: each constructor call of `java.net.Socket` (UNENCRYPTED_SOCKET), `java.net.ServerSocket`
//! (UNENCRYPTED_SERVER_SOCKET) and the no-argument one of Apache HttpClient's `DefaultHttpClient`
//! (DEFAULT_HTTP_CLIENT), priority 2. A call is a `new` of the class itself, an anonymous class of it (its
//! constructor makes the call), or a direct subclass's constructor calling `super(..)`, written or not. The socket
//! message names the class whose code makes the call. Once per method and line.
use super::super::idioms::Compiled;
use super::super::statements::random::super_calls;
use super::super::taint::lines::line as invoke_line;
use super::super::{Context, names, place};
use crate::engine::source::children;
use tree_sitter::Node;

pub const SOCKET: &str = "UNENCRYPTED_SOCKET";
pub const SERVER: &str = "UNENCRYPTED_SERVER_SOCKET";
pub const CLIENT: &str = "DEFAULT_HTTP_CLIENT";

const CLASSES: &[(&str, &str)] = &[("java.net.Socket", SOCKET), ("java.net.ServerSocket", SERVER), ("org.apache.http.impl.client.DefaultHttpClient", CLIENT)];

fn message(context: &Context, pattern: &str, caller: &str) -> String {
    match pattern {
        SOCKET => format!("Unencrypted socket to {} (instead of SSLSocket)", names::binary(context, caller)),
        SERVER => "Unencrypted server socket (instead of SSLServerSocket)".to_string(),
        _ => "DefaultHttpClient with default constructor is not compatible with TLS 1.2".to_string(),
    }
}

fn plain(node: Node) -> bool {
    node.child_by_field_name("arguments").is_none_or(|arguments| arguments.named_child_count() == 0)
}

fn report(context: &Context, pattern: &'static str, at: Node, line: usize, caller: &str, label: &str, seen: &mut Vec<(String, &'static str, usize)>) {
    if seen.iter().any(|(known, found, on)| known == label && *found == pattern && *on == line) {
        return;
    }
    seen.push((label.to_string(), pattern, line));
    context.report_listed(pattern, at, line, message(context, pattern, caller), place::function(label), 2, Vec::new());
}

pub fn check(context: &Context, own: &str, class: Node, methods: &[Compiled]) {
    let mut seen = Vec::new();
    for (superclass, pattern) in CLASSES {
        for (at, label) in super_calls(context, class, superclass) {
            if *pattern != CLIENT || at.kind() != "explicit_constructor_invocation" || plain(at) {
                report(context, pattern, at, context.line(at), own, &label, &mut seen);
            }
        }
    }
    for method in methods {
        for node in method.nodes.iter().copied().filter(|node| node.kind() == "object_creation_expression") {
            let Some(made) = node.child_by_field_name("type").and_then(|written| context.resolver.type_node(written)) else { continue };
            let Some((_, pattern)) = CLASSES.iter().find(|(class, _)| made.name() == *class) else { continue };
            if *pattern == CLIENT && !plain(node) {
                continue;
            }
            let anonymous = children(node).into_iter().any(|part| part.kind() == "class_body");
            let line = invoke_line(context, node);
            match anonymous.then(|| context.resolver.scope.names.get(&node.id())).flatten() {
                Some(inner) => report(context, pattern, node, line, inner, &names::anonymous(context, inner, node), &mut seen),
                None if !anonymous => report(context, pattern, node, line, own, &method.label, &mut seen),
                None => {}
            }
        }
    }
}
