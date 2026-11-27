//! Calls in ConstantPasswordDetector's view: the JDK sinks of `sinks.tsv`, which match on the class the compiled call
//! names (a call on a subclass of `KeyStore` is not checked), and the string methods that keep a value hard-coded.
use super::flow::{Values, Visit};
use super::{Hard, Held, KEY, Kind, Origin, PASSWORD};
use crate::java::flow::cfg::unwrap;
use crate::java::spotbugs::{Context, idioms, names, returns};
use crate::java::types::expr::Call;
use std::collections::HashMap;
use std::sync::OnceLock;
use tree_sitter::Node;

struct Sink {
    positions: Vec<usize>,
    password: bool,
}

type Key = (String, String, String);

fn sinks() -> &'static HashMap<Key, Sink> {
    static SINKS: OnceLock<HashMap<Key, Sink>> = OnceLock::new();
    SINKS.get_or_init(|| {
        let mut sinks = HashMap::new();
        for line in include_str!("sinks.tsv").lines().filter(|line| !line.starts_with('#') && !line.is_empty()) {
            let parts: Vec<&str> = line.split('\t').collect();
            let [owner, name, parameters, positions, reported] = parts[..] else { continue };
            let positions = positions.split(',').filter_map(|position| position.parse().ok()).collect();
            sinks.insert((owner.to_string(), name.to_string(), parameters.to_string()), Sink { positions, password: reported == "password" });
        }
        sinks
    })
}

/// Whether a value counts as hard-coded for a parameter of a sink: a string constant for a string, an array or
/// number made from constants for the others.
fn counts(parameter: &str, hard: &Hard) -> bool {
    match hard {
        Hard::Text(_) => parameter == "java.lang.String",
        Hard::Marked(kind) => matches!((parameter, kind), ("char[]", Kind::Chars) | ("byte[]", Kind::Bytes) | ("java.math.BigInteger", Kind::Number)),
        _ => false,
    }
}

fn arguments(node: Node) -> Vec<Node> {
    node.child_by_field_name("arguments").map(crate::engine::source::named_children).unwrap_or_default().into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

/// The place SpotBugs names for a hard-coded argument: a field an argument of the call was read from, else the
/// call that made the hard-coded one, else the sink. A field is named after the reading class, shown with its own.
fn placed(context: &Context, node: Node, given: &[Held], at: usize, sink: &str) -> String {
    let called = |label: &str| crate::java::spotbugs::dumb::numbers::source::called_place(context, node, label);
    let field = given.iter().find_map(|held| match &held.origin {
        Origin::Field(class, name) => Some((class, name)),
        _ => None,
    });
    if let Some((class, name)) = field {
        let reader = crate::java::types::scope::enclosing_types(context.resolver.scope, node).first().map(|own| names::binary(context, own)).unwrap_or_default();
        let owner = names::binary(context, class);
        let package = names::package_of(&reader);
        let shown = owner.strip_prefix(&format!("{package}.")).filter(|_| !package.is_empty() && names::package_of(&owner) == package).unwrap_or(&owner);
        return format!("member:{reader}.{name}|{package}@{shown}.{name}");
    }
    match &given[at].origin {
        Origin::Call(label) => called(label),
        _ => called(sink),
    }
}

impl<'c, 'a> Visit<'c, 'a> {
    fn check(&mut self, node: Node<'a>, call: &Call, owner: &str, name: &str, given: &[Held]) {
        let listed: Vec<String> = call.method.parameters.iter().map(|kind| kind.erased().name()).collect();
        let Some(sink) = sinks().get(&(owner.to_string(), name.to_string(), listed.join(","))) else { return };
        let hit = sink.positions.iter().rev().find(|at| given.get(**at).zip(listed.get(**at)).is_some_and(|(held, kind)| counts(kind, &held.hard)));
        let Some(at) = hit else { return };
        if !self.reported.insert(node.id()) {
            return;
        }
        let context = self.context;
        let label = idioms::called(context, owner, name, &call.method.parameters);
        let line = node.child_by_field_name("name").map_or_else(|| context.line(node), |name| context.line(name));
        let (pattern, message) = if sink.password { (PASSWORD, "Hard coded password found") } else { (KEY, "Hard coded cryptographic key found") };
        context.report_listed(pattern, node, line, message.to_string(), placed(context, node, given, *at, &label), 1, Vec::new());
    }

    pub fn call(&mut self, node: Node<'a>, copy: usize, values: &Values, effects: bool) -> Held {
        let context = self.context;
        let Some(call) = context.resolver.resolve_call(node) else { return Held::NO };
        let get = |node: Node| values.get(&(unwrap(node).id(), copy)).cloned().unwrap_or(Held::NO);
        let name = call.method.name.clone();
        let owner = returns::made_on(context, &call);
        if effects {
            let given: Vec<Held> = arguments(node).into_iter().map(get).collect();
            self.check(node, &call, &owner, &name, &given);
        }
        let object = node.child_by_field_name("object");
        let receiver = object.map_or(Held::NO, get);
        let parameters: Vec<String> = call.method.parameters.iter().map(|kind| kind.erased().name()).collect();
        let made = |kind: Kind, label: &str| Held { hard: Hard::Marked(kind), origin: Origin::Call(label.to_string()) };
        match (owner.as_str(), name.as_str(), parameters.as_slice()) {
            ("java.lang.String", "toCharArray", []) if matches!(receiver.hard, Hard::Text(_) | Hard::Null) => made(Kind::Chars, "String.toCharArray()"),
            ("java.lang.String", "getBytes", []) if matches!(receiver.hard, Hard::Text(_) | Hard::Null) => made(Kind::Bytes, "String.getBytes()"),
            ("java.lang.String", "getBytes", [one]) if one == "java.lang.String" && matches!(receiver.hard, Hard::Text(_) | Hard::Null) => made(Kind::Bytes, "String.getBytes(String)"),
            ("java.lang.String", "trim" | "toString" | "intern", []) if matches!(receiver.hard, Hard::Text(_)) => Held { hard: receiver.hard, origin: Origin::Call(format!("String.{name}()")) },
            ("java.lang.StringBuilder", "toString", []) => object.map(unwrap).filter(|object| object.kind() == "object_creation_expression").map_or(Held::NO, |created| {
                let given: Vec<Held> = arguments(created).into_iter().map(get).collect();
                match given.as_slice() {
                    [Held { hard: Hard::Text(text), .. }] => Held { hard: Hard::Text(text.clone()), origin: Origin::Call("StringBuilder.toString()".to_string()) },
                    _ => Held::NO,
                }
            }),
            _ => Held::NO,
        }
    }

    pub fn create(&mut self, node: Node<'a>, copy: usize, values: &Values, effects: bool) -> Held {
        let context = self.context;
        let Some(call) = context.resolver.resolve_constructor(node) else { return Held::NO };
        let get = |node: Node| values.get(&(unwrap(node).id(), copy)).cloned().unwrap_or(Held::NO);
        let given: Vec<Held> = arguments(node).into_iter().map(get).collect();
        if effects {
            self.check(node, &call, &call.declaring.clone(), "<init>", &given);
        }
        if call.declaring != "java.math.BigInteger" {
            return Held::NO;
        }
        let parameters: Vec<String> = call.method.parameters.iter().map(|kind| kind.erased().name()).collect();
        let references: Vec<(&String, &Held)> = parameters.iter().zip(&given).filter(|(kind, _)| matches!(kind.as_str(), "java.lang.String" | "byte[]")).collect();
        let hard = !references.is_empty() && references.iter().all(|(kind, held)| counts(kind, &held.hard));
        let label = idioms::called(context, &call.declaring, "<init>", &call.method.parameters);
        if hard { Held { hard: Hard::Marked(Kind::Number), origin: Origin::Call(label) } } else { Held::NO }
    }
}
