//! UG_SYNC_SET_UNSYNC_GET, measured: an instance method `getX` that is neither `synchronized` nor private, next to a
//! `synchronized` instance method `setX` of the same class (same suffix, any parameters and results, an empty suffix
//! too). Reported on the first line of the getter's code, placed on the setter.
use super::super::classes::lines;
use super::super::{Context, names, place};
use crate::java::helpers::has_modifier;
use tree_sitter::Node;

pub const PATTERN: &str = "UG_SYNC_SET_UNSYNC_GET";

fn named<'a>(context: &Context<'a>, method: Node<'a>, prefix: &str) -> Option<&'a str> {
    let name = method.child_by_field_name("name")?;
    context.file.text_of(name).strip_prefix(prefix)
}

pub fn check<'a>(context: &Context<'a>, own: &str, _class: Node<'a>, members: &[Node<'a>]) {
    let methods: Vec<Node> = members.iter().copied().filter(|member| member.kind() == "method_declaration" && !has_modifier(*member, "static")).collect();
    for getter in &methods {
        let Some(suffix) = named(context, *getter, "get") else { continue };
        if has_modifier(*getter, "synchronized") || has_modifier(*getter, "private") || getter.child_by_field_name("body").is_none() {
            continue;
        }
        let setter = methods.iter().find(|setter| has_modifier(**setter, "synchronized") && named(context, **setter, "set") == Some(suffix));
        let (Some(setter), Some(line)) = (setter, lines::method_start(context, *getter)) else { continue };
        let (get, set) = (names::method(context, own, *getter, None), names::method(context, own, *setter, None));
        let message = format!("{get} is unsynchronized, {set} is synchronized");
        context.report_listed(PATTERN, *getter, line, message, place::function(&set), 2, vec![get, set]);
    }
}
