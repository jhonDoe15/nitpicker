//! `no-error-response-without-status`: a `catch` of a request handler that answers with an error body and no
//! status, which is sent as `200 OK`.
mod answers;

use crate::typescript::rules::Context;
use answers::{Answer, Kind, answer_of, catch_around, is_error_body, leaves_status, status_set_around};

const RULE: &str = "no-error-response-without-status";
const MESSAGE: &str = "This `catch` answers with an error body but gives no status, so the response is `200 OK`: the caller sees `response.ok`, a scheduler records the run as succeeded and nothing retries. Give the failure its status (`{ status: 500 }`, `res.status(500).json(...)`). When 200 is meant, for example so that a webhook sender stops retrying, write the status out (`{ status: 200 }`). An exception fits only when every caller reads the body and never the status.";

fn defaults_to_success(answer: &Answer, around: impl Fn() -> bool) -> bool {
    if answer.kind == Kind::Static {
        return leaves_status(answer.settings);
    }
    answer.settings.is_none() && !around()
}

fn answers_by_protocol(text: &str) -> bool {
    text.as_bytes().windows(7).any(|window| window.eq_ignore_ascii_case(b"graphql"))
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    if answers_by_protocol(context.file.text) {
        return;
    }
    let program = view.program();
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(answer) = answer_of(scopes, program, node).filter(|answer| is_error_body(answer.body)) else { continue };
        let Some(clause) = catch_around(node) else { continue };
        let name = answer.root.name().map(|name| name.into_owned()).unwrap_or_default();
        if defaults_to_success(&answer, || status_set_around(clause, &name)) {
            found.push((node.start(), node.end()));
        }
    }
    for (start, end) in found {
        context.report_range(RULE, start, Some(end), MESSAGE.to_string());
    }
}
