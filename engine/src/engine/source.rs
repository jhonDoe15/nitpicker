use tree_sitter::{Node, Tree};

pub struct SourceFile {
    pub path: String,
    pub text: String,
    pub tree: Tree,
}

#[derive(Clone)]
pub struct Token {
    pub kind: u32,
    pub line: u32,
}

impl SourceFile {
    pub fn text_of(&self, node: Node) -> &str {
        &self.text[node.byte_range()]
    }
    pub fn line(&self, node: Node) -> usize {
        node.start_position().row + 1
    }
    pub fn column(&self, node: Node) -> usize {
        node.start_position().column + 1
    }
}

/// Depth-first walk over every node, named or not.
pub fn walk<'t>(root: Node<'t>, mut visit: impl FnMut(Node<'t>)) {
    let mut cursor = root.walk();
    loop {
        visit(cursor.node());
        if cursor.goto_first_child() {
            continue;
        }
        loop {
            if cursor.goto_next_sibling() {
                break;
            }
            if !cursor.goto_parent() {
                return;
            }
        }
    }
}

pub fn children<'t>(node: Node<'t>) -> Vec<Node<'t>> {
    let mut cursor = node.walk();
    node.children(&mut cursor).collect()
}

pub fn named_children<'t>(node: Node<'t>) -> Vec<Node<'t>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).collect()
}

pub fn ancestor<'t>(node: Node<'t>, kinds: &[&str]) -> Option<Node<'t>> {
    let mut current = node.parent();
    while let Some(parent) = current {
        if kinds.contains(&parent.kind()) {
            return Some(parent);
        }
        current = parent.parent();
    }
    None
}
