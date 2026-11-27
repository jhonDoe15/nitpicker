//! Array indexes, offsets and lengths, measured on test code:
//! - RANGE_ARRAY_INDEX: an element read or written (also `a[i]++` and `a[i] += v`) at a known index outside
//!   `0..=length-1`; placed on the method.
//! - RANGE_ARRAY_OFFSET and RANGE_ARRAY_LENGTH for `System.arraycopy`, `read(array, offset, length)` and
//!   `write(array, offset, length)` written against a class of `java.io` (not a subclass elsewhere), and
//!   `new String(array, offset, length)`: an offset is allowed in `0..=size` (`0..=size-1` for `arraycopy`), a length
//!   in `0..=size-offset` (an unknown offset counts as 0; for `arraycopy` the smaller of the two arrays' room). Both
//!   offsets of `arraycopy` are checked, then the length; placed on the called method.
use super::super::super::Context;
use super::super::super::idioms::called;
use super::super::super::idioms::encoding::written_owner;
use super::super::calls::randoms::{arguments, call_line};
use super::super::found::Findings;
use super::super::numbers::source::called_place;
use super::known::Known;
use super::{Broke, INDEX, LENGTH, OFFSET, Out, add, outside, shown};
use crate::java::types::model::Type;
use tree_sitter::Node;

pub fn index<'a>(context: &Context<'a>, known: &Known<'_, 'a>, node: Node<'a>, found: &mut Findings<'a>) {
    let (Some(array), Some(at)) = (node.child_by_field_name("array"), node.child_by_field_name("index")) else { return };
    let Some(value) = known.number(at) else { return };
    let size = known.length(array).unwrap_or(i32::MAX);
    let Some(broke) = outside(value, 0, size.wrapping_sub(1)) else { return };
    let text = shown(value);
    let message = format!("Array index is out of bounds: {text}");
    add(found, Out { pattern: INDEX, node, line: context.line(node), value, broke, message, place: None, arguments: vec![text], called: String::new() });
}

fn element(kind: Option<&Type>, arrays: &[&str]) -> bool {
    matches!(kind, Some(Type::Array(inner)) if matches!(inner.as_ref(), Type::Primitive(name) if arrays.contains(name)))
}

fn ints(kinds: &[Type]) -> bool {
    kinds.iter().all(|kind| matches!(kind, Type::Primitive("int")))
}

/// The arrays, offsets and length of a checked call, and the called method as SpotBugs names it.
fn checked<'a>(context: &Context<'a>, own: &str, node: Node<'a>) -> Option<(bool, Vec<Node<'a>>, String)> {
    let listed = arguments(node);
    if node.kind() == "object_creation_expression" {
        let call = context.resolver.resolve_constructor(node)?;
        let parameters = &call.method.parameters;
        let wanted = call.declaring == "java.lang.String" && parameters.len() == 3 && element(parameters.first(), &["byte", "char", "int"]) && ints(&parameters[1..]);
        return wanted.then(|| (false, listed, called(context, "java.lang.String", "<init>", parameters)));
    }
    let call = context.resolver.resolve_call(node)?;
    let name = context.text(node.child_by_field_name("name")?);
    let parameters = &call.method.parameters;
    if call.method.is_static {
        let copies = call.declaring == "java.lang.System" && name == "arraycopy" && parameters.len() == 5;
        return copies.then(|| (true, listed, called(context, "java.lang.System", name, parameters)));
    }
    let owner = written_owner(context, own, node)?;
    let io = owner.strip_prefix("java.io.").is_some_and(|rest| !rest.contains('.'));
    let wanted = io && matches!(name, "read" | "write") && parameters.len() == 3 && element(parameters.first(), &["byte", "char"]) && ints(&parameters[1..]);
    wanted.then(|| (false, listed, called(context, &owner, name, parameters)))
}

pub fn call<'a>(context: &Context<'a>, known: &Known<'_, 'a>, own: &str, node: Node<'a>, found: &mut Findings<'a>) {
    if node.kind() == "method_invocation" && node.child_by_field_name("name").is_some_and(|name| !matches!(context.text(name), "arraycopy" | "read" | "write")) {
        return;
    }
    let Some((copy, listed, name)) = checked(context, own, node) else { return };
    let line = call_line(context, node);
    let place = called_place(context, node, &name);
    let mut report = |pattern: &'static str, value: i32, broke: Broke| {
        let text = shown(value);
        let kind = if pattern == OFFSET { "offset" } else { "length" };
        let message = format!("Array {kind} is out of bounds: {text}");
        add(found, Out { pattern, node, line, value, broke, message, place: Some(place.clone()), arguments: vec![text], called: name.clone() });
    };
    let pairs = if copy { 2 } else { 1 };
    let arrays: Vec<(Node, Node)> = listed.chunks(2).take(pairs).filter_map(|pair| Some((*pair.first()?, *pair.get(1)?))).collect();
    let Some(length) = listed.last().copied() else { return };
    let mut room: Option<i32> = None;
    for (array, at) in arrays {
        let size = known.length(array).unwrap_or(i32::MAX);
        let offset = known.number(at);
        if let Some(offset) = offset {
            let last = if copy { size.wrapping_sub(1) } else { size };
            if let Some(broke) = outside(offset, 0, last) {
                report(OFFSET, offset, broke);
            }
        }
        let left = size.wrapping_sub(offset.unwrap_or(0));
        room = Some(room.map_or(left, |room| room.min(left)));
    }
    let (Some(value), Some(room)) = (known.number(length), room) else { return };
    if let Some(broke) = outside(value, 0, room) {
        report(LENGTH, value, broke);
    }
}
