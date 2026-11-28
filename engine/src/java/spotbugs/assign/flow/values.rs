//! What the walk of one method knows at a point of its code: the value each local variable holds. Paths that
//! meet keep what both agree on. What makes values read from fields out of date is not part of it (see `walk`).
use std::cell::Cell;
use std::collections::HashMap;
use tree_sitter::Node;

pub type Key = (String, String);

#[derive(Clone, PartialEq, Eq, Hash, Debug)]
pub enum Val {
    This,
    /// The object around, from the hidden parameter of a constructor of an inner class.
    Outer,
    /// A value nothing else is known about; two different numbers are two different values.
    Fresh(u32),
    /// A value read from a field of the object `receiver`, while the field's values were as `epoch` says.
    Load { field: Key, receiver: Box<Val>, epoch: (u32, u32), seen: Seen },
    /// `Mode::Stack`: a value of a variable that javac converts to another primitive type with an instruction.
    Converted(Box<Val>, String),
}

/// `Mode::Stack`: where a load ran, its line and the calls before it. Not part of the value.
#[derive(Clone, Copy, Debug, Default)]
pub struct Seen {
    pub line: usize,
    pub calls: u32,
}

impl PartialEq for Seen {
    fn eq(&self, _: &Self) -> bool {
        true
    }
}

impl Eq for Seen {}

impl std::hash::Hash for Seen {
    fn hash<H: std::hash::Hasher>(&self, _: &mut H) {}
}

impl Val {
    /// The value before conversions.
    pub fn base(&self) -> &Val {
        match self {
            Val::Converted(inner, _) => inner.base(),
            other => other,
        }
    }
}

/// What the walk is for. `Assign`: FindFieldSelfAssignment, where a call makes values read from fields out of
/// date. `Stack`: the values FindSelfComparison follows (a call changes nothing, a conversion keeps the variable a
/// value came from). `Numbers`: the value numbers of FindSelfComparison2 (a call makes loads out of date, every
/// conversion makes a new value).
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Mode {
    Assign,
    Stack,
    Numbers,
}

/// An operator or a call whose two operands the comparisons look at, with the values they had.
pub struct Site<'a> {
    pub node: Node<'a>,
    pub left: Val,
    pub right: Val,
    /// The variables holding the right value when the operator ran.
    pub holders: Vec<String>,
    /// The right value was read from a field that a load would still give.
    pub current: bool,
    /// When only calls made the right value out of date: those calls (none for code that surely has an effect).
    pub causes: Option<Vec<Option<Node<'a>>>>,
    /// `Mode::Stack`: the calls before the operator ran.
    pub calls: u32,
}

#[derive(Clone, Default)]
pub struct State {
    pub locals: HashMap<String, Val>,
}

#[derive(Default)]
pub struct Numbers(Cell<u32>);

impl Numbers {
    pub fn next(&self) -> u32 {
        self.0.set(self.0.get() + 1);
        self.0.get()
    }
    pub fn fresh(&self) -> Val {
        Val::Fresh(self.next())
    }
}

/// The state where two paths meet: what both paths agree on.
pub fn merge(one: Option<State>, two: Option<State>, numbers: &Numbers) -> Option<State> {
    let (one, two) = match (one, two) {
        (Some(one), Some(two)) => (one, two),
        (one, None) => return one,
        (None, two) => return two,
    };
    let mut locals = HashMap::new();
    for (name, value) in &one.locals {
        if let Some(other) = two.locals.get(name) {
            locals.insert(name.clone(), if value == other { value.clone() } else { numbers.fresh() });
        }
    }
    Some(State { locals })
}

pub fn merge_all(states: Vec<Option<State>>, numbers: &Numbers) -> Option<State> {
    states.into_iter().fold(None, |all, state| merge(all, state, numbers))
}
