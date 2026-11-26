//! PMD's `SpanInfo`: the reaching definitions of a span of code, its abrupt completions and the catch and finally
//! blocks it feeds. Spans live in an arena so that PMD's object identity carries over.
use super::{Defs, Entry, Flow, Reaching, Special, Sym, Tri};
use crate::java::pmd::coded::ctx::{Ctx, TYPE_DECLARATIONS};
use std::collections::{HashMap, HashSet};
use std::rc::Rc;

pub type SpanId = usize;

pub struct Span {
    parent: Option<SpanId>,
    pub my_finally: Option<SpanId>,
    pub catches: Rc<Vec<SpanId>>,
    pub table: HashMap<Sym, Defs>,
    pub abrupt: Tri,
    pub targets: Vec<SpanId>,
    pub ret: SpanId,
}

#[derive(Default)]
pub struct Targets {
    pub unnamed: Vec<SpanId>,
    pub named: HashMap<String, SpanId>,
}

pub struct Pass<'c, 'm, 'a, 't> {
    pub ctx: &'c Ctx<'m, 'a, 't>,
    pub spans: Vec<Span>,
    index: HashMap<(bool, Sym, u32), u32>,
    all: Vec<u32>,
    seen: HashSet<u32>,
    used: HashSet<u32>,
    pub breaks: Targets,
    pub continues: Targets,
    pub class: u32,
    pub in_static: bool,
    pub fields: HashMap<u32, Rc<Vec<(u32, bool)>>>,
    final_fields: HashMap<Sym, bool>,
    pub flow: Flow,
}

impl<'c, 'm, 'a, 't> Pass<'c, 'm, 'a, 't> {
    pub fn run(ctx: &'c Ctx<'m, 'a, 't>) -> Flow {
        let mut pass = Pass {
            ctx,
            spans: Vec::new(),
            index: HashMap::new(),
            all: Vec::new(),
            seen: HashSet::new(),
            used: HashSet::new(),
            breaks: Targets::default(),
            continues: Targets::default(),
            class: 0,
            in_static: false,
            fields: HashMap::new(),
            final_fields: HashMap::new(),
            flow: Flow::default(),
        };
        let tops: Vec<u32> = ctx
            .all("CompilationUnit")
            .iter()
            .flat_map(|unit| ctx.kids(*unit).to_vec())
            .filter(|kid| TYPE_DECLARATIONS.contains(&ctx.name(*kid)))
            .collect();
        for top in tops {
            pass.breaks = Targets::default();
            pass.continues = Targets::default();
            let start = pass.root();
            pass.type_declaration(top, start);
            pass.spans.clear();
        }
        let flow = &mut pass.flow;
        flow.unused = pass
            .all
            .iter()
            .copied()
            .filter(|entry| !pass.used.contains(entry))
            .filter(|entry| {
                let entry = &flow.entries[*entry as usize];
                entry.unbound.is_none() && !(entry.rhs == entry.node && super::is_field(ctx, entry.var))
            })
            .collect();
        pass.flow
    }

    fn make(&mut self, parent: Option<SpanId>, table: HashMap<Sym, Defs>) -> SpanId {
        let id = self.spans.len();
        let ret = parent.map_or(id, |parent| self.spans[parent].ret);
        self.spans.push(Span {
            parent,
            my_finally: None,
            catches: Rc::new(Vec::new()),
            table,
            abrupt: Tri::No,
            targets: Vec::new(),
            ret,
        });
        id
    }

    fn root(&mut self) -> SpanId {
        self.make(None, HashMap::new())
    }

    pub fn fork(&mut self, of: SpanId) -> SpanId {
        let table = self.spans[of].table.clone();
        self.make(Some(of), table)
    }

    pub fn fork_empty(&mut self, of: SpanId) -> SpanId {
        self.make(Some(of), HashMap::new())
    }

    pub fn fork_empty_non_local(&mut self, _of: SpanId) -> SpanId {
        self.make(None, HashMap::new())
    }

    pub fn fork_capturing_non_local(&mut self, of: SpanId) -> SpanId {
        let table = self.spans[of].table.clone();
        self.make(None, table)
    }

    fn entry(&mut self, var: Sym, rhs: u32, kind: Option<Special>) -> u32 {
        let key = (kind.is_some(), var, rhs);
        if let Some(found) = self.index.get(&key) {
            return *found;
        }
        let id = self.flow.entries.len() as u32;
        self.flow.entries.push(Entry { var, node: var.node(), rhs, unbound: kind });
        self.index.insert(key, id);
        id
    }

    fn blank_local(&self, entry: u32) -> bool {
        let entry = &self.flow.entries[entry as usize];
        entry.rhs == entry.node && !entry.var_is_formal() && super::is_local_variable(self.ctx, entry.node)
    }

    pub fn assign(&mut self, span: SpanId, var: Sym, rhs: u32, kind: Option<Special>) -> Option<Defs> {
        let entry = self.entry(var, rhs, kind);
        let mut fresh: Defs = Rc::new(vec![entry]);
        if kind == Some(Special::UnknownCall) {
            if let Some(previous) = self.spans[span].table.remove(&var) {
                fresh = merge(&previous, &fresh);
            }
        }
        let previous = self.spans[span].table.insert(var, fresh);
        if let Some(previous) = &previous {
            for &killed in previous.iter() {
                if self.blank_local(killed) {
                    continue;
                }
                let killers = self.flow.killers.entry(killed).or_default();
                if !killers.contains(&entry) {
                    killers.push(entry);
                }
            }
        }
        if self.seen.insert(entry) {
            self.all.push(entry);
        }
        previous
    }

    pub fn declare_blank(&mut self, span: SpanId, variable: u32) {
        self.assign(span, super::plain(variable), variable, None);
    }

    pub fn use_var(&mut self, span: SpanId, var: Sym, sink: Option<u32>) {
        let Some(info) = self.spans[span].table.get(&var).cloned() else { return };
        self.used.extend(info.iter().copied());
        if let Some(sink) = sink {
            self.update_reaching(sink, var, Some(&info));
        }
    }

    pub fn update_reaching(&mut self, sink: u32, var: Sym, info: Option<&Defs>) {
        let Some(info) = info else { return };
        let ctx = self.ctx;
        let final_field = *self
            .final_fields
            .entry(var)
            .or_insert_with(|| super::is_field(ctx, var) && super::field_final(ctx, var));
        if final_field {
            return;
        }
        let entries = &self.flow.entries;
        let initial = info.iter().any(|entry| entries[*entry as usize].unbound == Some(Special::InitialField));
        let unbound = info.iter().any(|entry| entries[*entry as usize].unbound.is_some());
        let set: Vec<u32> = info.iter().copied().filter(|entry| entries[*entry as usize].unbound.is_none()).collect();
        let fresh = Reaching { set, not_fully_known: initial || unbound };
        match self.flow.reaching.get_mut(&sink) {
            Some(current) => {
                current.not_fully_known |= fresh.not_fully_known;
                for entry in fresh.set {
                    if !current.set.contains(&entry) {
                        current.set.push(entry);
                    }
                }
            }
            None => {
                self.flow.reaching.insert(sink, fresh);
            }
        }
    }

    pub fn delete_var(&mut self, span: SpanId, var: Sym) {
        self.spans[span].table.remove(&var);
    }

    pub fn absorb(&mut self, this: SpanId, other: Option<SpanId>) -> SpanId {
        let Some(other) = other else { return this };
        if other == this || self.spans[other].table.is_empty() {
            return this;
        }
        let incoming: Vec<(Sym, Defs)> = self.spans[other].table.iter().map(|(key, value)| (*key, value.clone())).collect();
        let table = &mut self.spans[this].table;
        for (key, value) in incoming {
            match table.get(&key) {
                Some(current) => {
                    let merged = merge(current, &value);
                    table.insert(key, merged);
                }
                None => {
                    table.insert(key, value);
                }
            }
        }
        let (mine, theirs) = (self.spans[this].abrupt, self.spans[other].abrupt);
        self.spans[this].abrupt = if mine == theirs && mine != Tri::Unknown { mine } else { Tri::Unknown };
        let targets = self.spans[other].targets.clone();
        add_all(&mut self.spans[this].targets, &targets);
        this
    }

    pub fn abrupt_completion(&mut self, span: SpanId, target: SpanId) -> SpanId {
        self.spans[span].abrupt = Tri::Yes;
        add_all(&mut self.spans[span].targets, &[target]);
        let mut at = Some(span);
        while let Some(parent) = at {
            if let Some(finally) = self.spans[parent].my_finally {
                self.absorb(finally, Some(span));
                break;
            }
            if parent == target {
                break;
            }
            at = self.spans[parent].parent;
        }
        self.spans[span].table.clear();
        span
    }

    pub fn abrupt_by_throw(&mut self, span: SpanId, by_call: bool) -> SpanId {
        if !by_call {
            self.spans[span].abrupt = Tri::Yes;
        }
        let ret = self.spans[span].ret;
        add_all(&mut self.spans[span].targets, &[ret]);
        let mut at = Some(span);
        while let Some(parent) = at {
            let catches = self.spans[parent].catches.clone();
            for catch in catches.iter() {
                self.absorb(*catch, Some(span));
            }
            if let Some(finally) = self.spans[parent].my_finally {
                self.absorb(finally, Some(span));
                return span;
            }
            at = self.spans[parent].parent;
        }
        if !by_call {
            self.spans[span].table.clear();
        }
        span
    }

    pub fn do_break(&mut self, span: SpanId, label: Option<String>, continues: bool) -> SpanId {
        let targets = if continues { &self.continues } else { &self.breaks };
        let target = match label {
            None => targets.unnamed.last().copied(),
            Some(label) => targets.named.get(&label).copied(),
        };
        let Some(target) = target else { return span };
        self.absorb(target, Some(span));
        self.abrupt_completion(span, target)
    }
}

impl Entry {
    fn var_is_formal(&self) -> bool {
        self.var.formal()
    }
}

pub fn merge(first: &Defs, second: &Defs) -> Defs {
    if Rc::ptr_eq(first, second) {
        return first.clone();
    }
    let mut merged: Vec<u32> = first.iter().copied().collect();
    for entry in second.iter() {
        if !merged.contains(entry) {
            merged.push(*entry);
        }
    }
    Rc::new(merged)
}

pub fn add_all(into: &mut Vec<SpanId>, more: &[SpanId]) {
    for target in more {
        if !into.contains(target) {
            into.push(*target);
        }
    }
}
