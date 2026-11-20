//! The compiler's tree of one file, as the API server sends it: a table of 28 bytes per node, a string table
//! and the file text. Checks walk it the way the JavaScript checks walk the compiler's tree: children by
//! property name, lists, token kinds. A node is its index in the table, which is also how the server names it.
use super::tables::kind::{JSX_TEXT, JS_DOC, SOURCE_FILE};
use super::tables::node_flags::REPARSED;
use super::tables::shape::child_properties;
use super::text::SourceText;
use std::borrow::Cow;
use std::cell::OnceCell;
use std::collections::HashMap;

const HEADER_STRING_OFFSETS: usize = 24;
const HEADER_STRINGS: usize = 28;
const HEADER_EXTENDED: usize = 32;
const HEADER_NODES: usize = 40;
const HEADER_LENGTH: usize = 44;
const NODE_LENGTH: usize = 28;
const DATA_KIND: u32 = 0xc000_0000;
const DATA_CHILDREN: u32 = 0;
const DATA_STRING: u32 = 0x4000_0000;
const DATA_INDEX: u32 = 0x00ff_ffff;
/// The layout this file reads; the server writes its own in the top byte of the first header word.
pub const PROTOCOL: u32 = 5;
pub const NODE_LIST: u32 = u32::MAX;
/// The source file node. Index 0 is an empty sentinel.
pub const ROOT: u32 = 1;

#[derive(Default)]
struct Finder {
    by_end: HashMap<(u32, u32), Vec<u32>>,
    ending: HashMap<u32, Vec<u32>>,
}

pub struct NodeTable {
    bytes: Vec<u8>,
    first: usize,
    count: u32,
    finder: OnceCell<Finder>,
    text: OnceCell<SourceText>,
}

fn word(bytes: &[u8], at: usize) -> u32 {
    u32::from_le_bytes([bytes[at], bytes[at + 1], bytes[at + 2], bytes[at + 3]])
}

impl NodeTable {
    /// Refuses a table in another layout than the one this file reads.
    pub fn read(bytes: Vec<u8>) -> Result<NodeTable, String> {
        if bytes.len() < HEADER_LENGTH {
            return Err(format!("node table of {} bytes is shorter than its header", bytes.len()));
        }
        let protocol = word(&bytes, 0) >> 24;
        if protocol != PROTOCOL {
            return Err(format!("node table has layout {protocol}, the engine reads layout {PROTOCOL}"));
        }
        let first = word(&bytes, HEADER_NODES) as usize;
        if first < HEADER_LENGTH || first > bytes.len() {
            return Err("node table header points outside the table".to_string());
        }
        let count = ((bytes.len() - first) / NODE_LENGTH) as u32;
        Ok(NodeTable { bytes, first, count, finder: OnceCell::new(), text: OnceCell::new() })
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
    fn next(&self, index: u32) -> u32 {
        self.field(index, 12)
    }
    fn raw_parent(&self, index: u32) -> u32 {
        self.field(index, 16)
    }
    pub fn data(&self, index: u32) -> u32 {
        self.field(index, 20)
    }
    /// Node flags (`node_flags` in the tables).
    pub fn flags(&self, index: u32) -> u32 {
        self.field(index, 24)
    }
    /// The node above, skipping the list nodes the table puts between a node and its listed children.
    /// `None` for the source file.
    pub fn parent(&self, index: u32) -> Option<u32> {
        if index <= ROOT {
            return None;
        }
        let parent = self.raw_parent(index);
        Some(if self.kind(parent) == NODE_LIST { self.raw_parent(parent) } else { parent })
    }
    pub fn owner(&self, index: u32) -> u32 {
        self.parent(index).unwrap_or(ROOT)
    }

    /// Direct entries below a node in table order: nodes and list nodes.
    fn entries(&self, index: u32) -> impl Iterator<Item = u32> + '_ {
        let first = index + 1;
        let has = first < self.count && self.raw_parent(first) == index;
        std::iter::successors(has.then_some(first), move |entry| Some(self.next(*entry)).filter(|next| *next != 0))
    }
    /// Elements of a list node.
    pub fn list(&self, list: u32) -> impl Iterator<Item = u32> + '_ {
        let first = list + 1;
        let has = self.data(list) > 0;
        std::iter::successors(has.then_some(first), move |entry| Some(self.next(*entry)).filter(|next| *next != 0))
    }
    /// Children in source order, listed ones included, documentation comments left out: what the compiler's
    /// `forEachChild` visits.
    pub fn children(&self, index: u32) -> impl Iterator<Item = u32> + '_ {
        self.entries(index).flat_map(move |entry| -> Box<dyn Iterator<Item = u32> + '_> {
            if self.kind(entry) == NODE_LIST {
                Box::new(self.list(entry))
            } else if self.kind(entry) == JS_DOC {
                Box::new(std::iter::empty())
            } else {
                Box::new(std::iter::once(entry))
            }
        })
        .filter(move |child| !self.is_reparsed(*child))
    }
    /// Whether the compiler made the node from a documentation comment of a JavaScript file (a parameter's
    /// type from `@param`, a type alias from `@typedef`). The JavaScript compiler's tree has no such nodes,
    /// so `children`, `child` and `listed` leave them out.
    pub fn is_reparsed(&self, index: u32) -> bool {
        self.flags(index) & REPARSED != 0
    }

    /// Whether the compiler added any node to the file: in a JavaScript file, the types of its documentation comments.
    pub fn has_reparsed(&self) -> bool {
        (1..self.count()).any(|index| self.is_reparsed(index))
    }

    fn entry_named(&self, index: u32, name: &str) -> Option<u32> {
        let data = self.data(index);
        let order = child_properties(self.kind(index)).iter().position(|property| *property == name)?;
        // A node whose data is a string or extended data has every property of its kind.
        let mask = if data & DATA_KIND == DATA_CHILDREN { data & 0xff } else { 0xff };
        if mask & (1 << order) == 0 {
            return None;
        }
        let before = (mask & ((1 << order) - 1)).count_ones() as usize;
        self.entries(index).filter(|entry| self.kind(*entry) != JS_DOC).nth(before)
    }
    /// The child a property of the compiler's tree names (`name`, `expression`, `initializer`), when present
    /// and a single node.
    pub fn child(&self, index: u32, name: &str) -> Option<u32> {
        self.entry_named(index, name).filter(|entry| self.kind(*entry) != NODE_LIST && !self.is_reparsed(*entry))
    }
    /// The elements of a list property (`statements`, `members`, `modifiers`); empty when absent.
    pub fn listed(&self, index: u32, name: &str) -> Vec<u32> {
        match self.entry_named(index, name) {
            Some(entry) if self.kind(entry) == NODE_LIST => self.list(entry).filter(|element| !self.is_reparsed(*element)).collect(),
            _ => Vec::new(),
        }
    }
    pub fn has_list(&self, index: u32, name: &str) -> bool {
        self.entry_named(index, name).is_some_and(|entry| self.kind(entry) == NODE_LIST && (self.data(entry) == 0 || self.list(entry).any(|element| !self.is_reparsed(element))))
    }
    pub fn has_modifier(&self, index: u32, kind: u32) -> bool {
        self.listed(index, "modifiers").iter().any(|modifier| self.kind(*modifier) == kind)
    }
    /// Bit `bit` of the node's own data: the yes/no properties and token choices the encoder packs there
    /// (`isTypeOnly` and the `implements` of a heritage clause are bit 24).
    pub fn data_bit(&self, index: u32, bit: u32) -> bool {
        self.data(index) & (1 << bit) != 0
    }
    pub fn data_bits(&self, index: u32, shift: u32, mask: u32) -> u32 {
        (self.data(index) >> shift) & mask
    }

    fn string(&self, number: u32) -> Cow<'_, str> {
        let offsets = word(&self.bytes, HEADER_STRING_OFFSETS) as usize + number as usize * 4;
        let strings = word(&self.bytes, HEADER_STRINGS) as usize;
        let (start, end) = (word(&self.bytes, offsets) as usize, word(&self.bytes, offsets + 4) as usize);
        String::from_utf8_lossy(&self.bytes[strings + start..strings + end])
    }
    fn extended(&self, index: u32, offset: usize) -> u32 {
        word(&self.bytes, word(&self.bytes, HEADER_EXTENDED) as usize + (self.data(index) & DATA_INDEX) as usize + offset)
    }
    /// The `text` of identifiers, literals and template parts: the value, without quotes or escapes.
    pub fn text(&self, index: u32) -> Option<Cow<'_, str>> {
        match self.data(index) & DATA_KIND {
            DATA_STRING => Some(self.string(self.data(index) & DATA_INDEX)),
            DATA_CHILDREN => None,
            _ => Some(self.string(self.extended(index, 0))),
        }
    }
    /// The whole file.
    pub fn source(&self) -> &SourceText {
        self.text.get_or_init(|| {
            let number = self.extended(ROOT, 0);
            let offsets = word(&self.bytes, HEADER_STRING_OFFSETS) as usize + number as usize * 4;
            let strings = word(&self.bytes, HEADER_STRINGS) as usize;
            SourceText::of(&self.bytes[strings + word(&self.bytes, offsets) as usize..strings + word(&self.bytes, offsets + 4) as usize])
        })
    }
    /// Where the first token of the node starts (`getStart()`).
    pub fn start(&self, index: u32) -> u32 {
        let (pos, end, kind) = (self.pos(index), self.end(index), self.kind(index));
        if pos == end && kind != SOURCE_FILE {
            return pos;
        }
        self.source().skip_trivia(pos, kind == JSX_TEXT || is_documentation(kind))
    }
    /// The text of the node from its first token (`getText()`).
    pub fn node_text(&self, index: u32) -> &str {
        self.source().slice(self.start(index), self.end(index))
    }

    fn finder(&self) -> &Finder {
        self.finder.get_or_init(|| {
            let mut finder = Finder::default();
            for index in 0..self.count {
                let kind = self.kind(index);
                if kind != NODE_LIST {
                    finder.by_end.entry((kind, self.end(index))).or_default().push(index);
                    finder.ending.entry(self.end(index)).or_default().push(index);
                }
            }
            finder
        })
    }
    /// The node of this kind that ends at `end` and whose first token starts at `start`: of the nodes that
    /// begin at or before `start`, the innermost one.
    pub fn find(&self, kind: u32, start: u32, end: u32) -> Option<u32> {
        self.finder().by_end.get(&(kind, end))?.iter().copied().filter(|index| self.pos(*index) <= start).max_by_key(|index| self.pos(*index))
    }
    /// The expression that ends at `end` and whose first token starts at `start`, whatever its kind: the
    /// innermost node that begins at or before `start`, and of nodes with one extent the outer one.
    pub fn find_outer(&self, start: u32, end: u32) -> Option<u32> {
        let nodes = self.finder().ending.get(&end)?;
        let pos = nodes.iter().map(|index| self.pos(*index)).filter(|pos| *pos <= start).max()?;
        nodes.iter().copied().find(|index| self.pos(*index) == pos)
    }
    /// The server's name for a node of this table.
    pub fn handle(&self, index: u32, path: &str) -> String {
        format!("{index}.{}.{path}", self.kind(index))
    }
}

fn is_documentation(kind: u32) -> bool {
    (super::tables::kind::FIRST_JS_DOC_NODE..=super::tables::kind::LAST_JS_DOC_NODE).contains(&kind)
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
        bytes[0..4].copy_from_slice(&(PROTOCOL << 24).to_le_bytes());
        bytes[HEADER_NODES..HEADER_NODES + 4].copy_from_slice(&44u32.to_le_bytes());
        for (at, (kind, pos, end, parent)) in nodes.iter().enumerate() {
            let next = nodes.iter().enumerate().skip(at + 1).find(|(_, later)| later.3 == *parent && at > 0).map_or(0, |(later, _)| later as u32);
            let length = if *kind == NODE_LIST { nodes.iter().filter(|later| later.3 == at as u32).count() as u32 } else { 0 };
            for word in [*kind, *pos, *end, next, *parent, length, 0] {
                bytes.extend_from_slice(&word.to_le_bytes());
            }
        }
        NodeTable::read(bytes).expect("table")
    }

    #[test]
    fn another_layout_is_refused() {
        let mut bytes = vec![0u8; 44];
        bytes[0..4].copy_from_slice(&(6u32 << 24).to_le_bytes());
        bytes[HEADER_NODES..HEADER_NODES + 4].copy_from_slice(&44u32.to_le_bytes());
        assert!(NodeTable::read(bytes).is_err_and(|error| error.contains("layout 6")));
        assert!(NodeTable::read(vec![0u8; 10]).is_err());
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
