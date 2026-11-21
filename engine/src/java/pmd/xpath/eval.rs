//! Evaluates XPath expressions over the PMD-shaped tree of one file.
use super::parse::{Axis, Cmp, Expr, Key, Math, Order, Sets, Test};
use super::value::{Bound, Env, Function, Item, Later, Seq, Xml, real_text};
use crate::engine::source::SourceFile;
use crate::java::pmd::tree::{PmdTree, ROOT, Value};
use crate::java::types::model::Type;
use crate::java::types::scope::Resolver;
use std::cell::RefCell;
use std::cmp::Ordering;
use std::collections::HashMap;
use std::rc::Rc;

#[derive(Clone, Copy)]
pub struct Focus<'f> {
    pub item: Option<&'f Item>,
    pub position: usize,
    pub size: usize,
}

pub const NOWHERE: Focus<'static> = Focus { item: None, position: 0, size: 0 };

pub struct Machine<'a, 't> {
    pub tree: &'a PmdTree<'t>,
    pub file: &'a SourceFile,
    pub resolver: &'a Resolver<'a>,
    /// The first thing that went wrong while evaluating, if anything did.
    pub trouble: RefCell<Option<String>>,
    pub types: RefCell<HashMap<u32, Option<Type>>>,
    pub calls: RefCell<HashMap<u32, Option<std::rc::Rc<super::library::CallFacts>>>>,
}

fn sorted(items: &[Item]) -> bool {
    items.windows(2).all(|pair| pair[0].rank() < pair[1].rank())
}

/// Nodes in document order, each once.
pub fn in_order(mut items: Vec<Item>) -> Vec<Item> {
    if items.len() > 1 && !sorted(&items) && items.iter().all(|item| !matches!(item, Item::Xml(_))) {
        items.sort_by_key(Item::rank);
        items.dedup_by_key(|item| item.rank());
    }
    items
}

impl<'a, 't> Machine<'a, 't> {
    pub fn new(tree: &'a PmdTree<'t>, file: &'a SourceFile, resolver: &'a Resolver<'a>) -> Machine<'a, 't> {
        Machine { tree, file, resolver, trouble: RefCell::new(None), types: RefCell::new(HashMap::new()), calls: RefCell::new(HashMap::new()) }
    }

    pub fn fail(&self, message: impl FnOnce() -> String) -> Seq {
        let mut trouble = self.trouble.borrow_mut();
        if trouble.is_none() {
            *trouble = Some(message());
        }
        Seq::Empty
    }

    fn attribute(&self, id: u32, key: &str) -> Vec<Item> {
        match self.tree.attribute(self.file, id, key) {
            Some(Value::Text(text)) => vec![Item::Text(text)],
            Some(Value::Flag(flag)) => vec![Item::Flag(flag)],
            Some(Value::Whole(whole)) => vec![Item::Whole(whole)],
            Some(Value::Real(real)) => vec![Item::Real(real)],
            Some(Value::List(list)) => list.iter().map(|entry| Item::text(entry)).collect(),
            None => Vec::new(),
        }
    }

    /// The atomic values of a sequence: attributes give their value, other nodes their text.
    pub fn atoms(&self, seq: &Seq) -> Vec<Item> {
        let mut out = Vec::with_capacity(seq.len());
        for item in seq.items() {
            match item {
                Item::Attr(id, key) => out.extend(self.attribute(*id, key)),
                Item::Node(id) => out.push(match self.tree.attribute(self.file, *id, "Image") {
                    Some(Value::Text(text)) => Item::Text(text),
                    _ => Item::text(""),
                }),
                Item::Doc => out.push(Item::text("")),
                Item::Xml(xml) => out.push(Item::text(&xml.text)),
                Item::Array(members) => members.iter().for_each(|member| out.extend(self.atoms(member))),
                Item::Function(_) | Item::Map(_) => {}
                other => out.push(other.clone()),
            }
        }
        out
    }

    pub fn string_of(&self, item: &Item) -> String {
        match item {
            Item::Text(text) => text.to_string(),
            Item::Flag(flag) => flag.to_string(),
            Item::Whole(whole) => whole.to_string(),
            Item::Real(real) => real_text(*real),
            Item::Attr(..) | Item::Node(_) | Item::Doc | Item::Xml(_) | Item::Array(_) => {
                let atoms = self.atoms(&Seq::One(item.clone()));
                atoms.iter().map(|atom| self.string_of(atom)).collect::<Vec<_>>().join(" ")
            }
            Item::Function(_) | Item::Map(_) => String::new(),
        }
    }

    /// The string value of the first item; empty for nothing.
    pub fn string(&self, seq: &Seq) -> String {
        seq.items().first().map(|item| self.string_of(item)).unwrap_or_default()
    }

    pub fn number_of(&self, item: &Item) -> f64 {
        match item {
            Item::Whole(whole) => *whole as f64,
            Item::Real(real) => *real,
            Item::Flag(flag) => f64::from(u8::from(*flag)),
            Item::Text(text) => written_number(text).unwrap_or(f64::NAN),
            other => match self.atoms(&Seq::One(other.clone())).first() {
                Some(atom) if !atom.is_node() => self.number_of(atom),
                _ => f64::NAN,
            },
        }
    }

    pub fn truth(&self, seq: &Seq) -> bool {
        match seq.items() {
            [] => false,
            [first, ..] if first.is_node() => true,
            [Item::Flag(flag)] => *flag,
            [Item::Text(text)] => !text.is_empty(),
            [Item::Whole(whole)] => *whole != 0,
            [Item::Real(real)] => *real != 0.0 && !real.is_nan(),
            _ => {
                self.fail(|| "a sequence of several values has no boolean value".to_string());
                true
            }
        }
    }

    pub fn compare(&self, left: &Item, right: &Item) -> Option<Ordering> {
        match (left, right) {
            (Item::Whole(a), Item::Whole(b)) => Some(a.cmp(b)),
            (Item::Whole(_) | Item::Real(_), Item::Whole(_) | Item::Real(_)) => self.number_of(left).partial_cmp(&self.number_of(right)),
            (Item::Text(a), Item::Text(b)) => Some(a.as_ref().cmp(b.as_ref())),
            (Item::Flag(a), Item::Flag(b)) => Some(a.cmp(b)),
            _ => None,
        }
    }

    fn holds(&self, cmp: Cmp, left: &Item, right: &Item) -> bool {
        let Some(order) = self.compare(left, right) else {
            let number = |item: &Item| matches!(item, Item::Whole(_) | Item::Real(_));
            if !(number(left) && number(right)) {
                self.fail(|| format!("cannot compare {} with {}", self.kind_name(left), self.kind_name(right)));
            }
            return cmp == Cmp::Ne;
        };
        match cmp {
            Cmp::Eq => order == Ordering::Equal,
            Cmp::Ne => order != Ordering::Equal,
            Cmp::Lt => order == Ordering::Less,
            Cmp::Le => order != Ordering::Greater,
            Cmp::Gt => order == Ordering::Greater,
            Cmp::Ge => order != Ordering::Less,
        }
    }

    fn kind_name(&self, item: &Item) -> &'static str {
        match item {
            Item::Text(_) => "a string",
            Item::Flag(_) => "a boolean",
            Item::Whole(_) | Item::Real(_) => "a number",
            Item::Function(_) | Item::Map(_) | Item::Array(_) => "a function",
            _ => "a node",
        }
    }

    pub fn same(&self, left: &Item, right: &Item) -> bool {
        self.compare(left, right) == Some(Ordering::Equal)
    }

    fn matches(&self, item: &Item, test: &Test, attribute: bool) -> bool {
        match (test, item) {
            (Test::Any, _) => true,
            (Test::Nothing, _) => false,
            (Test::Wild, Item::Attr(..)) => attribute,
            (Test::Wild, Item::Node(_) | Item::Xml(_)) => !attribute,
            (Test::Wild, _) => false,
            (Test::Named(name), Item::Node(id)) => !attribute && self.tree.nodes[*id as usize].name == name.as_ref(),
            (Test::Named(name), Item::Attr(_, key)) => attribute && *key == name.as_ref(),
            (Test::Named(name), Item::Xml(xml)) => name.rsplit(':').next() == Some(xml.name),
            (Test::Named(_), _) => false,
        }
    }

    /// The nodes an axis reaches from one item, nearest first on the axes that look backwards.
    fn reach(&self, from: &Item, axis: Axis, test: &Test, out: &mut Vec<Item>) {
        let tree = self.tree;
        let attribute = axis == Axis::Attribute;
        let start = out.len();
        match (from, axis) {
            (_, Axis::Own) => out.push(from.clone()),
            (Item::Node(id), Axis::Child) => out.extend(tree.nodes[*id as usize].children.iter().map(|kid| Item::Node(*kid))),
            (Item::Node(id), Axis::Descendant | Axis::DescendantOrSelf) => {
                if axis == Axis::DescendantOrSelf {
                    out.push(from.clone());
                }
                let last = tree.last[*id as usize];
                if let Test::Named(name) = test {
                    if let Some(ids) = tree.named.get(name.as_ref()) {
                        let begin = ids.partition_point(|known| *known <= *id);
                        let end = ids.partition_point(|known| *known <= last);
                        out.extend(ids[begin..end].iter().map(|found| Item::Node(*found)));
                    }
                    if axis == Axis::DescendantOrSelf && !self.matches(from, test, false) {
                        out.remove(start);
                    }
                    return;
                }
                out.extend((*id + 1..=last).map(Item::Node));
            }
            (Item::Node(id), Axis::Parent) => {
                let parent = tree.nodes[*id as usize].parent;
                out.push(if parent == ROOT { Item::Doc } else { Item::Node(parent) });
            }
            (Item::Node(id), Axis::Ancestor | Axis::AncestorOrSelf) => {
                if axis == Axis::AncestorOrSelf {
                    out.push(from.clone());
                }
                let mut current = tree.nodes[*id as usize].parent;
                while current != ROOT {
                    out.push(Item::Node(current));
                    current = tree.nodes[current as usize].parent;
                }
                out.push(Item::Doc);
            }
            (Item::Node(id), Axis::FollowingSibling | Axis::PrecedingSibling) => {
                let parent = tree.nodes[*id as usize].parent;
                if parent != ROOT {
                    let siblings = &tree.nodes[parent as usize].children;
                    let own = siblings.iter().position(|sibling| sibling == id).unwrap_or(0);
                    if axis == Axis::FollowingSibling {
                        out.extend(siblings[own + 1..].iter().map(|sibling| Item::Node(*sibling)));
                    } else {
                        out.extend(siblings[..own].iter().rev().map(|sibling| Item::Node(*sibling)));
                    }
                }
            }
            (Item::Node(id), Axis::Following) => out.extend((tree.last[*id as usize] + 1..tree.nodes.len() as u32).map(Item::Node)),
            (Item::Node(id), Axis::Preceding) => {
                out.extend((0..*id).rev().filter(|before| tree.last[*before as usize] < *id).map(Item::Node));
            }
            (Item::Node(id), Axis::Attribute) => match test {
                Test::Named(name) => out.extend(tree.attribute_key(*id, name).map(|key| Item::Attr(*id, key))),
                _ => out.extend(tree.attribute_names(*id).into_iter().map(|key| Item::Attr(*id, key))),
            },
            (Item::Doc, Axis::Child) => out.extend((!tree.nodes.is_empty()).then_some(Item::Node(0))),
            (Item::Doc, Axis::Descendant | Axis::DescendantOrSelf) => {
                if axis == Axis::DescendantOrSelf {
                    out.push(Item::Doc);
                }
                if let Test::Named(name) = test {
                    out.truncate(start);
                    out.extend(tree.named.get(name.as_ref()).into_iter().flatten().map(|found| Item::Node(*found)));
                    return;
                }
                out.extend((0..tree.nodes.len() as u32).map(Item::Node));
            }
            (Item::Attr(id, _), Axis::Parent) => out.push(Item::Node(*id)),
            (Item::Attr(id, _), Axis::Ancestor | Axis::AncestorOrSelf) => {
                if axis == Axis::AncestorOrSelf {
                    out.push(from.clone());
                }
                self.reach(&Item::Node(*id), Axis::AncestorOrSelf, &Test::Any, out);
            }
            (Item::Attr(..), Axis::DescendantOrSelf) => out.push(from.clone()),
            (Item::Xml(xml), Axis::Child) => out.extend(xml.children.iter().map(|kid| Item::Xml(kid.clone()))),
            (Item::Xml(xml), Axis::Descendant | Axis::DescendantOrSelf) => {
                if axis == Axis::DescendantOrSelf {
                    out.push(from.clone());
                }
                for kid in &xml.children {
                    self.reach(&Item::Xml(kid.clone()), Axis::DescendantOrSelf, &Test::Any, out);
                }
            }
            (Item::Xml(xml), Axis::Attribute) => {
                if matches!(test, Test::Named(name) if name.as_ref() == "nr") {
                    out.extend(xml.number.map(Item::Whole));
                }
                return;
            }
            _ => {}
        }
        if !matches!(test, Test::Any) {
            let mut kept = start;
            for at in start..out.len() {
                if self.matches(&out[at], test, attribute) {
                    out.swap(kept, at);
                    kept += 1;
                }
            }
            out.truncate(kept);
        }
    }

    /// Whether an expression gives at least one item. Stops at the first one, as XPath processors do,
    /// so `exists(a//b[...])` does not visit every `b`.
    fn any(&self, expr: &Expr, focus: &Focus, env: &mut Env) -> bool {
        match expr {
            Expr::Step(axis, test, predicates) => match focus.item {
                Some(item) => {
                    let mut reached = Vec::new();
                    self.reach(item, *axis, test, &mut reached);
                    let Some((last, earlier)) = predicates.split_last() else { return !reached.is_empty() };
                    for predicate in earlier {
                        reached = self.filter(reached, predicate, env);
                    }
                    self.any_kept(&reached, last, env)
                }
                None => !self.eval(expr, focus, env).is_empty(),
            },
            Expr::Path(left, right) => {
                let from = self.eval(left, focus, env);
                let size = from.len();
                from.items().iter().enumerate().any(|(index, item)| self.any(right, &Focus { item: Some(item), position: index + 1, size }, env))
            }
            Expr::Filter(base, predicate) => {
                let from = self.eval(base, focus, env);
                self.any_kept(from.items(), predicate, env)
            }
            _ => !self.eval(expr, focus, env).is_empty(),
        }
    }

    fn any_kept(&self, candidates: &[Item], predicate: &Expr, env: &mut Env) -> bool {
        if let Expr::Whole(wanted) = predicate {
            return *wanted >= 1 && *wanted as usize <= candidates.len();
        }
        let size = candidates.len();
        candidates.iter().enumerate().any(|(index, candidate)| self.keeps(predicate, candidate, index, size, env))
    }

    /// Whether a predicate keeps the candidate at a place: a number names the place, anything else is a condition.
    fn keeps(&self, predicate: &Expr, candidate: &Item, index: usize, size: usize, env: &mut Env) -> bool {
        let focus = Focus { item: Some(candidate), position: index + 1, size };
        if conditional(predicate) {
            return self.test(predicate, &focus, env);
        }
        let found = self.eval(predicate, &focus, env);
        match found.items() {
            [Item::Whole(wanted)] => *wanted == index as i64 + 1,
            [Item::Real(wanted)] => *wanted == index as f64 + 1.0,
            _ => self.truth(&found),
        }
    }

    /// The boolean value of an expression, looking no further than needed.
    pub fn test(&self, expr: &Expr, focus: &Focus, env: &mut Env) -> bool {
        match expr {
            Expr::And(left, right) => self.test(left, focus, env) && self.test(right, focus, env),
            Expr::Or(left, right) => self.test(left, focus, env) || self.test(right, focus, env),
            Expr::Call(name, arguments) if arguments.len() == 1 => match name.as_ref() {
                "exists" => self.any(&arguments[0], focus, env),
                "empty" => !self.any(&arguments[0], focus, env),
                "not" => !self.test(&arguments[0], focus, env),
                "boolean" => self.test(&arguments[0], focus, env),
                _ => self.truth(&self.eval(expr, focus, env)),
            },
            _ if nodes_only(expr) => self.any(expr, focus, env),
            _ => self.truth(&self.eval(expr, focus, env)),
        }
    }

    fn filter(&self, mut candidates: Vec<Item>, predicate: &Expr, env: &mut Env) -> Vec<Item> {
        if let Expr::Whole(wanted) = predicate {
            let at = *wanted as usize;
            if at >= 1 && at <= candidates.len() {
                candidates.swap(0, at - 1);
                candidates.truncate(1);
            } else {
                candidates.clear();
            }
            return candidates;
        }
        // Kept candidates move to the front; the ones still to be asked stay where they are.
        let size = candidates.len();
        let mut kept = 0;
        for index in 0..size {
            if self.keeps(predicate, &candidates[index], index, size, env) {
                candidates.swap(kept, index);
                kept += 1;
            }
        }
        candidates.truncate(kept);
        candidates
    }

    fn step(&self, from: &[Item], axis: Axis, test: &Test, predicates: &[Expr], env: &mut Env) -> Seq {
        let mut all = Vec::new();
        let backwards = matches!(axis, Axis::Ancestor | Axis::AncestorOrSelf | Axis::PrecedingSibling | Axis::Preceding);
        for item in from {
            if predicates.is_empty() {
                self.reach(item, axis, test, &mut all);
                continue;
            }
            let mut reached = Vec::new();
            self.reach(item, axis, test, &mut reached);
            for predicate in predicates {
                reached = self.filter(reached, predicate, env);
            }
            all.append(&mut reached);
        }
        if backwards && from.len() == 1 {
            all.reverse();
        }
        Seq::from(in_order(all))
    }

    fn lookup(&self, base: &Seq, key: &Key, focus: &Focus, env: &mut Env) -> Seq {
        let keys: Option<Vec<Item>> = match key {
            Key::Name(name) => Some(vec![Item::Text(name.clone())]),
            Key::Whole(whole) => Some(vec![Item::Whole(*whole)]),
            Key::All => None,
            Key::Computed(inner) => Some(self.atoms(&self.eval(inner, focus, env))),
        };
        let mut out = Vec::new();
        for item in base.items() {
            match (item, &keys) {
                (Item::Map(entries), Some(keys)) => {
                    for key in keys {
                        if let Some((_, value)) = entries.iter().find(|(known, _)| self.same(known, key)) {
                            out.extend_from_slice(value.items());
                        }
                    }
                }
                (Item::Map(entries), None) => entries.iter().for_each(|(_, value)| out.extend_from_slice(value.items())),
                (Item::Array(members), Some(keys)) => {
                    for key in keys {
                        let at = self.number_of(key) as usize;
                        if at >= 1 && at <= members.len() {
                            out.extend_from_slice(members[at - 1].items());
                        }
                    }
                }
                (Item::Array(members), None) => members.iter().for_each(|member| out.extend_from_slice(member.items())),
                _ => {}
            }
        }
        Seq::from(out)
    }

    pub fn apply(&self, function: &Item, arguments: Vec<Seq>, env: &mut Env) -> Seq {
        match function {
            Item::Function(function) => match function.as_ref() {
                Function::Inline(lambda, captured) => {
                    if lambda.parameters.len() != arguments.len() {
                        return self.fail(|| format!("a function of {} parameters got {} arguments", lambda.parameters.len(), arguments.len()));
                    }
                    let mut inner: Env = captured.clone();
                    inner.extend(lambda.parameters.iter().copied().zip(arguments.into_iter().map(Bound::Now)));
                    self.eval(&lambda.body, &NOWHERE, &mut inner)
                }
                Function::Named(name, _) => self.call(name, arguments, &NOWHERE, env),
            },
            Item::Map(entries) => {
                let key = arguments.first().and_then(|key| self.atoms(key).into_iter().next());
                key.and_then(|key| entries.iter().find(|(known, _)| self.same(known, &key)).map(|(_, value)| value.clone())).unwrap_or(Seq::Empty)
            }
            Item::Array(members) => {
                let at = arguments.first().map_or(0, |at| self.number_of(at.items().first().unwrap_or(&Item::Whole(0))) as usize);
                if at >= 1 && at <= members.len() { members[at - 1].clone() } else { Seq::Empty }
            }
            _ => self.fail(|| "called something that is no function".to_string()),
        }
    }

    fn math(&self, op: Math, left: &Seq, right: &Seq) -> Seq {
        let (left, right) = (self.atoms(left), self.atoms(right));
        if left.len() > 1 || right.len() > 1 {
            return self.fail(|| "arithmetic on a sequence of several values".to_string());
        }
        let (Some(left), Some(right)) = (left.first(), right.first()) else { return Seq::Empty };
        if matches!(left, Item::Text(_) | Item::Flag(_)) || matches!(right, Item::Text(_) | Item::Flag(_)) {
            return self.fail(|| "arithmetic on a value that is no number".to_string());
        }
        if let (Item::Whole(a), Item::Whole(b)) = (left, right) {
            let whole = match op {
                Math::Add => a.checked_add(*b),
                Math::Sub => a.checked_sub(*b),
                Math::Mul => a.checked_mul(*b),
                Math::WholeDiv => a.checked_div(*b),
                Math::Rest => a.checked_rem(*b),
                Math::Div if *b == 0 => return self.fail(|| "whole number division by zero".to_string()),
                Math::Div => (a % b == 0).then(|| a / b),
            };
            if let Some(whole) = whole {
                return Seq::whole(whole);
            }
            if op != Math::Div {
                return self.fail(|| "whole number arithmetic went out of range".to_string());
            }
        }
        let (a, b) = (self.number_of(left), self.number_of(right));
        Seq::One(match op {
            Math::Add => Item::Real(a + b),
            Math::Sub => Item::Real(a - b),
            Math::Mul => Item::Real(a * b),
            Math::Div => Item::Real(a / b),
            Math::WholeDiv => Item::Whole((a / b).trunc() as i64),
            Math::Rest => Item::Real(a % b),
        })
    }

    pub fn variable(&self, env: &mut Env, name: u32) -> Option<Seq> {
        let later = match &env.iter().rev().find(|(known, _)| *known == name)?.1 {
            Bound::Now(value) => return Some(value.clone()),
            Bound::Later(later) => later.clone(),
        };
        if let Some(value) = later.done.borrow().as_ref() {
            return Some(value.clone());
        }
        // The value sees the bindings that were in scope at its declaration: those are still the first ones.
        let newer = env.split_off(later.depth.min(env.len()));
        let focus = Focus { item: later.item.as_ref(), position: later.position, size: later.size };
        let value = self.eval(&later.value, &focus, env);
        env.extend(newer);
        *later.done.borrow_mut() = Some(value.clone());
        Some(value)
    }

    pub fn eval(&self, expr: &Expr, focus: &Focus, env: &mut Env) -> Seq {
        match expr {
            Expr::Whole(whole) => Seq::whole(*whole),
            Expr::Real(real) => Seq::One(Item::Real(*real)),
            Expr::Text(text) => Seq::One(Item::Text(text.clone())),
            Expr::Variable(name) => self.variable(env, *name).unwrap_or_else(|| self.fail(|| format!("variable {name} is not set"))),
            Expr::Context => match focus.item {
                Some(item) => Seq::One(item.clone()),
                None => self.fail(|| "no context item".to_string()),
            },
            Expr::Root => Seq::One(Item::Doc),
            Expr::Fixed(known) => known.clone(),
            Expr::Sequence(parts) => {
                let mut all = Vec::new();
                for part in parts {
                    match self.eval(part, focus, env) {
                        Seq::Empty => {}
                        Seq::One(item) => all.push(item),
                        Seq::Many(items) => all.extend_from_slice(&items),
                    }
                }
                Seq::from(all)
            }
            Expr::Step(axis, test, predicates) => match focus.item {
                Some(item) => self.step(std::slice::from_ref(item), *axis, test, predicates, env),
                None => self.fail(|| "a path step without a context item".to_string()),
            },
            Expr::Path(left, right) => {
                let from = self.eval(left, focus, env);
                if from.is_empty() {
                    return Seq::Empty;
                }
                if let Expr::Step(axis, test, predicates) = right.as_ref() {
                    return self.step(from.items(), *axis, test, predicates, env);
                }
                let size = from.len();
                let mut all = Vec::new();
                for (index, item) in from.items().iter().enumerate() {
                    all.extend(self.eval(right, &Focus { item: Some(item), position: index + 1, size }, env).into_vec());
                }
                Seq::from(if all.iter().all(Item::is_node) { in_order(all) } else { all })
            }
            Expr::Each(left, right) => {
                let from = self.eval(left, focus, env);
                let size = from.len();
                let mut all = Vec::new();
                for (index, item) in from.items().iter().enumerate() {
                    all.extend(self.eval(right, &Focus { item: Some(item), position: index + 1, size }, env).into_vec());
                }
                Seq::from(all)
            }
            Expr::Filter(base, predicate) => {
                let from = self.eval(base, focus, env);
                if from.is_empty() {
                    return Seq::Empty;
                }
                Seq::from(self.filter(from.into_vec(), predicate, env))
            }
            Expr::Call(name, arguments) if arguments.len() == 1 && matches!(name.as_ref(), "exists" | "empty" | "not" | "boolean") => {
                Seq::flag(self.test(expr, focus, env))
            }
            Expr::Call(name, arguments) => {
                let values: Vec<Seq> = arguments.iter().map(|argument| self.eval(argument, focus, env)).collect();
                self.call(name, values, focus, env)
            }
            Expr::Dynamic(base, arguments) => {
                let function = self.eval(base, focus, env);
                let values: Vec<Seq> = arguments.iter().map(|argument| self.eval(argument, focus, env)).collect();
                match function.items() {
                    [only] => self.apply(only, values, env),
                    _ => self.fail(|| "called a sequence that is not one function".to_string()),
                }
            }
            Expr::Inline(lambda) => Seq::One(Item::Function(Rc::new(Function::Inline(lambda.clone(), env.clone())))),
            Expr::Reference(name, arity) => Seq::One(Item::Function(Rc::new(Function::Named(name.clone(), *arity)))),
            Expr::Map(entries) => {
                let mut built = Vec::with_capacity(entries.len());
                for (key, value) in entries {
                    let key = self.atoms(&self.eval(key, focus, env)).into_iter().next().unwrap_or(Item::text(""));
                    built.push((key, self.eval(value, focus, env)));
                }
                Seq::One(Item::Map(Rc::new(built)))
            }
            Expr::Array(members) => Seq::One(Item::Array(Rc::new(members.iter().map(|member| self.eval(member, focus, env)).collect()))),
            Expr::Lookup(base, key) => {
                let from = self.eval(base, focus, env);
                self.lookup(&from, key, focus, env)
            }
            Expr::OwnLookup(key) => match focus.item {
                Some(item) => self.lookup(&Seq::One(item.clone()), key, focus, env),
                None => self.fail(|| "a lookup without a context item".to_string()),
            },
            Expr::Let(name, value, body, false) => {
                let value = self.eval(value, focus, env);
                env.push((*name, Bound::Now(value)));
                let result = self.eval(body, focus, env);
                env.pop();
                result
            }
            Expr::Let(name, value, body, true) => {
                let later = Later {
                    value: value.clone(),
                    item: focus.item.cloned(),
                    position: focus.position,
                    size: focus.size,
                    depth: env.len(),
                    done: std::cell::RefCell::new(None),
                };
                env.push((*name, Bound::Later(Rc::new(later))));
                let result = self.eval(body, focus, env);
                env.pop();
                result
            }
            Expr::For(name, range, body) => {
                let range = self.eval(range, focus, env);
                let mut all = Vec::new();
                for item in range.items() {
                    env.push((*name, Bound::Now(Seq::One(item.clone()))));
                    match self.eval(body, focus, env) {
                        Seq::Empty => {}
                        Seq::One(item) => all.push(item),
                        Seq::Many(items) => all.extend_from_slice(&items),
                    }
                    env.pop();
                }
                Seq::from(all)
            }
            Expr::Quantified(every, name, range, body) => {
                let range = self.eval(range, focus, env);
                for item in range.items() {
                    env.push((*name, Bound::Now(Seq::One(item.clone()))));
                    let holds = self.test(body, focus, env);
                    env.pop();
                    if holds != *every {
                        return Seq::flag(!*every);
                    }
                }
                Seq::flag(*every)
            }
            Expr::If(condition, then, otherwise) => {
                if self.test(condition, focus, env) { self.eval(then, focus, env) } else { self.eval(otherwise, focus, env) }
            }
            Expr::Or(..) | Expr::And(..) => Seq::flag(self.test(expr, focus, env)),
            Expr::General(cmp, left, right) => {
                let left = self.eval(left, focus, env);
                if left.is_empty() {
                    return Seq::flag(false);
                }
                let right = self.eval(right, focus, env);
                let (left, right) = (self.atoms(&left), self.atoms(&right));
                Seq::flag(left.iter().any(|a| right.iter().any(|b| self.holds(*cmp, a, b))))
            }
            Expr::Single(cmp, left, right) => {
                let (left, right) = (self.atoms(&self.eval(left, focus, env)), self.atoms(&self.eval(right, focus, env)));
                if left.len() > 1 || right.len() > 1 {
                    return self.fail(|| "a value comparison of a sequence of several values".to_string());
                }
                match (left.first(), right.first()) {
                    (Some(a), Some(b)) => Seq::flag(self.holds(*cmp, a, b)),
                    _ => Seq::Empty,
                }
            }
            Expr::Nodes(order, left, right) => {
                let (left, right) = (self.eval(left, focus, env), self.eval(right, focus, env));
                match (left.items().first(), right.items().first()) {
                    (Some(a), Some(b)) => Seq::flag(match order {
                        Order::Same => match (a, b) {
                            (Item::Xml(a), Item::Xml(b)) => Rc::ptr_eq(a, b),
                            (Item::Doc, Item::Doc) => true,
                            (Item::Node(_) | Item::Attr(..), Item::Node(_) | Item::Attr(..)) => a.rank() == b.rank(),
                            _ => false,
                        },
                        Order::Before => a.rank() < b.rank(),
                        Order::After => a.rank() > b.rank(),
                    }),
                    _ => Seq::Empty,
                }
            }
            Expr::Concat(left, right) => {
                let (left, right) = (self.eval(left, focus, env), self.eval(right, focus, env));
                Seq::owned(self.string(&left) + &self.string(&right))
            }
            Expr::Range(left, right) => {
                let (left, right) = (self.atoms(&self.eval(left, focus, env)), self.atoms(&self.eval(right, focus, env)));
                match (left.first(), right.first()) {
                    (Some(from), Some(to)) => {
                        let (from, to) = (self.number_of(from) as i64, self.number_of(to) as i64);
                        Seq::from((from..=to).map(Item::Whole).collect())
                    }
                    _ => Seq::Empty,
                }
            }
            Expr::Math(op, left, right) => {
                let (left, right) = (self.eval(left, focus, env), self.eval(right, focus, env));
                self.math(*op, &left, &right)
            }
            Expr::Negate(inner) => match self.atoms(&self.eval(inner, focus, env)).first() {
                Some(Item::Whole(whole)) => Seq::whole(-whole),
                Some(other) => Seq::One(Item::Real(-self.number_of(other))),
                None => Seq::Empty,
            },
            Expr::Sets(op, left, right) => {
                let (left, right) = (self.eval(left, focus, env), self.eval(right, focus, env));
                let all = match op {
                    Sets::Union => {
                        let mut all = left.into_vec();
                        all.extend(right.into_vec());
                        all
                    }
                    Sets::Intersect | Sets::Except => {
                        let other: std::collections::HashSet<(u32, u8, &'static str)> = right.items().iter().map(Item::rank).collect();
                        left.into_vec().into_iter().filter(|item| other.contains(&item.rank()) == (*op == Sets::Intersect)).collect()
                    }
                };
                let mut all = all;
                all.sort_by_key(Item::rank);
                all.dedup_by_key(|item| item.rank());
                Seq::from(all)
            }
        }
    }

    pub fn xml(name: &'static str, text: &str, number: Option<i64>, children: Vec<Rc<Xml>>) -> Rc<Xml> {
        Rc::new(Xml { name, text: text.to_string(), number, children })
    }
}

/// Whether an expression can only give nodes: a path that ends in a step.
fn nodes_only(expr: &Expr) -> bool {
    match expr {
        Expr::Step(..) => true,
        Expr::Path(_, right) => nodes_only(right),
        Expr::Filter(base, _) => nodes_only(base),
        _ => false,
    }
}

/// Whether a predicate is a condition whatever it gives, never the number of a place.
fn conditional(predicate: &Expr) -> bool {
    match predicate {
        Expr::And(..) | Expr::Or(..) => true,
        Expr::Call(name, arguments) => arguments.len() == 1 && matches!(name.as_ref(), "exists" | "empty" | "not" | "boolean"),
        _ => nodes_only(predicate),
    }
}

/// A number written as XPath reads one: decimal or exponent notation, `INF`, `-INF` or `NaN`; anything else is not one.
pub fn written_number(text: &str) -> Option<f64> {
    let text = text.trim_matches([' ', '\t', '\n', '\r']);
    match text {
        "INF" | "+INF" => return Some(f64::INFINITY),
        "-INF" => return Some(f64::NEG_INFINITY),
        "NaN" => return Some(f64::NAN),
        _ => {}
    }
    let digits = text.strip_prefix(['+', '-']).unwrap_or(text);
    if digits.is_empty() || !digits.chars().all(|c| c.is_ascii_digit() || matches!(c, '.' | 'e' | 'E' | '+' | '-')) {
        return None;
    }
    text.parse().ok()
}
