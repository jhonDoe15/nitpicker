//! `no-unbounded-query-array`: a runtime array expanded into an SQL `in` list or a multi-row insert with no
//! empty check, size check or chunking around it.
use super::bounds::{is_bounded, is_runtime_array};
use super::sinks::{SinkKind, array_sink};
use crate::typescript::rules::Context;
use crate::typescript::rules::database::modules::ModuleScope;
use crate::typescript::rules::queries::libraries::QueryScope;
use crate::typescript::rules::security_values::unwrapped;

const RULE: &str = "no-unbounded-query-array";
const NAME_LENGTH: usize = 30;
const LIMIT: &str = "PostgreSQL takes at most 65,535 bound parameters in one statement, so the query works in tests and fails on a large account";
const EXCEPTION: &str = "An exception fits only an array that its callers bound, such as a request field with a maximum length.";

fn message(kind: SinkKind, name: &str) -> String {
    match kind {
        SinkKind::In => format!(
            "{name} goes into the in list as one bound parameter per element: an empty array renders in (), a syntax error, and {LIMIT}. Return early when it is empty and send the whole array as one parameter (sql`id = any(${{ids}}::uuid[])`), or split it with the project's chunking helper. {EXCEPTION}"
        ),
        SinkKind::Insert => format!(
            "{name} is inserted as one multi-row statement that spends a bound parameter on every column of every row: an empty array fails, and {LIMIT}. Return early when it is empty and insert in chunks with the project's chunking helper (for (const rows of chunk(items, 1000))). {EXCEPTION}"
        ),
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let scope = QueryScope::of(ModuleScope::of(view, scopes, context.file.text));
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some((kind, array)) = array_sink(&scope, node) else { continue };
        if !is_runtime_array(scopes, array, kind != SinkKind::In) || is_bounded(&scope.module, node, array) {
            continue;
        }
        let text = scope.module.source(unwrapped(array));
        let name = if text.encode_utf16().count() > NAME_LENGTH || text.contains('\n') { "this array" } else { text };
        found.push((array.start(), array.end(), message(kind, name)));
    }
    for (start, end, text) in found {
        context.report_range(RULE, start, Some(end), text);
    }
}
