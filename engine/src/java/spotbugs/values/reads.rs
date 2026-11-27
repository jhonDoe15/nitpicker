//! SR_NOT_CHECKED and RR_NOT_CHECKED (ReadReturnShouldBeChecked): the code drops the result of a call that may skip or
//! read fewer bytes or characters than asked for. A skip is `skip(long)` or `skipBytes(int)` made on a subtype of
//! `InputStream`, `Reader` or `DataInput`; a read is `read(byte[])` or `read(byte[], int, int)` made on a subtype of
//! `InputStream` or `DataInput`, or `read(char[])` or `read(char[], int, int)` made on a subtype of `Reader`. The class
//! is the one the compiled call is made on, the type of the receiver. Nothing on a `ByteArrayInputStream`, and no skip
//! on an `ImageInputStream`. A skip on a `BufferedInputStream` is priority 1, everything else priority 2. Each called
//! method is reported once per method, on the first one's line.
use super::super::{Context, place, returns};
use crate::java::types::model::Type;
use std::collections::HashSet;

pub const SKIP: &str = "SR_NOT_CHECKED";
pub const READ: &str = "RR_NOT_CHECKED";

const INPUT: &str = "java.io.InputStream";
const READER: &str = "java.io.Reader";
const DATA: &str = "java.io.DataInput";

fn array_of(kind: &Type, element: &'static str) -> bool {
    matches!(kind, Type::Array(inner) if **inner == Type::Primitive(element))
}

/// The pattern a dropped call falls under, from its name, its erased parameters and the class it is made on.
fn pattern_of(context: &Context, name: &str, parameters: &[Type], on: &str) -> Option<&'static str> {
    let index = context.resolver.index;
    let under = |of: &str| index.is_subtype(on, of);
    if under("java.io.ByteArrayInputStream") {
        return None;
    }
    let int = Type::Primitive("int");
    let ranged = |element: &'static str| match parameters {
        [one] => array_of(one, element),
        [one, two, three] => array_of(one, element) && *two == int && *three == int,
        _ => false,
    };
    match name {
        "skip" if parameters == [Type::Primitive("long")] => (!under("javax.imageio.stream.ImageInputStream") && (under(INPUT) || under(READER) || under(DATA))).then_some(SKIP),
        "skipBytes" if parameters == [int.clone()] => (!under("javax.imageio.stream.ImageInputStream") && (under(INPUT) || under(READER) || under(DATA))).then_some(SKIP),
        "read" if ranged("byte") => (under(INPUT) || under(DATA)).then_some(READ),
        "read" if ranged("char") => under(READER).then_some(READ),
        _ => None,
    }
}

pub fn reads(context: &Context) {
    if !context.wants(&[SKIP, READ]) {
        return;
    }
    let package = context.resolver.scope.package.clone();
    let mut seen = HashSet::new();
    for dropped in returns::dropped_calls(context) {
        let call = &dropped.call;
        let through_super = dropped.node.child_by_field_name("object").is_some_and(|object| object.kind() == "super");
        if dropped.node.kind() != "method_invocation" || call.method.is_static || through_super {
            continue;
        }
        let on = returns::made_on(context, call);
        let Some(pattern) = pattern_of(context, &call.method.name, &call.method.parameters, &on) else { continue };
        let buffered = pattern == SKIP && call.method.name == "skip" && context.resolver.index.is_subtype(&on, "java.io.BufferedInputStream");
        let priority = if buffered { 1 } else { 2 };
        let binary = super::super::names::binary(context, &on);
        let listed = call.method.parameters.iter().map(|kind| super::super::names::simple(context, kind)).collect::<Vec<_>>().join(", ");
        let full = format!("{binary}.{}({listed})", call.method.name);
        let caller = crate::java::types::scope::enclosing_types(context.resolver.scope, dropped.node).first().map(|own| super::super::names::binary(context, own)).unwrap_or_default();
        let shown = format!("{}{}({listed})", returns::relative(&caller, &binary), call.method.name);
        for label in &dropped.labels {
            if !seen.insert((label.clone(), full.clone())) {
                continue;
            }
            let message = format!("{label} ignores result of {full}");
            let symbol = format!("{}|{package}@{shown}", place::function(&full));
            context.report_listed(pattern, dropped.node, dropped.line, message, symbol, priority, vec![label.clone(), full.clone()]);
        }
    }
}
