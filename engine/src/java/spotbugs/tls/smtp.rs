//! InsecureSmtpSslDetector, measured on test code: in a method (a lambda is one of its own) that never calls
//! `setSSLCheckServerIdentity` with the constant `true`, each `setSSLOnConnect` with the constant `true` is
//! INSECURE_SMTP_SSL, priority 1. Both calls count only when written against Commons Email's `Email` itself, not
//! a subclass. A local holding `true` is not the constant. Once per line.
use super::super::idioms::Compiled;
use super::super::idioms::encoding::written_owner;
use super::super::taint::lines::line as invoke_line;
use super::super::{Context, place};
use tree_sitter::Node;

pub const SMTP: &str = "INSECURE_SMTP_SSL";
const EMAIL: &str = "org.apache.commons.mail.Email";

fn called(context: &Context, own: &str, node: Node, name: &str) -> bool {
    let arguments = node.child_by_field_name("arguments");
    node.kind() == "method_invocation"
        && node.child_by_field_name("name").is_some_and(|written| context.text(written) == name)
        && arguments.is_some_and(|arguments| arguments.named_child_count() == 1)
        && arguments.and_then(|arguments| arguments.named_child(0)).is_some_and(|value| context.resolver.constant_boolean(value) == Some(true))
        && written_owner(context, own, node).as_deref() == Some(EMAIL)
}

pub fn check(context: &Context, own: &str, methods: &[Compiled]) {
    for method in methods {
        if method.nodes.iter().any(|node| called(context, own, *node, "setSSLCheckServerIdentity")) {
            continue;
        }
        let mut lines = Vec::new();
        for node in method.nodes.iter().copied().filter(|node| called(context, own, *node, "setSSLOnConnect")) {
            let line = invoke_line(context, node);
            if lines.contains(&line) {
                continue;
            }
            lines.push(line);
            let message = " This SMTP SSL conncection does not verify the server certificate".to_string();
            context.report_listed(SMTP, node, line, message, place::function(&method.label), 1, Vec::new());
        }
    }
}
