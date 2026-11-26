//! State an analysis keeps for the run, beside the compiler's answers: taken out of the handle while a rule
//! works with it, and put back after; the rule drops what may rest on a refused answer.
use crate::typescript::rules::typed::types::Types;
use std::any::{Any, TypeId};

impl Types {
    pub fn take_store<T: Default + 'static>(&mut self) -> T {
        self.stores.remove(&TypeId::of::<T>()).and_then(|stored| stored.downcast::<T>().ok()).map(|stored| *stored).unwrap_or_default()
    }

    pub fn put_store<T: 'static>(&mut self, value: T) {
        self.stores.insert(TypeId::of::<T>(), Box::new(value) as Box<dyn Any>);
    }
}
