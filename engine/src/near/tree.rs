pub use super::text::{compare_text, json_text};
use serde::Deserialize;
use std::fmt::Write;
use std::rc::Rc;

pub type Text = Rc<str>;
pub type Tree = Rc<Node>;

#[derive(Clone, Default)]
pub struct Node {
    pub kind: Text,
    pub children: Vec<Tree>,
    pub value: Option<Text>,
    pub text: Option<Text>,
    pub binding: Option<Text>,
    pub literal: Option<Text>,
    pub commutes: Option<bool>,
    pub start: Option<i64>,
    pub end: Option<i64>,
}

#[derive(Deserialize)]
pub struct RawNode {
    kind: String,
    #[serde(default)]
    children: Vec<RawNode>,
    #[serde(default, deserialize_with = "strict")]
    value: Option<String>,
    #[serde(default, deserialize_with = "strict")]
    text: Option<String>,
    #[serde(default, deserialize_with = "strict")]
    binding: Option<String>,
    #[serde(default, deserialize_with = "strict")]
    literal: Option<String>,
    #[serde(default, deserialize_with = "strict")]
    commutes: Option<bool>,
    #[serde(default, deserialize_with = "strict")]
    start: Option<i64>,
    #[serde(default, deserialize_with = "strict")]
    end: Option<i64>,
}

fn strict<'de, D: serde::Deserializer<'de>, Value: Deserialize<'de>>(input: D) -> Result<Option<Value>, D::Error> {
    Value::deserialize(input).map(Some)
}

const STATEMENTS: [&str; 13] = [
    "block", "if", "return", "throw", "break", "continue", "evaluate", "declare", "for", "while", "do", "foreach",
    "statement",
];
const EXPRESSIONS: [&str; 14] = [
    "name", "literal", "this", "binary", "unary", "update", "assign", "conditional", "call", "new", "member", "index",
    "lambda", "expression",
];

fn arity(kind: &str) -> Option<usize> {
    Some(match kind {
        "function" | "if" | "declare" | "conditional" => 3,
        "parameter" | "while" | "do" | "binary" | "assign" | "index" | "lambda" => 2,
        "return" | "throw" | "evaluate" | "unary" | "update" | "member" => 1,
        "for" | "foreach" => 4,
        "break" | "continue" | "name" | "literal" | "this" | "type" | "none" => 0,
        _ => return None,
    })
}

fn block_slots(kind: &str) -> &'static [usize] {
    match kind {
        "if" | "while" => &[1],
        "for" => &[0, 2, 3],
        "do" => &[0],
        "foreach" => &[3],
        "function" => &[2],
        _ => &[],
    }
}

pub fn text(value: Option<String>) -> Option<Text> {
    value.map(Text::from)
}

const PROTOTYPE_NAMES: [&str; 12] = [
    "constructor", "__defineGetter__", "__defineSetter__", "hasOwnProperty", "__lookupGetter__", "__lookupSetter__",
    "isPrototypeOf", "propertyIsEnumerable", "toString", "valueOf", "__proto__", "toLocaleString",
];

pub fn normalized(raw: RawNode) -> Tree {
    assert!(!PROTOTYPE_NAMES.contains(&raw.kind.as_str()), "near-duplicate tree: {} is not a node kind", raw.kind);
    let children: Vec<Tree> = raw.children.into_iter().map(normalized).collect();
    if let Some(count) = arity(&raw.kind) {
        assert!(children.len() == count, "near-duplicate tree: {} needs {count} children", raw.kind);
    }
    for slot in block_slots(&raw.kind) {
        assert!(&*children[*slot].kind == "block", "near-duplicate tree: child {slot} of {} must be a block", raw.kind);
    }
    if raw.kind == "name" {
        assert!(matches!(raw.binding.as_deref(), Some("bound" | "free")), "near-duplicate tree: a name needs binding");
    }
    Rc::new(Node {
        kind: raw.kind.into(),
        children,
        value: text(raw.value),
        text: text(raw.text),
        binding: text(raw.binding),
        literal: text(raw.literal),
        commutes: raw.commutes,
        start: raw.start,
        end: raw.end,
    })
}

impl Node {
    pub fn is(&self, kind: &str) -> bool {
        &*self.kind == kind
    }

    pub fn value_is(&self, value: &str) -> bool {
        self.value.as_deref() == Some(value)
    }

    pub fn child(&self, index: usize) -> &Tree {
        self.children.get(index).expect("near-duplicate tree: a node the tree shape guarantees is missing")
    }

    pub fn is_bound(&self) -> bool {
        self.is("name") && self.binding.as_deref() == Some("bound")
    }

    pub fn category(&self) -> &'static str {
        if STATEMENTS.contains(&&*self.kind) {
            "statement"
        } else if EXPRESSIONS.contains(&&*self.kind) {
            "expression"
        } else if self.is("type") {
            "type"
        } else {
            "structure"
        }
    }

    pub fn is_jump(&self) -> bool {
        matches!(&*self.kind, "return" | "throw" | "break" | "continue")
    }
}

pub fn is_jump(node: Option<&Tree>) -> bool {
    node.is_some_and(|node| node.is_jump())
}

pub fn make(kind: &str, children: Vec<Tree>) -> Node {
    Node { kind: kind.into(), children, ..Node::default() }
}

pub fn none() -> Tree {
    Rc::new(make("none", Vec::new()))
}

pub fn with_children(node: &Node, children: Vec<Tree>) -> Tree {
    Rc::new(Node { children, ..node.clone() })
}

pub fn spanning(mut node: Node, first: &Node, last: &Node) -> Tree {
    node.start = first.start;
    node.end = last.end;
    Rc::new(node)
}

pub fn same_tree(left: &Tree, right: &Tree) -> bool {
    Rc::ptr_eq(left, right)
        || (left.kind == right.kind
            && left.value == right.value
            && left.binding == right.binding
            && left.literal == right.literal
            && left.commutes == right.commutes
            && left.children.len() == right.children.len()
            && left.children.iter().zip(&right.children).all(|(one, other)| same_tree(one, other)))
}

pub fn size_of(node: &Node) -> usize {
    usize::from(!node.is("none")) + node.children.iter().map(|child| size_of(child)).sum::<usize>()
}

pub fn contains(node: &Tree, predicate: &dyn Fn(&Tree) -> bool, skip: &dyn Fn(&Tree) -> bool) -> bool {
    predicate(node) || (!skip(node) && node.children.iter().any(|child| contains(child, predicate, skip)))
}

pub fn pre_order<'a>(node: &'a Tree, nodes: &mut Vec<&'a Tree>) {
    nodes.push(node);
    for child in &node.children {
        pre_order(child, nodes);
    }
}

pub fn write_json(out: &mut String, node: &Node) {
    out.push_str("{\"kind\":");
    json_text(out, Some(&node.kind));
    out.push_str(",\"children\":[");
    for (index, child) in node.children.iter().enumerate() {
        if index > 0 {
            out.push(',');
        }
        write_json(out, child);
    }
    out.push(']');
    for (name, field) in
        [("value", &node.value), ("text", &node.text), ("binding", &node.binding), ("literal", &node.literal)]
    {
        if let Some(field) = field {
            write!(out, ",\"{name}\":").expect("write");
            json_text(out, Some(field));
        }
    }
    if let Some(commutes) = node.commutes {
        write!(out, ",\"commutes\":{commutes}").expect("write");
    }
    for (name, field) in [("start", node.start), ("end", node.end)] {
        if let Some(field) = field {
            write!(out, ",\"{name}\":{field}").expect("write");
        }
    }
    out.push('}');
}
