//! What the whole run stores in each field. SpotBugs reads every class of a run, so whether a field only ever
//! holds values nobody can change is decided by the stores of all classes, in the order SpotBugs visits them.
//! Each file notes its stores while its rules run; a finding that hangs on a field waits until every file is read.
use super::fields::stored;
use super::flow::{Item, trace};
use super::mutable::mutable;
use super::stores::{Held, immutable_value, stored_fixed};
use super::Context;
use super::order::Visits;
use crate::engine::finding::Finding;
use crate::engine::source::{children, named_children};
use crate::java::types::index::TypeIndex;
use crate::java::types::model::Type;
use std::collections::{HashMap, HashSet};
use std::sync::Mutex;
use tree_sitter::Node;

/// The declaring class and the name of a field.
pub type Key = (String, String);

enum Verdict {
    /// The store tells nothing about the field.
    Nothing,
    Fixed,
    Against,
    /// The value is read from another field and is as good as what that field was given.
    Loads(Key),
}

pub struct Fact {
    /// The class the store is written in.
    by: String,
    verdict: Verdict,
    /// The stored value itself is one nobody can change.
    settled: bool,
    null: bool,
    /// The type of the stored value; `None` for a store that says nothing about the type.
    kind: Option<Option<Type>>,
}

/// A finding for a field handed out by a method of the class `from`, reported when the field turns out exposed.
pub struct Waiting {
    pub finding: Finding,
    pub key: Key,
    pub from: String,
    /// Whether the declared type of the field can be changed.
    pub changeable: bool,
}

#[derive(Default)]
pub struct Known {
    /// Per class, the classes of the run it calls.
    calls: Mutex<HashMap<String, HashSet<String>>>,
    facts: Mutex<HashMap<Key, Vec<Fact>>>,
    waiting: Mutex<Vec<Waiting>>,
}

fn kind_of(context: &Context, value: Node) -> Option<Type> {
    let sides = (value.kind() == "ternary_expression").then(|| value.child_by_field_name("consequence").zip(value.child_by_field_name("alternative"))).flatten();
    match sides {
        Some((first, second)) => {
            let (first, second) = (context.resolver.type_of(first), context.resolver.type_of(second));
            first.filter(|first| second.as_ref().map(Type::name) == Some(first.name()))
        }
        None => context.resolver.type_of(value),
    }
}

/// What a record's compact constructor leaves in each component where it ends.
fn compact(context: &Context, own: &str, class: Node, found: &mut Vec<(Key, Fact)>) {
    let Some(body) = class.child_by_field_name("body") else { return };
    let Some(block) = children(body).into_iter().find(|member| member.kind() == "compact_constructor_declaration").and_then(|member| member.child_by_field_name("body")) else { return };
    let components = class.child_by_field_name("parameters").map(named_children).unwrap_or_default();
    for (name, item) in trace(context, &components, block).end.unwrap_or_default() {
        let settled = matches!(item, Item::Fixed);
        let verdict = if settled { Verdict::Fixed } else { Verdict::Against };
        found.push(((own.to_string(), name), Fact { by: own.to_string(), verdict, settled, null: false, kind: None }));
    }
}

/// Every store of the file with what it says about its field.
pub fn gather(context: &Context) -> Vec<(Key, Fact)> {
    let mut found = Vec::new();
    for (own, class) in &context.classes {
        compact(context, own, *class, &mut found);
    }
    for (key, values) in stored(context) {
        for store in values {
            let value = crate::java::types::expr::unwrap(store.value);
            let null = value.kind() == "null_literal";
            let verdict = match stored_fixed(context, value, &key) {
                Held::Nothing => Verdict::Nothing,
                Held::Loads(source) => Verdict::Loads(source),
                Held::Fixed(true) => Verdict::Fixed,
                Held::Fixed(false) => Verdict::Against,
            };
            let kind = (!null).then(|| kind_of(context, value));
            found.push((key.clone(), Fact { by: store.by, verdict, settled: immutable_value(context, value), null, kind }));
        }
    }
    found
}

type Facts = HashMap<Key, Vec<Fact>>;

fn against(facts: &Facts, fact: &Fact) -> bool {
    match &fact.verdict {
        Verdict::Against => true,
        Verdict::Loads(source) => !facts.get(source).is_some_and(|stores| stores.iter().any(|store| store.settled)),
        _ => false,
    }
}

fn fine(facts: &Facts, fact: &Fact) -> bool {
    matches!(fact.verdict, Verdict::Fixed) || (matches!(fact.verdict, Verdict::Loads(_)) && !against(facts, fact))
}

/// Whether the field only holds values nobody can change, as SpotBugs sees it when it reads the class `from`:
/// by the stores of that class and of the classes it read before. When those have no store at all, by the stores
/// of the whole run, where a stored `null` no longer speaks for the field.
fn fixed(visits: &Visits, facts: &Facts, key: &Key, from: &str) -> bool {
    let Some(stores) = facts.get(key) else { return false };
    let seen: Vec<&Fact> = stores.iter().filter(|fact| fact.by == from || visits.before(&fact.by, from)).collect();
    if seen.iter().any(|fact| against(facts, fact)) {
        return false;
    }
    if seen.iter().any(|fact| fine(facts, fact)) {
        return true;
    }
    !stores.iter().any(|fact| against(facts, fact)) && stores.iter().any(|fact| fine(facts, fact) && !fact.null)
}

/// Whether every value the run stores in the field has one type that can be changed, whatever the field is declared as.
fn widened(index: &TypeIndex, facts: &Facts, key: &Key) -> bool {
    let mut kinds = facts.get(key).into_iter().flatten().filter_map(|fact| fact.kind.as_ref());
    let Some(first) = kinds.next() else { return false };
    let name = first.as_ref().map(Type::name);
    kinds.all(|kind| kind.as_ref().map(Type::name) == name) && first.as_ref().is_some_and(|kind| mutable(index, kind))
}

impl Known {
    pub fn note(&self, calls: HashMap<String, HashSet<String>>, facts: Vec<(Key, Fact)>, waiting: Vec<Waiting>) {
        self.calls.lock().expect("calls").extend(calls);
        if !facts.is_empty() {
            let mut all = self.facts.lock().expect("facts");
            for (key, fact) in facts {
                all.entry(key).or_default().push(fact);
            }
        }
        if !waiting.is_empty() {
            self.waiting.lock().expect("waiting").extend(waiting);
        }
    }

    /// Reports the waiting findings whose field is exposed after all.
    pub fn settle(&self, index: &TypeIndex, out: &mut Vec<Finding>) {
        let facts = self.facts.lock().expect("facts");
        let calls = self.calls.lock().expect("calls");
        if let Ok(path) = std::env::var("NP_SB_CALLS") {
            let mut lines: Vec<String> = calls.iter().flat_map(|(class, callees)| callees.iter().map(move |callee| format!("{class}\t{callee}"))).collect();
            lines.sort();
            let _ = std::fs::write(path, lines.join("\n"));
        }
        let visits = Visits::of(index, &calls);
        for waiting in self.waiting.lock().expect("waiting").drain(..) {
            if (waiting.changeable || widened(index, &facts, &waiting.key)) && !fixed(&visits, &facts, &waiting.key, &waiting.from) {
                out.push(waiting.finding);
            }
        }
    }
}
