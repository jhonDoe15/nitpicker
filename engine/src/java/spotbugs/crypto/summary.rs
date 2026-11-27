//! What the whole run stores in each `String` field, as SpotBugs sums it up before it reads the code: a field holds
//! a known string when every store of every class gives that string (an initializer, `x = ..`, `this.x = ..`,
//! `o.x = ..`, in a constructor, an initializer block, a method or a lambda), measured on test code. A compound
//! store or a value nobody knows spoils it, and so does the default of an instance field that a constructor not
//! starting with `this(...)` may leave unset: one that has no initializer, is not set by an initializer block, and
//! is not set anywhere in that constructor's own code. A static field's default does not count. A field Lombok
//! may set, or one nothing stores into, holds nothing known.
//!
//! Findings of a call on a line where an argument reads a field wait until every file is read.
use super::super::dumb::ranges::fields::lombok_sets;
use super::super::fields::field_key;
use super::super::observed::field_stores;
use super::super::Context;
use super::algorithms::{DES, Use, hits};
use super::values::{Held, Key, held};
use crate::engine::finding::Finding;
use crate::engine::source::{children, parent};
use crate::java::helpers::{declarators, has_modifier};
use std::collections::HashMap;
use std::sync::Mutex;
use tree_sitter::Node;

/// The calls of one line of a method, with their findings made but for message and priority, by pattern.
pub struct Waiting {
    pub calls: Vec<(Use, Held)>,
    pub findings: Vec<Finding>,
}

#[derive(Default)]
pub struct Fields {
    /// Per field: each value stored, `None` for one nobody knows.
    stores: Mutex<HashMap<Key, Vec<Option<String>>>>,
    /// Per field declared in the run: whether something else than the stores may give it its value.
    open: Mutex<HashMap<Key, bool>>,
    waiting: Mutex<Vec<Waiting>>,
}

const STRING: &str = "java.lang.String";

fn writes_in(context: &Context, code: Node, key: &Key) -> bool {
    let mut found = false;
    let mut stack = vec![code];
    while let Some(node) = stack.pop() {
        if found || (node != code && matches!(node.kind(), "class_body" | "lambda_expression")) {
            continue;
        }
        if node.kind() == "assignment_expression" && node.child_by_field_name("left").and_then(|left| field_key(context, left)).as_ref() == Some(key) {
            found = true;
        }
        stack.extend(children(node));
    }
    found
}

/// Whether the default of an instance field may reach a reader, as `Fields` says.
fn defaulted(context: &Context, body: Node, key: &Key) -> bool {
    let members = super::super::place::members(body);
    if members.iter().any(|member| member.kind() == "block" && writes_in(context, *member, key)) {
        return false;
    }
    let constructors: Vec<Node> = members.into_iter().filter(|member| member.kind().ends_with("constructor_declaration")).collect();
    constructors.is_empty() || constructors.iter().any(|constructor| !super::super::classes::lines::delegates(*constructor) && !writes_in(context, *constructor, key))
}

impl Fields {
    /// Notes the `String` fields the file declares and every value it stores in one.
    pub fn note(&self, context: &Context) {
        let mut open = Vec::new();
        for (own, class) in &context.classes {
            let body = class.child_by_field_name("body").or_else(|| children(*class).into_iter().find(|part| part.kind() == "class_body"));
            let Some(body) = body.filter(|_| class.kind() != "interface_declaration") else { continue };
            for member in super::super::place::members(body).into_iter().filter(|member| member.kind() == "field_declaration") {
                if !member.child_by_field_name("type").is_some_and(|kind| matches!(context.text(kind), "String" | "java.lang.String")) {
                    continue;
                }
                let lombok = lombok_sets(context, *class, member);
                for declarator in declarators(member) {
                    let Some(name) = declarator.child_by_field_name("name") else { continue };
                    let key = (own.clone(), context.text(name).to_string());
                    let set = has_modifier(member, "static") || declarator.child_by_field_name("value").is_some() || !defaulted(context, body, &key);
                    open.push((key, lombok || !set));
                }
            }
        }
        let mut stored = Vec::new();
        for (key, values) in field_stores(context).iter() {
            let typed = context.resolver.index.field(&key.0, &key.1).is_some_and(|(_, field)| field.kind.name() == STRING);
            if !typed {
                continue;
            }
            for value in values {
                let compound = parent(*value).filter(|holder| holder.kind() == "assignment_expression").and_then(|holder| holder.child_by_field_name("operator")).is_some_and(|operator| context.text(operator) != "=");
                let text = match held(context, *value) {
                    Held::Text(text) if !compound => Some(text),
                    _ => None,
                };
                stored.push((key.clone(), text));
            }
        }
        self.open.lock().expect("fields").extend(open);
        let mut stores = self.stores.lock().expect("fields");
        for (key, text) in stored {
            stores.entry(key).or_default().push(text);
        }
    }

    pub fn wait(&self, waiting: Waiting) {
        self.waiting.lock().expect("fields").push(waiting);
    }

    fn value(&self, key: &Key) -> Option<String> {
        if self.open.lock().expect("fields").get(key) != Some(&false) {
            return None;
        }
        let stores = self.stores.lock().expect("fields");
        let values = stores.get(key)?;
        let first = values.first()?.clone()?;
        values.iter().all(|value| value.as_deref() == Some(first.as_str())).then_some(first)
    }

    /// Reports the waiting findings whose fields turned out to hold a string that makes them.
    pub fn settle(&self, out: &mut Vec<Finding>) {
        let waiting: Vec<Waiting> = self.waiting.lock().expect("fields").drain(..).collect();
        for waiting in waiting {
            out.extend(waiting.made(&|key| self.value(key)));
        }
    }
}

impl Waiting {
    /// The findings of the calls, once per pattern and message, with what each field holds.
    pub fn made(self, field: &dyn Fn(&Key) -> Option<String>) -> Vec<Finding> {
        let mut made: Vec<Finding> = Vec::new();
        for (used, value) in &self.calls {
            let text = match value {
                Held::Text(text) => Some(text.clone()),
                Held::Field(key) => field(key),
                Held::Unknown => None,
            };
            let from_field = matches!(value, Held::Field(_));
            for hit in text.map(|text| hits(*used, &text)).unwrap_or_default().into_iter().filter(|hit| !(from_field && hit.pattern == DES)) {
                if made.iter().any(|found| found.rule == hit.pattern && found.message == hit.message) {
                    continue;
                }
                let Some(skeleton) = self.findings.iter().find(|finding| finding.rule == hit.pattern) else { continue };
                made.push(Finding { message: hit.message, priority: Some(hit.priority), arguments: Some(hit.arguments), ..skeleton.clone() });
            }
        }
        made
    }
}
