//! The compiler's node table of one file, as the API server sends it: 28 bytes per node.
//! The engine does not walk this tree. It only uses it to name a compiler node (`index.kind.path`) for a
//! node of its own tree, and to read the kind and extent of a node the compiler names in an answer.
use std::collections::HashMap;

const HEADER_NODES: usize = 40;
const NODE_LENGTH: usize = 28;
pub const NODE_LIST: u32 = u32::MAX;

pub struct NodeTable {
    bytes: Vec<u8>,
    first: usize,
    count: u32,
    by_end: HashMap<(u32, u32), Vec<u32>>,
    ending: HashMap<u32, Vec<u32>>,
}

fn word(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

impl NodeTable {
    pub fn of(bytes: Vec<u8>) -> NodeTable {
        let first = word(&bytes, HEADER_NODES) as usize;
        let count = ((bytes.len() - first) / NODE_LENGTH) as u32;
        let mut table = NodeTable { bytes, first, count, by_end: HashMap::new(), ending: HashMap::new() };
        for index in 0..count {
            let kind = table.kind(index);
            if kind != NODE_LIST {
                table.by_end.entry((kind, table.end(index))).or_default().push(index);
                table.ending.entry(table.end(index)).or_default().push(index);
            }
        }
        table
    }
    fn field(&self, index: u32, offset: usize) -> u32 {
        word(&self.bytes, self.first + index as usize * NODE_LENGTH + offset)
    }
    pub fn count(&self) -> u32 {
        self.count
    }
    pub fn kind(&self, index: u32) -> u32 {
        self.field(index, 0)
    }
    /// Start including the comments and spaces before the node, as the compiler counts it.
    pub fn pos(&self, index: u32) -> u32 {
        self.field(index, 4)
    }
    pub fn end(&self, index: u32) -> u32 {
        self.field(index, 8)
    }
    pub fn parent(&self, index: u32) -> u32 {
        self.field(index, 16)
    }
    /// The node of this kind that ends at `end` and whose first token starts at `start`: of the nodes that
    /// begin at or before `start`, the innermost one.
    pub fn find(&self, kind: u32, start: u32, end: u32) -> Option<u32> {
        self.by_end.get(&(kind, end))?.iter().copied().filter(|index| self.pos(*index) <= start).max_by_key(|index| self.pos(*index))
    }
    /// The expression that ends at `end` and whose first token starts at `start`, whatever its kind: the
    /// innermost node that begins at or before `start`, and of nodes with one extent the outer one.
    pub fn find_outer(&self, start: u32, end: u32) -> Option<u32> {
        let nodes = self.ending.get(&end)?;
        let pos = nodes.iter().map(|index| self.pos(*index)).filter(|pos| *pos <= start).max()?;
        nodes.iter().copied().find(|index| self.pos(*index) == pos)
    }
    /// The node above, skipping the list nodes the table puts between a node and its listed children.
    pub fn owner(&self, index: u32) -> u32 {
        let parent = self.parent(index);
        if self.kind(parent) == NODE_LIST { self.parent(parent) } else { parent }
    }
    /// Children in source order, listed ones included.
    pub fn children(&self, index: u32) -> impl Iterator<Item = u32> + '_ {
        let end = self.end(index);
        (index + 1..self.count).take_while(move |child| self.end(*child) <= end).filter(move |child| self.kind(*child) != NODE_LIST && self.owner(*child) == index)
    }
}

/// `index.kind.path`, split.
pub fn parse_handle(handle: &str) -> Option<(u32, u32, &str)> {
    let (index, rest) = handle.split_once('.')?;
    let (kind, path) = rest.split_once('.')?;
    Some((index.parse().ok()?, kind.parse().ok()?, path))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn table(nodes: &[(u32, u32, u32, u32)]) -> NodeTable {
        let mut bytes = vec![0u8; 44];
        bytes[HEADER_NODES..HEADER_NODES + 4].copy_from_slice(&44u32.to_le_bytes());
        for (kind, pos, end, parent) in nodes {
            for word in [*kind, *pos, *end, 0, *parent, 0, 0] {
                bytes.extend_from_slice(&word.to_le_bytes());
            }
        }
        NodeTable::of(bytes)
    }

    #[test]
    fn finds_the_innermost_node_that_begins_before_the_first_token() {
        // `x = y = z`: both assignments end at 9; the inner one starts after the first `=`.
        let nodes = table(&[(307, 0, 9, 0), (226, 0, 9, 0), (79, 0, 1, 1), (226, 3, 9, 1), (79, 3, 5, 3), (79, 7, 9, 3)]);
        assert_eq!(nodes.find(226, 0, 9), Some(1));
        assert_eq!(nodes.find(226, 4, 9), Some(3));
        assert_eq!(nodes.find(79, 8, 9), Some(5));
        assert_eq!(nodes.find(212, 0, 9), None);
    }

    #[test]
    fn an_expression_is_the_outer_node_of_its_extent() {
        let nodes = table(&[(307, 0, 9, 0), (244, 0, 9, 0), (213, 0, 9, 1), (79, 0, 1, 2), (212, 2, 8, 2), (79, 2, 3, 4), (79, 4, 8, 4)]);
        assert_eq!(nodes.find_outer(2, 8), Some(4));
        assert_eq!(nodes.find_outer(4, 8), Some(6));
    }

    #[test]
    fn listed_children_belong_to_the_node_that_owns_the_list() {
        let nodes = table(&[(307, 0, 30, 0), (265, 0, 30, 0), (NODE_LIST, 0, 6, 1), (94, 0, 6, 2), (79, 16, 20, 1)]);
        assert_eq!(nodes.children(1).collect::<Vec<_>>(), vec![3, 4]);
    }

    #[test]
    fn handles_split_at_the_first_two_dots() {
        assert_eq!(parse_handle("12.265./src/a.b.ts"), Some((12, 265, "/src/a.b.ts")));
        assert_eq!(parse_handle("12"), None);
    }
}
