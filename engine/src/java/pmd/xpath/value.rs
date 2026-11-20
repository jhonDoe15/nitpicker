//! The values XPath expressions work with.
use super::parse::Lambda;
use std::rc::Rc;

#[derive(Debug)]
pub struct Xml {
    pub name: &'static str,
    pub text: String,
    pub number: Option<i64>,
    pub children: Vec<Rc<Xml>>,
}

pub type Env = Vec<(u32, Seq)>;

pub enum Function {
    Inline(Rc<Lambda>, Env),
    Named(Rc<str>, usize),
}

#[derive(Clone)]
pub enum Item {
    /// The document node above the compilation unit.
    Doc,
    Node(u32),
    Attr(u32, &'static str),
    Text(Rc<str>),
    Flag(bool),
    Whole(i64),
    Real(f64),
    Function(Rc<Function>),
    Map(Rc<Vec<(Item, Seq)>>),
    Array(Rc<Vec<Seq>>),
    Xml(Rc<Xml>),
}

impl Item {
    pub fn text(value: &str) -> Item {
        Item::Text(Rc::from(value))
    }

    pub fn is_node(&self) -> bool {
        matches!(self, Item::Doc | Item::Node(_) | Item::Attr(..) | Item::Xml(_))
    }

    /// Where a tree node stands in document order.
    pub fn rank(&self) -> (u32, u8, &'static str) {
        match self {
            Item::Node(id) => (*id + 1, 0, ""),
            Item::Attr(id, key) => (*id + 1, 1, key),
            _ => (0, 0, ""),
        }
    }
}

/// A sequence of items. One item is by far the most common case and needs no allocation.
#[derive(Clone)]
pub enum Seq {
    Empty,
    One(Item),
    Many(Rc<Vec<Item>>),
}

impl Seq {
    pub fn from(mut items: Vec<Item>) -> Seq {
        match items.len() {
            0 => Seq::Empty,
            1 => Seq::One(items.remove(0)),
            _ => Seq::Many(Rc::new(items)),
        }
    }

    pub fn items(&self) -> &[Item] {
        match self {
            Seq::Empty => &[],
            Seq::One(item) => std::slice::from_ref(item),
            Seq::Many(items) => items,
        }
    }

    pub fn len(&self) -> usize {
        self.items().len()
    }

    pub fn is_empty(&self) -> bool {
        matches!(self, Seq::Empty)
    }

    pub fn into_vec(self) -> Vec<Item> {
        match self {
            Seq::Empty => Vec::new(),
            Seq::One(item) => vec![item],
            Seq::Many(items) => Rc::try_unwrap(items).unwrap_or_else(|shared| (*shared).clone()),
        }
    }

    pub fn flag(value: bool) -> Seq {
        Seq::One(Item::Flag(value))
    }

    pub fn text(value: &str) -> Seq {
        Seq::One(Item::text(value))
    }

    pub fn owned(value: String) -> Seq {
        Seq::One(Item::Text(Rc::from(value)))
    }

    pub fn whole(value: i64) -> Seq {
        Seq::One(Item::Whole(value))
    }
}

/// A double as XPath writes it.
pub fn real_text(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_string();
    }
    if value.is_infinite() {
        return if value > 0.0 { "INF".to_string() } else { "-INF".to_string() };
    }
    let size = value.abs();
    if size == 0.0 {
        return if value.is_sign_negative() { "-0".to_string() } else { "0".to_string() };
    }
    if (1e-6..1e6).contains(&size) {
        return if value.fract() == 0.0 { format!("{}", value as i64) } else { format!("{value}") };
    }
    let written = format!("{value:e}");
    let (digits, exponent) = written.split_once('e').unwrap_or((&written, "0"));
    let digits = if digits.contains('.') { digits.to_string() } else { format!("{digits}.0") };
    format!("{digits}E{exponent}")
}

impl std::fmt::Debug for Seq {
    fn fmt(&self, out: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(out, "sequence of {}", self.len())
    }
}
