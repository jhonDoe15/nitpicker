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
    let mut current = crate::engine::source::parent(node);
    while let Some(parent) = current {
        if kinds.contains(&parent.kind()) {
            return Some(parent);
        }
        current = crate::engine::source::parent(parent);
    }
    None
}

#[derive(Default)]
struct IdHasher(u64);

impl std::hash::Hasher for IdHasher {
    fn finish(&self) -> u64 {
        self.0
    }
    fn write(&mut self, bytes: &[u8]) {
        for byte in bytes {
            self.write_usize(usize::from(*byte));
        }
    }
    fn write_usize(&mut self, id: usize) {
        let mixed = (self.0 ^ id as u64).wrapping_mul(0x9E37_79B9_7F4A_7C15);
        self.0 = mixed ^ (mixed >> 29);
    }
}

type Parents =
    std::collections::HashMap<usize, Node<'static>, std::hash::BuildHasherDefault<IdHasher>>;

thread_local! {
    static PARENTS: std::cell::RefCell<Option<Parents>> = const { std::cell::RefCell::new(None) };
}

/// While it lives, `parent` answers from a table of the tree it was made for. tree-sitter finds a parent by
/// walking down from the root, which is slow for the many walks up that name and type lookups make.
pub struct ParentTable;

impl ParentTable {
    /// The table serves the current thread and must be dropped before the tree is.
    pub fn of(root: Node) -> ParentTable {
        let mut table = Parents::default();
        let mut cursor = root.walk();
        let mut above: Vec<Node> = Vec::new();
        'walk: loop {
            let node = cursor.node();
            if let Some(parent) = above.last() {
                // SAFETY: the entry is only read while the table lives, and the table is dropped before the tree.
                table.insert(node.id(), unsafe {
                    std::mem::transmute::<Node<'_>, Node<'static>>(*parent)
                });
            }
            if cursor.goto_first_child() {
                above.push(node);
                continue;
            }
            loop {
                if cursor.goto_next_sibling() {
                    break;
                }
                if !cursor.goto_parent() {
                    break 'walk;
                }
                above.pop();
            }
        }
        PARENTS.with(|parents| *parents.borrow_mut() = Some(table));
        ParentTable
    }
}

impl Drop for ParentTable {
    fn drop(&mut self) {
        PARENTS.with(|parents| *parents.borrow_mut() = None);
    }
}

/// The parent of a node, from the table of the current thread when there is one.
pub fn parent<'t>(node: Node<'t>) -> Option<Node<'t>> {
    let known = PARENTS.with(|parents| {
        parents
            .borrow()
            .as_ref()
            .map(|table| table.get(&node.id()).copied())
    });
    match known {
        Some(Some(parent)) => Some(parent),
        _ => node.parent(),
    }
}
