//! InsecureSmtpSslDetector, measured on test code: in a method (a lambda is one of its own) that never calls
//! `setSSLCheckServerIdentity` with the constant `true`, each `setSSLOnConnect` with the constant `true` is
//! INSECURE_SMTP_SSL, priority 1. Both calls count only when written against Commons Email's `Email`,
//! `MultiPartEmail`, `HtmlEmail` or `ImageHtmlEmail` (not `SimpleEmail`, not a class of one's own), and the check
//! only for a call written against the same class. A local holding `true` is not the constant unless it is a
//! `final` constant variable. Once per line.
use super::super::idioms::Compiled;
use super::super::idioms::encoding::written_owner;
use super::super::taint::lines::line as invoke_line;
use super::super::{Context, place};
use tree_sitter::Node;

pub const SMTP: &str = "INSECURE_SMTP_SSL";
const EMAILS: &[&str] = &["org.apache.commons.mail.Email", "org.apache.commons.mail.MultiPartEmail", "org.apache.commons.mail.HtmlEmail", "org.apache.commons.mail.ImageHtmlEmail"];

/// The class a call with the constant `true` of this name is written against, when it is one of `EMAILS`.
fn called(context: &Context, own: &str, node: Node, name: &str) -> Option<String> {
    let arguments = node.child_by_field_name("arguments")?;
    let wanted = node.kind() == "method_invocation"
        && node.child_by_field_name("name").is_some_and(|written| context.text(written) == name)
        && arguments.named_child_count() == 1
        && arguments.named_child(0).is_some_and(|value| super::values::constant_true(context, value));
    wanted.then(|| written_owner(context, own, node)).flatten().filter(|owner| EMAILS.contains(&owner.as_str()))
}

pub fn check(context: &Context, own: &str, methods: &[Compiled]) {
    for method in methods {
        let checked: Vec<String> = method.nodes.iter().filter_map(|node| called(context, own, *node, "setSSLCheckServerIdentity")).collect();
        let mut lines = Vec::new();
        for node in method.nodes.iter().copied().filter(|node| called(context, own, *node, "setSSLOnConnect").is_some_and(|owner| !checked.contains(&owner))) {
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
