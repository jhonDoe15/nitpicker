//! What a call gives back and does to what it is handed: a row of the measured table for JDK and servlet
//! methods, the body of a method of the run, or nothing known.
use super::flow::{Flow, Mode, Shared, State};
use super::{Value, jdk};
use crate::engine::source::{ancestor, children, named_children};
use crate::java::spotbugs::Context;
use crate::java::types::expr::Call;
use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::sync::{Arc, RwLock};
use tree_sitter::Node;

/// A method: declaring class, name and erased parameter types.
pub type Key = (String, String, String);

/// What a method of the run does with what it is handed.
#[derive(Clone, Debug)]
pub struct Summary {
    pub result: Value,
    /// Parameters the method appends to, with what they hold after the call.
    pub mutated: Vec<(usize, Value)>,
}

impl Summary {
    const UNKNOWN: Summary = Summary { result: Value::UNKNOWN, mutated: Vec::new() };
}

/// Summaries of the methods of the run, worked out once for the whole run.
#[derive(Default)]
pub struct Summaries {
    known: RwLock<HashMap<Key, Option<Arc<Summary>>>>,
}

/// A call of a method of the run found while looking for sinks: what it hands over.
pub struct Site {
    pub callee: Key,
    pub this: Value,
    pub arguments: Vec<Value>,
}

/// How deep calls are followed.
const DEEPEST: usize = 48;

thread_local! {
    /// The methods being worked out on this thread, outermost first.
    static RUNNING: RefCell<Vec<Key>> = const { RefCell::new(Vec::new()) };
    /// The lowest place on `RUNNING` that a cut circle or depth limit made unknown: the summaries at or above it
    /// depend on where the outermost call started, so they are kept only until it ends.
    static CUT: Cell<usize> = const { Cell::new(usize::MAX) };
    /// Summaries that depend on a cut, for the outermost call being worked out.
    static LOCAL: RefCell<HashMap<Key, Option<Arc<Summary>>>> = RefCell::new(HashMap::new());
}

pub fn key(call: &Call) -> Key {
    let parameters: Vec<String> = call.method.parameters.iter().map(|kind| kind.erased().name()).collect();
    (call.declaring.clone(), call.method.name.clone(), parameters.join(","))
}

fn arguments<'a>(call: Node<'a>) -> Vec<Node<'a>> {
    let listed = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
    listed.into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// The values handed over, a variable number of trailing arguments merged into the array they become.
fn handed(flow: &Flow, call: &Call, given: &[Node], copy: usize) -> Vec<Value> {
    let mut values: Vec<Value> = given.iter().map(|argument| flow.get(*argument, copy)).collect();
    let count = call.method.parameters.len();
    let packed = call.method.varargs && count > 0 && (values.len() != count || {
        let last = given.last().and_then(|last| flow.context().resolver.type_of(*last));
        !last.is_some_and(|kind| matches!(kind, crate::java::types::model::Type::Array(_) | crate::java::types::model::Type::Null))
    });
    if packed {
        let rest = values.split_off((count - 1).min(values.len()));
        values.push(rest.into_iter().fold(Value::SAFE, Value::merge));
    }
    values
}

fn start(flow: &Flow, call: &Call, object: Option<Node>) -> String {
    let typed = object.and_then(|object| flow.context().resolver.type_of(object));
    match typed.map(|kind| kind.erased()) {
        Some(crate::java::types::model::Type::Class(name, _)) => name,
        _ => call.declaring.clone(),
    }
}

/// Whether a call is one the table says changes the local it is made on.
pub fn mutates(flow: &Flow, node: Node) -> bool {
    let Some(call) = flow.context().resolver.resolve_call(node) else { return false };
    let (_, name, parameters) = key(&call);
    let owner = start(flow, &call, node.child_by_field_name("object"));
    jdk::row(flow.context().resolver.index, &owner, &name, &parameters).is_some_and(|row| row.mutates)
}

fn in_run(context: &Context, declaring: &str) -> bool {
    context.classes.contains_key(declaring) || context.project.sources.contains_key(declaring)
}

pub fn invoke<'a>(flow: &mut Flow<'_, '_, 'a>, node: Node<'a>, copy: usize, state: &mut State) -> Value {
    let context = flow.context();
    let given = arguments(node);
    let Some(call) = context.resolver.resolve_call(node) else {
        flow.spoil(&given, state);
        return Value::UNKNOWN;
    };
    let object = node.child_by_field_name("object");
    let this = match object {
        Some(object) if !call.method.is_static => flow.get(object, copy),
        None if !call.method.is_static => flow.this,
        _ => Value::SAFE,
    };
    let (_, name, parameters) = key(&call);
    if let Some(row) = jdk::row(context.resolver.index, &start(flow, &call, object), &name, &parameters) {
        let mut values = handed(flow, &call, &given, copy);
        if row.spoils {
            flow.spoil(&given, state);
            for (position, argument) in given.iter().enumerate() {
                if let Some(value) = values.get_mut(position).filter(|_| flow.spoilable(*argument)) {
                    *value = Value::UNKNOWN;
                }
            }
        }
        let result = row.result.at(this, &values);
        if row.mutates
            && let Some(target) = object.and_then(|object| flow.target(object))
        {
            let held = state.get(&target).copied().unwrap_or(Value::UNKNOWN);
            state.insert(target, held.merge(result));
        }
        return result;
    }
    let interface = context.resolver.index.get(&call.declaring).is_some_and(|info| info.is_interface) && !call.method.is_static;
    if in_run(context, &call.declaring) && !interface && !call.method.is_abstract
        && let Some(summary) = summary(flow.shared, &call)
    {
        let values = handed(flow, &call, &given, copy);
        for (position, after) in &summary.mutated {
            if let Some(target) = given.get(*position).and_then(|argument| flow.target(*argument)) {
                let held = state.get(&target).copied().unwrap_or(Value::UNKNOWN);
                state.insert(target, held.merge(after.at(this, &values)));
            }
        }
        if flow.mode == Mode::Report {
            flow.sites.push(Site { callee: key(&call), this, arguments: values.clone() });
        }
        return summary.result.at(this, &values);
    }
    flow.spoil(&given, state);
    Value::UNKNOWN
}

pub fn create<'a>(flow: &mut Flow<'_, '_, 'a>, node: Node<'a>, copy: usize, state: &mut State) -> Value {
    let context = flow.context();
    let given = arguments(node);
    if children(node).iter().any(|part| part.kind() == "class_body") {
        if let Some(call) = context.resolver.resolve_constructor(node).filter(|call| in_run(context, &call.declaring)) {
            constructed(flow, &call, &given, copy);
        }
        return Value::SAFE;
    }
    let Some(call) = context.resolver.resolve_constructor(node) else {
        flow.spoil(&given, state);
        return Value::UNKNOWN;
    };
    let (_, _, parameters) = key(&call);
    if let Some(row) = jdk::row(context.resolver.index, &call.declaring, "<init>", &parameters) {
        if row.spoils {
            flow.spoil(&given, state);
        }
        return row.result.at(Value::SAFE, &handed(flow, &call, &given, copy));
    }
    if in_run(context, &call.declaring) {
        constructed(flow, &call, &given, copy);
        return Value::SAFE;
    }
    flow.spoil(&given, state);
    Value::UNKNOWN
}

/// Keeps a call of a constructor of the run, so that its parameters know what the calls of the run hand them.
fn constructed(flow: &mut Flow, call: &Call, given: &[Node], copy: usize) {
    if flow.mode == Mode::Report {
        let arguments = handed(flow, call, given, copy);
        flow.sites.push(Site { callee: constructor(call), this: Value::SAFE, arguments });
    }
}

/// The key of the constructor a call names.
pub fn constructor(call: &Call) -> Key {
    let (declaring, _, parameters) = key(call);
    (declaring, "<init>".to_string(), parameters)
}

/// `this(...)` or `super(...)` of a constructor of the run.
pub fn delegate<'a>(flow: &mut Flow<'_, '_, 'a>, node: Node<'a>, copy: usize) -> Value {
    let context = flow.context();
    if let Some(call) = context.resolver.resolve_delegation(node)
        && in_run(context, &call.declaring)
    {
        constructed(flow, &call, &arguments(node), copy);
    }
    Value::SAFE
}

/// The summary of a method of the run with a body, worked out from that body the first time it is asked for.
pub fn summary(shared: &Shared, call: &Call) -> Option<Arc<Summary>> {
    let context = shared.context;
    let summaries = &context.elsewhere.taint;
    let wanted = key(call);
    if let Some(known) = summaries.known.read().ok()?.get(&wanted) {
        return known.clone();
    }
    if let Some(known) = LOCAL.with(|local| local.borrow().get(&wanted).cloned()) {
        return known;
    }
    let cut = RUNNING.with(|running| {
        let running = running.borrow();
        running.iter().position(|key| *key == wanted).or(if running.len() >= DEEPEST { Some(0) } else { None })
    });
    if let Some(place) = cut {
        CUT.with(|cut| cut.set(cut.get().min(place)));
        return Some(Arc::new(Summary::UNKNOWN));
    }
    let place = RUNNING.with(|running| {
        running.borrow_mut().push(wanted.clone());
        running.borrow().len() - 1
    });
    let found = if context.classes.contains_key(&call.declaring) {
        work(shared, call)
    } else {
        context.elsewhere.within(context.project, &call.declaring, |other| work(&Shared::new(other), call)).flatten()
    };
    RUNNING.with(|running| running.borrow_mut().pop());
    let found = found.map(Arc::new);
    let depends = CUT.with(|cut| {
        let depends = cut.get() <= place;
        if cut.get() == place {
            cut.set(usize::MAX);
        }
        depends
    });
    if depends {
        LOCAL.with(|local| local.borrow_mut().insert(wanted, found.clone()));
    } else if let Ok(mut known) = summaries.known.write() {
        known.insert(wanted, found.clone());
    }
    if place == 0 {
        LOCAL.with(|local| local.borrow_mut().clear());
    }
    found
}

fn work(shared: &Shared, call: &Call) -> Option<Summary> {
    let context = shared.context;
    let class = context.classes.get(&call.declaring)?;
    let declaration = declaration(context, *class, call)?;
    let body = declaration.child_by_field_name("body")?;
    let parameters = declaration.child_by_field_name("parameters");
    let flow = Flow::new(shared, context.classes.get_key_value(&call.declaring)?.0, body, parameters, Mode::Summary).run();
    let result = if call.method.name == "<init>" { Value::SAFE } else { flow.returned };
    Some(Summary { result, mutated: flow.mutated })
}

fn declaration<'a>(context: &Context<'a>, class: Node<'a>, call: &Call) -> Option<Node<'a>> {
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"))?;
    let mut members = children(body);
    members.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    members.into_iter().find(|member| {
        let named = match member.kind() {
            "method_declaration" => member.child_by_field_name("name").is_some_and(|name| context.text(name) == call.method.name),
            "constructor_declaration" => call.method.name == "<init>",
            _ => false,
        };
        named && context.resolver.parameters(member.child_by_field_name("parameters")).0 == call.method.parameters
    })
}

/// The method a declaration is, as calls name it.
pub fn declared(context: &Context, own: &str, declaration: Node) -> Key {
    let name = match declaration.kind() {
        "constructor_declaration" | "compact_constructor_declaration" => "<init>".to_string(),
        _ => declaration.child_by_field_name("name").map(|name| context.text(name).to_string()).unwrap_or_default(),
    };
    let listed = if declaration.kind() == "compact_constructor_declaration" { ancestor(declaration, &["record_declaration"]) } else { Some(declaration) };
    let parameters = listed.and_then(|listed| listed.child_by_field_name("parameters"));
    let parameters: Vec<String> = context.resolver.parameters(parameters).0.iter().map(|kind| kind.erased().name()).collect();
    (own.to_string(), name, parameters.join(","))
}
