//! IdentifierName: classes in UpperCamelCase, methods and variables in lowerCamelCase, acronyms as words.
use super::{Context, renames};
use super::fixes::Fix;
use super::hierarchy::{annotation_names, declared_method, super_method};
use crate::engine::source::{children, parent};
use crate::java::helpers::has_modifier;
use tree_sitter::Node;

const NAME: &str = "IdentifierName";
const STATIC_VARIABLE: &str = "Static variables should be named in UPPER_SNAKE_CASE if deeply immutable or lowerCamelCase if not";
const LOWER_CAMEL: &str = "Methods and non-static variables should be named in lowerCamelCase";
const INITIALISM: &str = ", with acronyms treated as words (https://google.github.io/styleguide/javaguide.html#s5.3-camel-case)";
const TYPES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

/// Guava's `CaseFormat`, for the four formats the check converts between.
#[derive(Clone, Copy, PartialEq)]
enum Case {
    LowerUnderscore,
    UpperUnderscore,
    LowerCamel,
    UpperCamel,
}

fn title(word: &str) -> String {
    let mut letters = word.chars();
    match letters.next() {
        Some(first) => format!("{}{}", first.to_ascii_uppercase(), letters.as_str().to_ascii_lowercase()),
        None => String::new(),
    }
}

impl Case {
    fn camel(self) -> bool {
        matches!(self, Case::LowerCamel | Case::UpperCamel)
    }
    fn word(self, word: &str, first: bool) -> String {
        match self {
            Case::LowerUnderscore => word.to_ascii_lowercase(),
            Case::UpperUnderscore => word.to_ascii_uppercase(),
            Case::LowerCamel if first => word.to_ascii_lowercase(),
            Case::LowerCamel | Case::UpperCamel => title(word),
        }
    }
    /// `CaseFormat.to`, with its habit of starting over while no word has been cut off yet.
    fn to(self, target: Case, text: &str) -> String {
        if self == target {
            return text.to_string();
        }
        let boundary = |letter: char| if self.camel() { letter.is_ascii_uppercase() } else { letter == '_' };
        let separator = if target.camel() { "" } else { "_" };
        let skip = if self.camel() { 0 } else { 1 };
        let mut out = String::new();
        let mut from = 0;
        for (at, letter) in text.char_indices() {
            if !boundary(letter) {
                continue;
            }
            if from == 0 {
                out = target.word(&text[from..at], true);
            } else {
                out.push_str(&target.word(&text[from..at], false));
            }
            out.push_str(separator);
            from = at + skip;
        }
        if from == 0 { target.word(text, true) } else { out + &target.word(&text[from..], false) }
    }
}

/// Where `([A-Z]{2,})([A-Z][^A-Z]|$)` matches from a place on: the end of the first group and of the whole match.
fn initialism(letters: &[char], at: usize) -> Option<(usize, usize)> {
    let run = letters[at..].iter().take_while(|letter| letter.is_ascii_uppercase()).count();
    if run >= 2 && at + run == letters.len() {
        Some((at + run, at + run))
    } else if run >= 3 {
        Some((at + run - 1, at + run + 1))
    } else {
        None
    }
}

fn has_initialism(name: &str) -> bool {
    let letters: Vec<char> = name.chars().collect();
    (0..letters.len()).any(|at| initialism(&letters, at).is_some())
}

pub(super) fn fix_initialisms(name: &str) -> String {
    let letters: Vec<char> = name.chars().collect();
    let mut out = String::new();
    let mut at = 0;
    while at < letters.len() {
        match initialism(&letters, at) {
            Some((group, end)) => {
                out.push_str(&title(&letters[at..group].iter().collect::<String>()));
                out.extend(&letters[group..end]);
                at = end;
            }
            None => {
                out.push(letters[at]);
                at += 1;
            }
        }
    }
    out
}

fn underscores_between_digits(name: &str) -> bool {
    let letters: Vec<char> = name.chars().collect();
    if name.starts_with('_') || name.ends_with('_') {
        return false;
    }
    (1..letters.len().saturating_sub(1)).all(|at| letters[at] != '_' || (letters[at - 1].is_ascii_digit() && letters[at + 1].is_ascii_digit()))
}

fn starts_upper(name: &str) -> bool {
    name.chars().next().is_some_and(char::is_uppercase)
}

fn lower_camel(name: &str) -> bool {
    underscores_between_digits(name) && !starts_upper(name) && !has_initialism(name)
}

fn all_of(name: &str, upper: bool) -> bool {
    !name.is_empty()
        && name.chars().all(|letter| letter.is_ascii_digit() || matches!(letter, '$' | '_') || if upper { letter.is_ascii_uppercase() } else { letter.is_ascii_lowercase() })
}

fn renamed(name: &str, static_variable: bool) -> String {
    if !static_variable && all_of(name, true) {
        return Case::UpperUnderscore.to(Case::LowerCamel, name);
    }
    if all_of(name, false) {
        return Case::LowerUnderscore.to(Case::LowerCamel, name);
    }
    let joined: String = name.split('_').map(|part| Case::LowerCamel.to(Case::UpperCamel, part)).collect();
    Case::UpperCamel.to(Case::LowerCamel, &joined)
}

fn renamed_class(name: &str) -> String {
    if all_of(name, false) {
        return Case::LowerUnderscore.to(Case::UpperCamel, name);
    }
    Case::LowerCamel.to(Case::UpperCamel, &name.replace('_', ""))
}

/// Private, or inside something private, an anonymous class or a class declared in a method.
pub fn effectively_private(node: Node) -> bool {
    let mut current = Some(node);
    while let Some(at) = current {
        let holder = parent(at);
        let hidden = match at.kind() {
            "class_body" => holder.is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant")),
            kind if TYPES.contains(&kind) => has_modifier(at, "private") || holder.is_some_and(|holder| !holder.kind().ends_with("_body") && holder.kind() != "program" && holder.kind() != "enum_body_declarations"),
            "method_declaration" | "constructor_declaration" | "field_declaration" => has_modifier(at, "private"),
            _ => false,
        };
        if hidden {
            return true;
        }
        current = holder;
    }
    false
}

fn class_name(context: &Context, node: Node) {
    let Some(name_node) = node.child_by_field_name("name") else { return };
    let name = context.text(name_node);
    if name.is_empty() || (underscores_between_digits(name) && starts_upper(name) && !has_initialism(name)) {
        return;
    }
    let plain = renamed_class(name);
    let suggested = fix_initialisms(&plain);
    let fixable = suggested != name && effectively_private(node);
    let mut text = format!("Classes should be named in UpperCamelCase{}", if suggested == plain { "" } else { INITIALISM });
    let fixes: Vec<Fix> = if fixable { vec![renames::rename_class(context, context.file.tree.root_node(), node, name_node, &suggested)] } else { Vec::new() };
    if !fixable {
        text.push_str(&format!("; did you mean '{suggested}'?"));
    }
    let keyword = children(node).into_iter().find(|part| matches!(part.kind(), "class" | "interface" | "enum" | "record" | "@interface"));
    let at = keyword.map_or(node.start_byte(), |keyword| keyword.start_byte() + usize::from(keyword.kind() == "@interface"));
    context.report_fixed(NAME, node, at, &text, &fixes);
}

fn method_name(context: &Context, node: Node) {
    let Some(name_node) = node.child_by_field_name("name") else { return };
    let name = context.text(name_node);
    if lower_camel(name) || name.starts_with("parametersFor") || has_modifier(node, "native") {
        return;
    }
    let simple = |written: &str| written.rsplit('.').next().unwrap_or(written).to_string();
    let own: Vec<String> = annotation_names(context, node).into_iter().map(simple).collect();
    if own.iter().any(|name| name.contains("Test") || matches!(name.as_str(), "Ignore" | "Theory" | "Property" | "Benchmark" | "Macrobenchmark" | "Footprint")) {
        return;
    }
    let owner = parent(node).and_then(parent);
    if owner.is_some_and(|owner| annotation_names(context, owner).into_iter().any(|name| simple(name) == "Implements")) {
        return;
    }
    let parameters = node.child_by_field_name("parameters").map_or(0, |list| list.named_child_count());
    let returns = node.child_by_field_name("type").map(|kind| context.text(kind));
    if name.starts_with("test") && parameters == 0 && has_modifier(node, "public") && returns == Some("void") {
        return;
    }
    if node.kind() == "method_declaration" {
        let Some((origin, declared)) = declared_method(context, node) else { return };
        if super_method(context, origin, declared).is_some() {
            return;
        }
    }
    let plain = renamed(name, false);
    let suggested = fix_initialisms(&plain);
    let fixable = suggested != name && effectively_private(node);
    let mut text = format!("{LOWER_CAMEL}{}, but {name} is not", if suggested == plain { "" } else { INITIALISM });
    let fixes: Vec<Fix> = if fixable { vec![renames::rename_method(context, context.file.tree.root_node(), node, name_node, &suggested)] } else { Vec::new() };
    if !fixable {
        text.push_str(&format!("; did you mean '{suggested}'?"));
    }
    context.report_fixed(NAME, node, name_node.start_byte(), &text, &fixes);
}

#[derive(PartialEq)]
enum Variable {
    Static,
    Field,
    Local,
    Parameter,
}

/// A parameter that keeps the name the method it overrides gave it, or whose overridden method has no names to compare with.
fn named_by_super(context: &Context, parameter: Node, name: &str) -> bool {
    let Some(method) = parent(parameter).and_then(parent).filter(|method| method.kind() == "method_declaration") else { return false };
    let place = parameter.prev_named_sibling().map_or(0, |_| {
        let mut count = 0;
        let mut current = parameter.prev_named_sibling();
        while let Some(before) = current {
            count += usize::from(matches!(before.kind(), "formal_parameter" | "spread_parameter"));
            current = before.prev_named_sibling();
        }
        count
    });
    let Some((origin, declared)) = declared_method(context, method) else { return true };
    let Some((_, above)) = super_method(context, origin, declared) else { return false };
    let synthetic = |name: &String| {
        ["arg", "this$", "x"].iter().any(|start| name.strip_prefix(start).is_some_and(|rest| !rest.is_empty() && rest.chars().all(|digit| digit.is_ascii_digit())))
    };
    above.names.is_empty() || above.names.iter().any(synthetic) || above.names.get(place).is_some_and(|given| given == name)
}

fn variable_name(context: &Context, matched: Node, name_node: Node, kind: Variable, private: bool) {
    let name = context.text(name_node);
    let is_static = kind == Variable::Static;
    if all_of(name, true) || lower_camel(name) || name == "serialVersionUID" {
        return;
    }
    let plain = renamed(name, is_static);
    let suggested = fix_initialisms(&plain);
    let fixable = suggested != name && (private || kind == Variable::Local);
    let mut text = format!("{}{}, but {name} is not", if is_static { STATIC_VARIABLE } else { LOWER_CAMEL }, if suggested == plain { "" } else { INITIALISM });
    let fixes: Vec<Fix> = if fixable { vec![renames::rename_variable(context, context.file.tree.root_node(), matched, name_node, &suggested)] } else { Vec::new() };
    if !fixable {
        text.push_str(&format!("; did you mean '{suggested}'?"));
    }
    // javac places an enum constant where its annotations start.
    let at = if matched.kind() == "enum_constant" { matched.start_byte() } else { name_node.start_byte() };
    context.report_fixed(NAME, matched, at, &text, &fixes);
}

pub fn identifier_name(context: &Context, node: Node) {
    let name = node.child_by_field_name("name");
    let holder = parent(node);
    let held_by = |kind: &str| holder.is_some_and(|holder| holder.kind() == kind);
    match node.kind() {
        kind if TYPES.contains(&kind) => class_name(context, node),
        "method_declaration" | "annotation_type_element_declaration" => method_name(context, node),
        "enum_constant" => {
            if let Some(name) = name {
                variable_name(context, node, name, Variable::Static, false);
            }
        }
        "variable_declarator" => {
            let (Some(name), Some(holder)) = (name, holder) else { return };
            match holder.kind() {
                "field_declaration" => {
                    let in_interface = parent(holder).is_some_and(|body| matches!(body.kind(), "interface_body" | "annotation_type_body"));
                    let kind = if in_interface || has_modifier(holder, "static") { Variable::Static } else { Variable::Field };
                    variable_name(context, node, name, kind, has_modifier(holder, "private"));
                }
                "constant_declaration" => variable_name(context, node, name, Variable::Static, false),
                "local_variable_declaration" => variable_name(context, node, name, Variable::Local, false),
                "spread_parameter" => {
                    if !named_by_super(context, holder, context.text(name)) {
                        variable_name(context, node, name, Variable::Parameter, false);
                    }
                }
                _ => {}
            }
        }
        "formal_parameter" => {
            let Some(name) = name else { return };
            let owner = holder.and_then(parent);
            if owner.is_some_and(|owner| owner.kind() == "record_declaration") {
                variable_name(context, node, name, Variable::Field, true);
            } else if !named_by_super(context, node, context.text(name)) {
                variable_name(context, node, name, Variable::Parameter, false);
            }
        }
        "catch_formal_parameter" | "resource" | "enhanced_for_statement" | "type_pattern" | "instanceof_expression" => {
            if let Some(name) = name.or_else(|| children(node).into_iter().rfind(|part| part.kind() == "identifier").filter(|_| node.kind() == "type_pattern")) {
                variable_name(context, node, name, Variable::Local, false);
            }
        }
        "identifier" if held_by("inferred_parameters") => variable_name(context, node, node, Variable::Parameter, false),
        "identifier" if held_by("lambda_expression") && holder.and_then(|holder| holder.child_by_field_name("parameters")) == Some(node) => {
            variable_name(context, node, node, Variable::Parameter, false)
        }
        _ => {}
    }
}
