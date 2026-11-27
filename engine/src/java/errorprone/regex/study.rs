//! How long a look-behind body can match, worked out item by item as `Pattern` does it: 32-bit lengths that
//! wrap, quantifiers that check their own overflow, and alternations that count what follows them first.

/// What one item adds to the lengths of the sequence it is in.
#[derive(Clone, Debug)]
pub(super) enum Node {
    /// A fixed width: characters, classes and zero-width assertions.
    Width(i32, i32),
    /// A line break: one or two characters.
    LineBreak,
    /// A grapheme cluster.
    Grapheme,
    /// A back reference: no known maximum.
    Reference,
    /// A greedy `*` or `+` on one character or class, with its minimum count.
    Greedy(i32),
    /// Any other counted repetition.
    Repeat(Vec<Node>, i32, i32),
    /// An optional item.
    Optional(Vec<Node>),
    /// A repeated group whose body does not have one fixed length.
    Loop,
    /// An atomic group.
    Atomic(Vec<Node>),
    /// Alternatives.
    Choice(Vec<Vec<Node>>),
}

pub(super) const MAX: i32 = i32::MAX;

#[derive(Clone, Copy, Debug)]
pub(super) struct Info {
    pub min: i32,
    pub max: i32,
    pub bounded: bool,
    pub fixed: bool,
}

impl Info {
    pub fn new() -> Info {
        Info { min: 0, max: 0, bounded: true, fixed: true }
    }
}

/// Whether the items, studied from scratch, have one fixed length.
pub(super) fn fixed(nodes: &[Node]) -> bool {
    let mut info = Info::new();
    study(nodes, &mut info);
    info.fixed
}

pub(super) fn bounded(nodes: &[Node]) -> bool {
    let mut info = Info::new();
    study(nodes, &mut info);
    info.bounded
}

fn repeat(atom: &[Node], low: i32, high: i32, info: &mut Info) {
    let (min, max, bounded, fixed) = (info.min, info.max, info.bounded, info.fixed);
    *info = Info::new();
    study(atom, info);
    let mut total = info.min.wrapping_mul(low).wrapping_add(min);
    if total < min {
        total = 0x0fff_ffff;
    }
    info.min = total;
    if bounded && info.bounded {
        info.max = max.wrapping_add(info.max.wrapping_mul(high));
        if info.max < max {
            info.bounded = false;
        }
    } else {
        info.bounded = false;
    }
    info.fixed = info.fixed && low == high && fixed;
}

pub(super) fn study(nodes: &[Node], info: &mut Info) {
    for (at, node) in nodes.iter().enumerate() {
        match node {
            Node::Width(min, max) => {
                info.min = info.min.wrapping_add(*min);
                info.max = info.max.wrapping_add(*max);
            }
            Node::LineBreak => {
                info.min = info.min.wrapping_add(1);
                info.max = info.max.wrapping_add(2);
            }
            Node::Grapheme => {
                info.min = info.min.wrapping_add(1);
                info.fixed = false;
            }
            Node::Reference => info.bounded = false,
            Node::Greedy(low) => {
                info.min = info.min.wrapping_add(*low);
                if info.bounded {
                    info.max = info.max.wrapping_add(MAX);
                }
                info.fixed = false;
            }
            Node::Repeat(atom, low, high) => repeat(atom, *low, *high, info),
            Node::Optional(atom) => {
                let min = info.min;
                study(atom, info);
                info.min = min;
                info.fixed = false;
            }
            Node::Loop => {
                info.bounded = false;
                info.fixed = false;
                return;
            }
            Node::Atomic(atom) => study(atom, info),
            Node::Choice(alternatives) => {
                let (min, max, bounded) = (info.min, info.max, info.bounded);
                let (mut least, mut most, mut all_bounded) = (i32::MAX, -1, bounded);
                for alternative in alternatives {
                    let mut each = Info::new();
                    study(alternative, &mut each);
                    least = least.min(each.min);
                    most = most.max(each.max);
                    all_bounded &= each.bounded;
                }
                *info = Info::new();
                study(&nodes[at + 1..], info);
                info.min = info.min.wrapping_add(min.wrapping_add(least));
                info.max = info.max.wrapping_add(max.wrapping_add(most));
                info.bounded &= all_bounded;
                info.fixed = false;
                return;
            }
        }
    }
}
