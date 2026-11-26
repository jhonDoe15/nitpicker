//! Rules about repeated and hard coded string literals.
use super::grouped;
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use std::collections::HashMap;

/// PMD's `StringUtil.escapeJava` inside double quotes.
pub fn printable(value: &str) -> String {
    let mut out = String::from("\"");
    for unit in value.encode_utf16() {
        match unit {
            0 => {}
            8 => out.push_str("\\b"),
            9 => out.push_str("\\t"),
            10 => out.push_str("\\n"),
            12 => out.push_str("\\f"),
            13 => out.push_str("\\r"),
            34 => out.push_str("\\\""),
            39 => out.push_str("\\'"),
            92 => out.push_str("\\\\"),
            unit if !(0x20..=0x7e).contains(&unit) => out.push_str(&format!("\\u{unit:04x}")),
            unit => out.push(char::from(unit as u8)),
        }
    }
    out.push('"');
    out
}

pub fn avoid_duplicate_literals(ctx: &Ctx, out: &mut Vec<Hit>) {
    let threshold = ctx.property("maxDuplicateLiterals").and_then(|value| value.trim().parse().ok()).unwrap_or(4);
    let minimum = 2 + ctx.property("minimumLength").and_then(|value| value.trim().parse().ok()).unwrap_or(3);
    let skip_annotations = ctx.property_flag("skipAnnotations", false);
    let exceptions = ctx.property_list("exceptionList", &[]);
    let mut seen: HashMap<String, Vec<u32>> = HashMap::new();
    for &literal in ctx.all("StringLiteral") {
        let image = ctx.text(literal, "Image");
        let length = image.encode_utf16().count();
        if length < minimum {
            continue;
        }
        let inner: String = image.chars().skip(1).take(image.chars().count().saturating_sub(2)).collect();
        if exceptions.contains(&inner) || (skip_annotations && ctx.enclosing(literal, &["Annotation"]).is_some()) {
            continue;
        }
        seen.entry(image).or_default().push(literal);
    }
    let mut found: Vec<&Vec<u32>> = seen.values().filter(|all| all.len() >= threshold).collect();
    found.sort_unstable();
    for all in found {
        let first = all[0];
        let line = ctx.whole(first, "BeginLine").unwrap_or(0) as usize;
        let args = vec![printable(&ctx.text(first, "ConstValue")), grouped(all.len()), grouped(line)];
        out.push(Hit { node: first, args, message: None });
    }
}
