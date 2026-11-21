//! Literals the TypeScript compiler refuses outside a script (`.js`, `.cjs`, `.jsx`): legacy octal numbers,
//! decimals with a leading zero, and octal or `\8` `\9` escapes in strings. oxc reads them without a diagnostic.
use super::super::tree::Tree;
use oxc_ast::AstKind;

fn is_script(display: &str) -> bool {
    let lower = display.to_ascii_lowercase();
    [".js", ".cjs", ".jsx"].iter().any(|extension| lower.ends_with(extension))
}

fn is_sloppy_number(raw: &str) -> bool {
    let mut characters = raw.chars();
    characters.next() == Some('0') && characters.next().is_some_and(|next| next.is_ascii_digit())
}

fn is_sloppy_string(raw: &str) -> bool {
    let mut characters = raw.chars();
    while let Some(character) = characters.next() {
        if character != '\\' {
            continue;
        }
        match characters.next() {
            Some('1'..='9') => return true,
            Some('0') if characters.clone().next().is_some_and(|next| next.is_ascii_digit()) => return true,
            _ => {}
        }
    }
    false
}

pub fn has_sloppy_literal(text: &str, tree: &Tree, display: &str) -> bool {
    if is_script(display) {
        return false;
    }
    (0..tree.nodes.len() as u32).any(|index| {
        let node = &tree.nodes[index as usize];
        let raw = &text[node.start as usize..node.end as usize];
        match node.kind {
            AstKind::NumericLiteral(_) => is_sloppy_number(raw),
            AstKind::StringLiteral(_) => {
                !matches!(tree.parent(index).map(|parent| tree.kind(parent)), Some(AstKind::JSXAttribute(_)))
                    && is_sloppy_string(raw)
            }
            _ => false,
        }
    })
}
