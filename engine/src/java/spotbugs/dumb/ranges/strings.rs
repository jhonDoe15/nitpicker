//! RANGE_STRING_INDEX, measured on test code: `charAt` and `codePointAt` need `0..=length-1`, `substring(begin)`
//! `0..=length`, `substring(begin, end)` and `subSequence(begin, end)` `0..=length` for the begin and
//! `begin..=length` for the end (`0..=length` when the begin is unknown), on a receiver written as `String`. The
//! message names the called method, or the file and line when the range is empty; placed on the called method.
use super::super::super::Context;
use super::super::super::idioms::called;
use super::super::super::idioms::encoding::written_owner;
use super::super::calls::randoms::{arguments, call_line};
use super::super::found::Findings;
use super::super::numbers::source::called_place;
use super::known::{Known, units};
use super::{Broke, Out, STRING, add, outside, shown};
use tree_sitter::Node;

pub fn call<'a>(context: &Context<'a>, known: &Known<'_, 'a>, own: &str, node: Node<'a>, found: &mut Findings<'a>) {
    if node.kind() != "method_invocation" {
        return;
    }
    let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
    let listed = arguments(node);
    let pairs = match (name, listed.len()) {
        ("charAt" | "codePointAt", 1) => false,
        ("substring", 1) => false,
        ("substring" | "subSequence", 2) => true,
        _ => return,
    };
    if written_owner(context, own, node).as_deref() != Some("java.lang.String") {
        return;
    }
    let Some(call) = context.resolver.resolve_call(node) else { return };
    if call.method.parameters.len() != listed.len() {
        return;
    }
    let size = node.child_by_field_name("object").and_then(|object| known.text(object)).map_or(i32::MAX, |text| units(&text));
    let shown_call = called(context, "java.lang.String", name, &call.method.parameters);
    let line = call_line(context, node);
    let place = called_place(context, node, &shown_call);
    let file = context.file.path.rsplit(['/', '\\']).next().unwrap_or_default().to_string();
    let mut report = |value: i32, broke: Broke| {
        let first = if broke == Broke::Empty { format!("{file}:[line {line}]") } else { shown_call.clone() };
        let text = shown(value);
        let message = format!("String index is out of bounds when calling {first}: {text}");
        let out = Out { pattern: STRING, node, line, value, broke, message, place: Some(place.clone()), arguments: vec![first, text], called: shown_call.clone() };
        add(found, out);
    };
    let begin = known.number(listed[0]);
    let last = if matches!(name, "charAt" | "codePointAt") { size.wrapping_sub(1) } else { size };
    if let Some(begin) = begin
        && let Some(broke) = outside(begin, 0, last)
    {
        report(begin, broke);
    }
    if pairs
        && let Some(end) = known.number(listed[1])
        && let Some(broke) = outside(end, begin.unwrap_or(0), size)
    {
        report(end, broke);
    }
}
