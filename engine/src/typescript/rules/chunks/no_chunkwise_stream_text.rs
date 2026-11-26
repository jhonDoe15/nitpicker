//! `no-chunkwise-stream-text`: stream chunks that are decoded or matched one at a time, so a multibyte character
//! or a match split across two chunks is corrupted or missed.
use super::chunk_sources::{Chunk, data_listener, is_binary_or_untyped_stream, stream_loop, yields_strings};
use super::chunk_uses::{Kind, uses_of};
use crate::typescript::rules::Context;
use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::typed::types::Types;
use std::cell::RefCell;

const RULE: &str = "no-chunkwise-stream-text";

fn collected(target: &str) -> String {
    format!(
        "`{target}` collects stream chunks as text one at a time, so a multibyte character split across two chunks is corrupted. Keep \
         the chunks (`parts.push(chunk)`) and decode once at the end (`Buffer.concat(parts).toString(\"utf8\")`), or call \
         `setEncoding(\"utf8\")` on the stream first."
    )
}

const DECODED: &str = "This `decode` call decodes one chunk on its own, so a multibyte character split across two chunks is corrupted. Pass `{ stream: true }` as the second argument for every chunk and call `decode()` once more at the end, or collect the chunks and decode them together.";

fn matched(method: &str) -> String {
    format!(
        "`{method}` looks for text inside a single chunk, so a match split across two chunks is missed. Append the chunk to an \
         accumulated string or buffer and search that, or call `setEncoding(\"utf8\")` and keep a rolling tail."
    )
}

fn judged(context: &Context, scopes: &Scopes, types: &RefCell<Types>, chunk: &Chunk) -> Option<bool> {
    let receiver = context.file.slice(chunk.receiver.start(), chunk.receiver.end());
    if context.file.text.contains(&format!("{receiver}.setEncoding(")) || yields_strings(context, scopes, chunk.receiver) {
        return Some(false);
    }
    is_binary_or_untyped_stream(context, scopes, &mut types.borrow_mut(), chunk)
}

fn findings(context: &Context, scopes: &Scopes, types: &RefCell<Types>, chunk: Option<Chunk>) -> Option<Vec<(u32, u32, String)>> {
    let Some(chunk) = chunk else { return Some(Vec::new()) };
    if !judged(context, scopes, types, &chunk)? {
        return Some(Vec::new());
    }
    let mut is_decoder = |receiver: crate::typescript::rules::support::view::Node| {
        let names = types.borrow_mut().type_names(receiver.start(), receiver.end())?;
        Some(names.iter().any(|name| name == "TextDecoder"))
    };
    let uses = uses_of(context, scopes, &chunk, &mut is_decoder)?;
    Some(
        uses.into_iter()
            .map(|found| {
                let message = match found.kind {
                    Kind::Collected(target) => collected(&target),
                    Kind::Decoded => DECODED.to_string(),
                    Kind::Matched(method) => matched(&method),
                };
                (found.start, found.end, message)
            })
            .collect(),
    )
}

pub fn check(context: &mut Context) {
    let (Some((view, scopes)), Some(types)) = (context.estree, context.types) else { return };
    let mut found = Vec::new();
    for node in view.nodes() {
        let chunk = match node.kind() {
            "CallExpression" => data_listener(scopes, node),
            "ForOfStatement" => stream_loop(scopes, node),
            _ => continue,
        };
        match findings(context, scopes, types, chunk) {
            Some(mut reported) if types.borrow().refused.is_none() => found.append(&mut reported),
            _ => {
                types.borrow_mut().refuse("no type for a stream chunk");
                return;
            }
        }
    }
    for (start, end, message) in found {
        context.report_range(RULE, start, Some(end), message);
    }
}
