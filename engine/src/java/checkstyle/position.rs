use super::comments::Comment;
use tree_sitter::Node;

const DECLARATIONS: &[&str] = &[
    "package_declaration",
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "annotation_type_declaration",
    "method_declaration",
    "constructor_declaration",
    "compact_constructor_declaration",
    "field_declaration",
    "constant_declaration",
    "enum_constant",
    "annotation_type_element_declaration",
    "module_declaration",
];

/// The declaration a Javadoc comment documents: the next token after it, skipping blanks and other non-Javadoc
/// comments, must start a declaration.
pub fn documented<'t>(text: &str, root: Node<'t>, comment: &Comment) -> Option<Node<'t>> {
    let bytes = text.as_bytes();
    let mut at = comment.end;
    loop {
        while at < bytes.len() && bytes[at].is_ascii_whitespace() {
            at += 1;
        }
        if bytes[at..].starts_with(b"//") {
            while at < bytes.len() && bytes[at] != b'\n' {
                at += 1;
            }
        } else if bytes[at..].starts_with(b"/*") && !bytes[at..].starts_with(b"/**")
            || bytes[at..].starts_with(b"/**/")
        {
            at += 2;
            while at < bytes.len() && !bytes[at..].starts_with(b"*/") {
                at += 1;
            }
            at += 2;
        } else {
            break;
        }
    }
    if at >= bytes.len() {
        return None;
    }
    let mut node = root.descendant_for_byte_range(at, at)?;
    loop {
        if node.start_byte() != at {
            return None;
        }
        if DECLARATIONS.contains(&node.kind()) {
            return Some(node);
        }
        node = node.parent()?;
    }
}
