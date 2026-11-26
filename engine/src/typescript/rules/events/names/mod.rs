//! The name and constant resolution the emitter rules share: module bindings, constants, aliases.
pub mod bindings;
pub mod resolve;

use crate::typescript::rules::support::scope::Scopes;
use crate::typescript::rules::support::view::{Node, View};
use bindings::Bindings;
use std::cell::RefCell;
use std::collections::HashMap;
use std::rc::Rc;

/// The scopes of the file and the module bindings computed so far, one set for each list of module names.
pub struct Env<'a, 'v> {
    pub scopes: &'v Scopes<'a, 'v>,
    program: Node<'v>,
    cache: RefCell<HashMap<usize, Rc<Bindings>>>,
}

impl<'a, 'v> Env<'a, 'v> {
    pub fn new(view: &'v View, scopes: &'v Scopes<'a, 'v>) -> Env<'a, 'v> {
        Env { scopes, program: view.program(), cache: RefCell::new(HashMap::new()) }
    }

    pub fn bindings(&self, modules: &'static [&'static str]) -> Rc<Bindings> {
        let key = modules.as_ptr() as usize;
        if let Some(found) = self.cache.borrow().get(&key) {
            return found.clone();
        }
        let made = Rc::new(bindings::bindings_of(self.program, modules));
        self.cache.borrow_mut().insert(key, made.clone());
        made
    }
}
