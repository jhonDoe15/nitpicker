//! Checks on how things are named and imported.
use super::Context;
use crate::engine::source::children;
use tree_sitter::Node;

/// The terms of a Java name: split at underscores, at a lower-to-upper step and before trailing digits, in lower case.
pub fn lowercase_terms(name: &str) -> Vec<String> {
    if !name.is_empty() && name.chars().all(|letter| letter == '_') {
        return vec![name.to_string()];
    }
    let letters: Vec<char> = name.chars().collect();
    let digits_from = letters.len() - letters.iter().rev().take_while(|letter| letter.is_ascii_digit()).count();
    let mut terms = vec![String::new()];
    for (at, letter) in letters.iter().enumerate() {
        let before = at.checked_sub(1).map(|index| letters[index]);
        let step = before.is_some_and(|before| (before.is_ascii_lowercase() || before.is_ascii_digit()) && letter.is_ascii_uppercase());
        let digits = at == digits_from && at < letters.len() && before.is_some_and(|before| !before.is_ascii_digit() && before != '_');
        if *letter == '_' || step || digits {
            terms.push(String::new());
        }
        if *letter != '_' {
            terms.last_mut().expect("a term").extend(letter.to_lowercase());
        }
    }
    terms.retain(|term| !term.is_empty());
    terms
}

fn upper_first(term: &str) -> String {
    let mut letters = term.chars();
    letters.next().map(|first| first.to_ascii_uppercase().to_string() + letters.as_str()).unwrap_or_default()
}

pub fn type_parameter_naming(context: &Context, node: Node) {
    if node.kind() != "type_parameter" {
        return;
    }
    let Some(name_node) = children(node).into_iter().find(|part| matches!(part.kind(), "type_identifier" | "identifier")) else { return };
    let name = context.text(name_node);
    let mut letters = name.chars();
    let single = letters.next().is_some_and(|first| first.is_ascii_uppercase()) && letters.all(|rest| rest.is_ascii_digit());
    if single {
        return;
    }
    let message = if name.ends_with('T') {
        if lowercase_terms(name).iter().map(|term| upper_first(term)).collect::<String>() == name {
            return;
        }
        format!("Type Parameters should be an UpperCamelCase name followed by the letter 'T'. {name} ends in T, but is not a valid UpperCamelCase name")
    } else {
        format!("Type Parameter {name} must be a single letter with an optional numeric suffix, or an UpperCamelCase name followed by the letter 'T'.")
    };
    context.report("TypeParameterNaming", node, name_node.start_byte(), &message);
}

pub fn wildcard_import(context: &Context, node: Node) {
    if node.kind() != "program" {
        return;
    }
    let first = children(node)
        .into_iter()
        .find(|part| part.kind() == "import_declaration" && children(*part).iter().any(|inner| inner.kind() == "asterisk"));
    if let Some(first) = first {
        context.report("WildcardImport", first, first.start_byte(), "Wildcard imports, static or otherwise, should not be used");
    }
}
