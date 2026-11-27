//! `no-incomplete-escaping`: a `replace` chain that puts a backslash before a quote without escaping the backslash
//! itself, or that unescapes one sequence at a time with `\\` handled in a separate step.
use super::chains::{
    Replacement, chain_of, chain_root, handles_backslash, inserts_backslash, is_escape_pair, is_escape_sequence, is_outermost,
    replacement_of,
};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::view::Node;

const RULE: &str = "no-incomplete-escaping";
const ESCAPE_BACKSLASH: &str = "This `replace` adds a backslash before a character but nothing escapes the backslash itself, so a value holding `\\` round-trips wrong. Match both in one pattern: `value.replace(/[\\\\\"]/g, (c) => `\\\\${c}`)`.";
const UNESCAPE_ORDER: &str = "This chain unescapes one sequence at a time and handles `\\\\` in a separate step, so the order decides the result. Decode in one pass: `text.replace(/\\\\([\"'nt\\\\])/g, (_, c) => table[c])`.";
const FUNCTIONS: [&str; 3] = ["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"];

fn outermost_function(node: Node) -> Option<Node> {
    node.ancestors().filter(|ancestor| FUNCTIONS.contains(&ancestor.kind())).last()
}

fn opaque_root(root: Option<Node>) -> bool {
    root.is_some_and(|root| root.is("CallExpression") || root.is("AwaitExpression"))
}

fn escape_candidates<'v>(chain: &[Replacement<'v>]) -> Vec<Node<'v>> {
    let mut found = Vec::new();
    for (index, step) in chain.iter().enumerate() {
        if inserts_backslash(step) && !chain[..index].iter().any(handles_backslash) {
            found.push(step.call);
        }
    }
    found
}

fn overlaps(handler: Node, call: Node) -> bool {
    handler.start() < call.end() && call.start() < handler.end()
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let mut candidates = Vec::new();
    let mut handlers = Vec::new();
    let mut found = Vec::new();
    for node in view.nodes().filter(|node| node.is("CallExpression")) {
        let Some(step) = replacement_of(scopes, node) else { continue };
        if handles_backslash(&step) {
            handlers.push(node);
        }
        if !is_outermost(scopes, node) {
            continue;
        }
        let chain = chain_of(scopes, node);
        if chain.iter().any(is_escape_pair) && chain.iter().any(is_escape_sequence) {
            found.push((node, UNESCAPE_ORDER));
        } else if !opaque_root(chain_root(&chain)) {
            let scope = outermost_function(node);
            candidates.extend(escape_candidates(&chain).into_iter().map(|call| (call, scope)));
        }
    }
    for (call, scope) in candidates {
        let covered = handlers.iter().any(|handler| outermost_function(*handler) == scope && !overlaps(*handler, call));
        if !covered {
            found.push((call, ESCAPE_BACKSLASH));
        }
    }
    for (node, message) in found {
        context.report_range(RULE, node.start(), Some(node.end()), message.to_string());
    }
}
