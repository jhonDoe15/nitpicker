//! UrlRewritingDetector, measured on test code: each call of `encodeURL`, `encodeRedirectURL`, `encodeUrl` or
//! `encodeRedirectUrl` written against Servlet's `HttpServletResponse` itself (`javax` or `jakarta`, not a
//! wrapper or subinterface) is URL_REWRITING, priority 1, on the line of its `(`, once per line. A method
//! reference is not a call.
use super::super::idioms::Compiled;
use super::super::idioms::encoding::written_owner;
use super::super::taint::lines::line as invoke_line;
use super::super::{Context, place};

pub const REWRITING: &str = "URL_REWRITING";
const RESPONSES: &[&str] = &["javax.servlet.http.HttpServletResponse", "jakarta.servlet.http.HttpServletResponse"];
const METHODS: &[&str] = &["encodeURL", "encodeRedirectURL", "encodeUrl", "encodeRedirectUrl"];

pub fn check(context: &Context, own: &str, methods: &[Compiled]) {
    for method in methods {
        let mut lines = Vec::new();
        for node in method.nodes.iter().copied().filter(|node| node.kind() == "method_invocation") {
            let named = node.child_by_field_name("name").is_some_and(|name| METHODS.contains(&context.text(name)));
            if !named || !written_owner(context, own, node).is_some_and(|owner| RESPONSES.contains(&owner.as_str())) {
                continue;
            }
            let line = invoke_line(context, node);
            if lines.contains(&line) {
                continue;
            }
            lines.push(line);
            context.report_listed(REWRITING, node, line, "Method rewriting session ID into the URL".to_string(), place::function(&method.label), 1, Vec::new());
        }
    }
}
