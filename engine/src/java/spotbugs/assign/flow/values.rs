//! What the walk of one method knows at a point of its code: the value each local variable holds. Paths that
//! meet keep what both agree on. What makes values read from fields out of date is not part of it (see `walk`).
use std::cell::Cell;
use std::collections::HashMap;

pub type Key = (String, String);

#[derive(Clone, PartialEq, Eq, Debug)]
pub enum Val {
    This,
    /// The object around, from the hidden parameter of a constructor of an inner class.
    Outer,
    /// A value nothing else is known about; two different numbers are two different values.
    Fresh(u32),
    /// A value read from a field of the object `receiver`, while the field's values were as `epoch` says.
    Load { field: Key, receiver: Box<Val>, epoch: (u32, u32) },
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
