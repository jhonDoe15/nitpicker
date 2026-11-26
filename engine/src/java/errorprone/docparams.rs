//! InvalidParam: `@param` tags that name no parameter, and `{@code x}` that nearly names one.
use super::doc::{Kind, Tree};
use super::fixes::Fix;
use super::javadoc::{Documented, Element, edit_distance, parameter_names};
use crate::engine::source::{children, named_children};
use tree_sitter::Node;

const CHECK: &str = "InvalidParam";
const SUMMARY: &str = "This @param tag doesn't refer to a parameter of the method.";
const LIKELY_PARAMETER_THRESHOLD: f64 = 0.25;

fn type_parameters(documented: &Documented, declaration: Node) -> Vec<String> {
    let Some(list) = declaration.child_by_field_name("type_parameters").or_else(|| children(declaration).into_iter().find(|part| part.kind() == "type_parameters")) else { return Vec::new() };
    named_children(list)
        .into_iter()
        .filter(|part| part.kind() == "type_parameter")
        .filter_map(|part| children(part).into_iter().find(|inner| matches!(inner.kind(), "type_identifier" | "identifier")))
        .map(|name| documented.context.text(name).to_string())
        .collect()
}

fn is_type_parameter(documented: &Documented, tag: &Tree) -> bool {
    tag.children.first().is_some_and(|name| documented.comment.text[tag.pos..name.pos].contains(&'<'))
}

fn name_of(documented: &Documented, tag: &Tree) -> String {
    tag.children.first().map(|name| documented.comment.text[name.pos..name.end].iter().collect()).unwrap_or_default()
}

fn replace(documented: &Documented, from: usize, to: usize, text: &str) -> Fix {
    match (documented.comment.source_pos(from), documented.comment.source_pos(to)) {
        (Some(start), Some(end)) => Fix::replace(start, end, text),
        _ => Fix::new(),
    }
}

fn best_match<'a>(to: &str, choices: &[&'a str]) -> Option<&'a str> {
    let mut best = None;
    let mut minimum = usize::MAX;
    for choice in choices {
        let distance = edit_distance(to, choice);
        if distance < minimum && distance < 5 {
            best = Some(*choice);
            minimum = distance;
        }
    }
    best
}

pub(super) fn invalid_param(documented: &Documented, declaration: Node) {
    let context = documented.context;
    let parameters: Vec<&str> = match documented.element {
        Element::Variable => return,
        _ => parameter_names(context, declaration),
    };
    let generics = type_parameters(documented, declaration);
    let tags: Vec<&Tree> = documented.doc.tags.iter().filter(|tag| tag.kind == Kind::Block && tag.name == "param" && !tag.children.is_empty()).collect();
    let documented_names = |generic: bool| -> Vec<String> { tags.iter().filter(|tag| is_type_parameter(documented, tag) == generic).map(|tag| name_of(documented, tag)).collect() };
    for tag in &tags {
        let generic = is_type_parameter(documented, tag);
        let name = name_of(documented, tag);
        let known: Vec<&str> = if generic { generics.iter().map(String::as_str).collect() } else { parameters.clone() };
        colon(documented, tag);
        if known.contains(&name.as_str()) {
            continue;
        }
        let written = documented_names(generic);
        let undocumented: Vec<&str> = known.iter().copied().filter(|candidate| !written.iter().any(|done| done == candidate)).collect();
        let identifier = &tag.children[0];
        let message = format!("Parameter name `{name}` is unknown.");
        match best_match(&name, &undocumented) {
            Some(found) => {
                let fix = replace(documented, identifier.pos, identifier.end, found);
                documented.report_fixed(CHECK, tag.pos, &format!("{message} Did you mean {found}?"), &[fix]);
            }
            None => {
                let fix = replace(documented, tag.pos, tag.end, "");
                documented.report_fixed(CHECK, tag.pos, &message, &[fix]);
            }
        }
    }
    close_literals(documented, &parameters);
}

fn colon(documented: &Documented, tag: &Tree) {
    let Some(first) = tag.description().first().filter(|first| first.kind == Kind::Text) else { return };
    if documented.comment.text.get(first.pos) != Some(&':') {
        return;
    }
    let Some(at) = documented.comment.source_pos(tag.children[0].end) else { return };
    if documented.context.file.text.as_bytes().get(at) == Some(&b':') {
        documented.report_fixed(CHECK, tag.pos, SUMMARY, &[Fix::replace(at, at + 1, "")]);
    }
}

fn possible_parameter(body: &str) -> bool {
    let mut letters = body.chars();
    letters.next().is_some_and(|first| first.is_ascii_lowercase()) && letters.all(|rest| rest.is_ascii_alphanumeric())
}

fn close_literals(documented: &Documented, parameters: &[&str]) {
    documented.doc.visit(&mut |tree, _| {
        if tree.kind != Kind::Inline || tree.name != "code" {
            return;
        }
        let Some(text) = tree.children.first().filter(|text| text.kind == Kind::Text) else { return };
        let body: String = documented.comment.text[text.pos..text.end].iter().collect();
        if !possible_parameter(&body) || matches!(body.as_str(), "true" | "false") {
            return;
        }
        let mut best: Option<&str> = None;
        let mut minimum = usize::MAX;
        for parameter in parameters {
            let distance = edit_distance(&body, parameter);
            if distance < minimum {
                best = Some(*parameter);
                minimum = distance;
            }
        }
        let Some(best) = best.filter(|best| *best != body && (minimum as f64) / (body.chars().count() as f64) <= LIKELY_PARAMETER_THRESHOLD) else { return };
        let message = format!("`{body}` is very close to the parameter `{best}`. Did you mean to reference the parameter?");
        let fix = replace(documented, text.pos, text.end, best);
        documented.report_fixed(CHECK, tree.pos, &message, &[fix]);
    });
}
