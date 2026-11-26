use super::NAMING;
use crate::engine::source::{SourceFile, children, named_children};
use crate::java::checkstyle::report::Report;
use crate::java::helpers::{declarators, has_modifier, in_interface_or_annotation};
use regex::Regex;
use std::sync::OnceLock;
use tree_sitter::Node;

const TYPE_PARAMETER: &str = "(^[A-Z][0-9]?)$|([A-Z][a-zA-Z0-9]*[T]$)";
const LOWER: &str = "^[a-z]([a-z0-9][a-zA-Z0-9]*)?$";
const LOWER_OR_UNNAMED: &str = "^(_|[a-z]([a-z0-9][a-zA-Z0-9]*)?)$";
const PACKAGE: &str = r"^[a-z]+(\.[a-z][a-z0-9]*)*$";

fn regex(format: &'static str) -> &'static Regex {
    static CACHE: OnceLock<std::sync::Mutex<Vec<(&'static str, &'static Regex)>>> = OnceLock::new();
    let cache = CACHE.get_or_init(Default::default);
    let mut known = cache.lock().expect("regex cache");
    if let Some((_, found)) = known.iter().find(|(text, _)| *text == format) {
        return found;
    }
    let made: &'static Regex = Box::leak(Box::new(Regex::new(format).expect("format")));
    known.push((format, made));
    made
}

fn pattern(
    file: &SourceFile,
    name: Node,
    check: &str,
    label: &str,
    format: &'static str,
    report: &mut Report,
) {
    let text = file.text_of(name);
    if !regex(format).is_match(text) {
        let message = format!("{label} name '{text}' must match pattern '{format}'.");
        report.node(name, &format!("{NAMING}{check}Check"), message);
    }
}

pub fn check(file: &SourceFile, node: Node, report: &mut Report) {
    match node.kind() {
        "type_parameters" => type_parameters(file, node, report),
        "record_declaration" => {
            for name in record_components(node) {
                pattern(
                    file,
                    name,
                    "RecordComponentName",
                    "Record component",
                    LOWER,
                    report,
                );
            }
        }
        "package_declaration" => package(file, node, report),
        "field_declaration" => fields(file, node, report),
        _ => {
            if let Some(name) = pattern_variable(node) {
                pattern(
                    file,
                    name,
                    "PatternVariableName",
                    "Pattern variable",
                    LOWER_OR_UNNAMED,
                    report,
                );
            }
        }
    }
}

fn type_parameters(file: &SourceFile, node: Node, report: &mut Report) {
    let (check, label) = match node.parent().map(|owner| owner.kind()) {
        Some("class_declaration") => ("ClassTypeParameterName", "Class type"),
        Some("interface_declaration") => ("InterfaceTypeParameterName", "Interface type"),
        Some("record_declaration") => ("RecordTypeParameterName", "Record type"),
        Some("method_declaration") => ("MethodTypeParameterName", "Method type"),
        _ => return,
    };
    for parameter in children(node)
        .into_iter()
        .filter(|child| child.kind() == "type_parameter")
    {
        let named = |part: &Node| matches!(part.kind(), "type_identifier" | "identifier");
        if let Some(name) = children(parameter).into_iter().find(named) {
            pattern(file, name, check, label, TYPE_PARAMETER, report);
        }
    }
}

pub fn record_components(record: Node) -> Vec<Node> {
    let Some(parameters) = record.child_by_field_name("parameters") else {
        return Vec::new();
    };
    let mut names = Vec::new();
    for parameter in children(parameters) {
        match parameter.kind() {
            "formal_parameter" => names.extend(parameter.child_by_field_name("name")),
            "spread_parameter" => {
                names.extend(
                    declarators(parameter)
                        .into_iter()
                        .filter_map(|d| d.child_by_field_name("name")),
                );
            }
            _ => {}
        }
    }
    names
}

pub fn pattern_variable(node: Node) -> Option<Node> {
    match node.kind() {
        "instanceof_expression" => node.child_by_field_name("name"),
        "type_pattern" | "record_pattern_component" => named_children(node)
            .into_iter()
            .last()
            .filter(|last| last.kind() == "identifier"),
        _ => None,
    }
}

fn package(file: &SourceFile, node: Node, report: &mut Report) {
    let named = |part: &Node| matches!(part.kind(), "scoped_identifier" | "identifier");
    let Some(name) = named_children(node).into_iter().find(named) else {
        return;
    };
    let text: String = file
        .text_of(name)
        .chars()
        .filter(|c| !c.is_whitespace())
        .collect();
    if !regex(PACKAGE).is_match(&text) {
        let message = format!("Package name '{text}' must match pattern '{PACKAGE}'.");
        report.node(name, &format!("{NAMING}PackageNameCheck"), message);
    }
}

fn google_lower_camel(name: &str) -> bool {
    let (base, suffix) = match name.find('_') {
        Some(at) => name.split_at(at),
        None => (name, ""),
    };
    let mut chars = base.chars();
    let first = chars.next().is_some_and(|c| c.is_ascii_lowercase());
    let second = base
        .chars()
        .nth(1)
        .is_none_or(|c| c.is_ascii_lowercase() || c.is_ascii_digit());
    let rest = base.chars().all(|c| c.is_ascii_alphanumeric());
    let numbered = suffix.is_empty()
        || (base.ends_with(|c: char| c.is_ascii_digit())
            && suffix
                .split('_')
                .skip(1)
                .all(|part| !part.is_empty() && part.chars().all(|c| c.is_ascii_digit())));
    first && second && rest && numbered
}

fn only_between_digits(name: &str) -> bool {
    let chars: Vec<char> = name.chars().collect();
    let mut any = false;
    for (at, c) in chars.iter().enumerate() {
        if *c != '_' {
            continue;
        }
        any = true;
        let before = at > 0 && chars[at - 1].is_ascii_digit();
        let after = chars.get(at + 1).is_some_and(|next| next.is_ascii_digit());
        if !before || !after {
            return false;
        }
    }
    any
}

const GOOGLE: &str = concat!(
    "Non-constant field name '{}' must be lowerCamelCase: start lowercase, contain only letters and digits, ",
    "and not follow a single lowercase letter with an uppercase one."
);
const UNDERSCORE: &str = concat!(
    "Non-constant field name '{}' must be lowerCamelCase, ",
    "with no underscore, not even between digits."
);

fn fields(file: &SourceFile, node: Node, report: &mut Report) {
    if in_interface_or_annotation(node) {
        return;
    }
    let is_static = has_modifier(node, "static");
    if is_static && has_modifier(node, "final") {
        return;
    }
    for name in declarators(node)
        .into_iter()
        .filter_map(|declarator| declarator.child_by_field_name("name"))
    {
        let text = file.text_of(name);
        if !is_static && !google_lower_camel(text) {
            let message = GOOGLE.replace("{}", text);
            report.node(
                name,
                &format!("{NAMING}GoogleNonConstantFieldNameCheck"),
                message,
            );
        }
        if only_between_digits(text) {
            let check = if is_static {
                "StaticVariableName"
            } else {
                "MemberName"
            };
            let source = format!("{NAMING}{check}Check#GoogleNonConstantFieldName");
            report.node(name, &source, UNDERSCORE.replace("{}", text));
        }
    }
}
