//! OutlineNone: CSS outlines switched off in GWT templates and style calls.
use super::annotation_args::annotation_value;
use super::consts::{constant, Const};
use super::odd_calls::receiver_class;
use super::parts::arguments;
use super::positions::preferred;
use super::Context;
use tree_sitter::Node;

const MESSAGE: &str = "Setting CSS outline style to none or 0 (while not otherwise providing visual focus indicators) is inaccessible for users navigating a web page without a mouse.";

fn is_css_space(character: char) -> bool {
    matches!(character, ' ' | '\t' | '\n' | '\u{b}' | '\u{c}' | '\r')
}

/// `outline\s*:\s*(none|0px)\s*;?` found anywhere in the text.
fn has_outline_none(template: &str) -> bool {
    template.match_indices("outline").any(|(at, word)| {
        let rest = template[at + word.len()..].trim_start_matches(is_css_space);
        rest.strip_prefix(':').is_some_and(|rest| {
            let rest = rest.trim_start_matches(is_css_space);
            rest.starts_with("none") || rest.starts_with("0px")
        })
    })
}

pub fn outline_none(context: &Context, node: Node) {
    match node.kind() {
        "annotation" => {
            let Some(name) = node.child_by_field_name("name") else { return };
            if context.resolver.class_name(node, context.text(name)).as_deref() != Some("com.google.gwt.safehtml.client.SafeHtmlTemplates.Template") {
                return;
            }
            let Some(value) = annotation_value(&context.file.text, node, "value") else { return };
            if let Some(Const::Str(template)) = constant(context, value) {
                if has_outline_none(&template) {
                    context.report_fixed("OutlineNone", node, node.start_byte(), MESSAGE, &[]);
                }
            }
        }
        "method_invocation" => {
            let Some(name) = node.child_by_field_name("name").map(|name| context.text(name)) else { return };
            if name != "setProperty" && name != "setPropertyPx" {
                return;
            }
            let list = arguments(node);
            if list.len() < 2 || context.resolver.resolve_call(node).is_none_or(|resolved| resolved.method.is_static) {
                return;
            }
            if receiver_class(context, node).is_none_or(|receiver| !context.resolver.index.is_subtype(&receiver, "com.google.gwt.dom.client.Style")) {
                return;
            }
            if !matches!(constant(context, list[0]), Some(Const::Str(property)) if property == "outline") {
                return;
            }
            let none_or_zero = match constant(context, list[1]) {
                Some(Const::Str(value)) => value == "none" || value == "0px",
                Some(Const::Int(value)) => value == 0,
                Some(Const::Long(value)) => value == 0,
                Some(Const::Float(value)) => value == 0.0,
                Some(Const::Double(value)) => value == 0.0,
                _ => false,
            };
            if none_or_zero {
                context.report_fixed("OutlineNone", node, preferred(context, node), MESSAGE, &[]);
            }
        }
        _ => {}
    }
}
