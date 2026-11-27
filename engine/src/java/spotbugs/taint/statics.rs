//! What a static field of the class being reported holds: what the static initializer stores in it, or, for a
//! field the initializer leaves alone, tainted when a method of the class stores a tainted value in it.
use super::flow::{Flow, Mode, Shared};
use super::{Level, Value};
use crate::engine::source::children;
use crate::java::helpers::has_modifier;
use std::collections::HashMap;
use std::rc::Rc;
use tree_sitter::Node;

pub fn value(flow: &Flow, class: &str, field: &str) -> Value {
    if flow.mode == Mode::Summary || class != flow.own {
        return Value::UNKNOWN;
    }
    let shared = flow.shared;
    let known = shared.statics.borrow().get(class).cloned();
    let fields = match known {
        Some(Some(fields)) => fields,
        Some(None) => return Value::UNKNOWN,
        None => {
            shared.statics.borrow_mut().insert(class.to_string(), None);
            let fields = Rc::new(work(shared, flow.own));
            shared.statics.borrow_mut().insert(class.to_string(), Some(fields.clone()));
            fields
        }
    };
    fields.get(field).copied().unwrap_or(Value::UNKNOWN)
}

fn members(class: Node) -> Vec<Node> {
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    let Some(body) = body else { return Vec::new() };
    let mut found = children(body);
    found.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    found
}

fn work<'c>(shared: &Shared<'c, '_>, own: &'c str) -> HashMap<String, Value> {
    let context = shared.context;
    let Some(class) = context.classes.get(own) else { return HashMap::new() };
    let mut initial: HashMap<String, Value> = HashMap::new();
    let mut later: HashMap<String, Value> = HashMap::new();
    for member in members(*class) {
        match member.kind() {
            "field_declaration" if has_modifier(member, "static") => {
                for declarator in children(member).into_iter().filter(|part| part.kind() == "variable_declarator") {
                    let (Some(name), Some(given)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value")) else { continue };
                    let flow = Flow::new(shared, own, given, None, Mode::Report).run();
                    let held = initial.entry(context.text(name).to_string()).or_default();
                    *held = held.merge(flow.value(given));
                }
            }
            "static_initializer" => {
                for block in children(member).into_iter().filter(|part| part.kind() == "block") {
                    for (name, given) in Flow::new(shared, own, block, None, Mode::Report).run().stores {
                        let held = initial.entry(name).or_default();
                        *held = held.merge(given);
                    }
                }
            }
            "method_declaration" | "constructor_declaration" => {
                let Some(body) = member.child_by_field_name("body") else { continue };
                if !context.text(body).contains('=') {
                    continue;
                }
                let flow = Flow::new(shared, own, body, member.child_by_field_name("parameters"), Mode::Report).run();
                for (name, given) in flow.stores {
                    let held = later.entry(name).or_default();
                    *held = held.merge(given);
                }
            }
            _ => {}
        }
    }
    for (name, given) in later {
        initial.entry(name).or_insert(if given.level == Level::Tainted { Value::TAINTED } else { Value::UNKNOWN });
    }
    initial.into_iter().map(|(name, value)| (name, Value { params: 0, ..value })).collect()
}
