//! What one point of a body knows: the values each followed name can still hold, the constants it was already
//! compared with, and the locals that hold the same value as another name (`int v = f` makes `v` stand for
//! `this.f` until either changes), the way SpotBugs numbers values.
use super::keys::Key;
use super::ranges::Set;
use std::collections::{BTreeMap, BTreeSet, HashSet};

#[derive(Clone, Debug, PartialEq)]
pub struct Fact {
    pub key: Key,
    /// The values left, `None` when no test narrowed them.
    pub set: Option<Set>,
    /// The constants of the tests that compared the value, with the test.
    pub constants: BTreeSet<(i128, usize)>,
}

impl Fact {
    fn join(&self, other: Option<&Fact>) -> Fact {
        let set = match (&self.set, other.and_then(|other| other.set.as_ref())) {
            (Some(one), Some(two)) => Some(one.or(two)).filter(|joined| *joined != Set::of(self.key.kind)),
            _ => None,
        };
        let mut constants = self.constants.clone();
        constants.extend(other.map(|other| other.constants.clone()).unwrap_or_default());
        Fact { key: self.key.clone(), set, constants }
    }
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct State {
    facts: BTreeMap<String, Fact>,
    alias: BTreeMap<String, String>,
}

impl State {
    /// The name a value is kept under.
    pub fn owner(&self, name: &str) -> String {
        self.alias.get(name).cloned().unwrap_or_else(|| name.to_string())
    }

    pub fn fact(&self, key: &Key) -> Option<&Fact> {
        self.facts.get(&self.owner(&key.name))
    }

    pub fn narrow(&mut self, key: &Key, set: Set, constant: (i128, usize)) {
        let owner = self.owner(&key.name);
        let held = self.facts.get(&owner).map(|fact| fact.key.clone()).unwrap_or_else(|| key.clone());
        let fact = self.facts.entry(owner).or_insert(Fact { key: held, set: None, constants: BTreeSet::new() });
        fact.set = Some(set).filter(|set| *set != Set::of(key.kind));
        fact.constants.insert(constant);
    }

    pub fn remember(&mut self, key: &Key, constant: (i128, usize)) {
        let owner = self.owner(&key.name);
        let held = self.facts.get(&owner).map(|fact| fact.key.clone()).unwrap_or_else(|| key.clone());
        self.facts.entry(owner).or_insert(Fact { key: held, set: None, constants: BTreeSet::new() }).constants.insert(constant);
    }

    /// Forgets a name; locals that stood for it keep its value under the first of them.
    fn drop_name(&mut self, name: &str) {
        let standing: Vec<String> = self.alias.iter().filter(|(_, owner)| *owner == name).map(|(local, _)| local.clone()).collect();
        let fact = self.facts.remove(name);
        if let Some(first) = standing.first() {
            for local in &standing {
                self.alias.remove(local);
            }
            for local in &standing[1..] {
                self.alias.insert(local.clone(), first.clone());
            }
            if let Some(fact) = fact {
                let key = Key { name: first.clone(), root: Some(first.clone()), fields: Vec::new(), ..fact.key };
                self.facts.insert(first.clone(), Fact { key, ..fact });
            }
        }
    }

    fn drop_where(&mut self, test: impl Fn(&Key) -> bool) {
        let gone: Vec<String> = self.facts.iter().filter(|(_, fact)| test(&fact.key)).map(|(name, _)| name.clone()).collect();
        for name in gone {
            self.drop_name(&name);
        }
    }

    /// A store into a local: what it held and every value read through it is gone.
    pub fn store_local(&mut self, local: &str) {
        self.alias.remove(local);
        self.drop_name(local);
        self.drop_where(|key| key.root.as_deref() == Some(local) && key.name != local);
        let through = format!("{local}.");
        self.alias.retain(|_, owner| !owner.starts_with(&through));
    }

    /// `local` now holds the value `key` names.
    pub fn copy(&mut self, local: &str, key: &Key) {
        let owner = self.owner(&key.name);
        if owner != local {
            self.alias.insert(local.to_string(), owner);
        }
    }

    /// A store into a field on any object; `?` as its class stands for every field of that name.
    pub fn store_field(&mut self, field: &(String, String)) {
        let hit = |read: &(String, String)| read.1 == field.1 && (field.0 == "?" || read.0 == field.0);
        self.drop_where(|key| key.fields.iter().any(hit));
        self.alias.retain(|_, owner| !owner.split('.').skip(1).any(|part| part == field.1));
    }

    /// Whether a value read from a field is known or held by a local.
    pub fn has_fields(&self) -> bool {
        self.facts.values().any(|fact| !fact.key.fields.is_empty()) || self.alias.values().any(|owner| owner.contains('.'))
    }

    /// A call that may change fields: values read from fields some code changes after construction are gone.
    pub fn call(&mut self, rewritten: &HashSet<(String, String)>) {
        let hit = |read: &(String, String)| rewritten.contains(read) || rewritten.contains(&("?".to_string(), read.1.clone()));
        let names: HashSet<&str> = rewritten.iter().map(|(_, name)| name.as_str()).collect();
        self.drop_where(|key| key.fields.iter().any(hit));
        self.alias.retain(|_, owner| !owner.split('.').skip(1).any(|part| names.contains(part)));
    }

    pub fn join(&self, other: &State) -> State {
        let mut one = self.clone();
        let mut two = other.clone();
        let locals: BTreeSet<String> = one.alias.keys().chain(two.alias.keys()).cloned().collect();
        for local in locals {
            if one.alias.get(&local) != two.alias.get(&local) {
                one.own(&local);
                two.own(&local);
            }
        }
        let mut facts = BTreeMap::new();
        for (name, fact) in &one.facts {
            facts.insert(name.clone(), fact.join(two.facts.get(name)));
        }
        for (name, fact) in &two.facts {
            facts.entry(name.clone()).or_insert_with(|| fact.join(None));
        }
        State { facts, alias: one.alias }
    }

    /// Gives a local the fact of the name it stands for, as its own.
    fn own(&mut self, local: &str) {
        let Some(owner) = self.alias.remove(local) else { return };
        if let Some(fact) = self.facts.get(&owner).cloned() {
            let key = Key { name: local.to_string(), root: Some(local.to_string()), fields: Vec::new(), ..fact.key };
            self.facts.insert(local.to_string(), Fact { key, ..fact });
        }
    }
}
