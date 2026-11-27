//! Follows the facts of local variables through one body, the way SpotBugs' type analysis does over the compiled
//! code: stores set them, paths merge them, and the side of an `instanceof` or `== null` test that holds narrows them.
use super::facts::{self, Fact, Origin};
use super::super::{Context, compare, fields, observed};
use crate::engine::source::children;
use crate::java::flow::cfg::{self, Exit};
use crate::java::types::expr::{Binding, unwrap};
use crate::java::types::model::Type;
use std::collections::HashMap;
use tree_sitter::Node;

/// Locals by name: a known fact, or `None` for a local whose value says nothing.
type State = HashMap<String, Option<Fact>>;

pub struct Unit<'t> {
    pub body: Node<'t>,
    pub parameters: Vec<(String, Type)>,
    pub own: String,
    pub instance: bool,
    /// The names the body declares itself; any other local it reads lives in a field of the compiled class.
    pub locals: std::collections::HashSet<String>,
}

/// What reached each cast and `instanceof` of the body: the fact of its operand.
pub fn checks<'t>(context: &Context, unit: &Unit<'t>) -> Vec<(Node<'t>, Option<Fact>)> {
    let graph = cfg::build(context.file, unit.body, &|_| false);
    let mut start = State::new();
    for (name, kind) in &unit.parameters {
        let fact = facts::declared(context, kind, Origin::Parameter).map(|fact| Fact { holder: Some(name.clone()), ..fact });
        start.insert(name.clone(), fact);
    }
    let count = graph.blocks.len();
    let mut entry: Vec<Option<State>> = vec![None; count];
    entry[0] = Some(start);
    for _ in 0..64 {
        let mut changed = false;
        for block in 0..count {
            let Some(mut state) = entry[block].clone() else { continue };
            let mut seen = Vec::new();
            for step in &graph.blocks[block].steps {
                apply(context, unit, &mut state, *step, &mut seen);
            }
            let mut next = Vec::new();
            match &graph.blocks[block].exit {
                Exit::End => {}
                Exit::Jump(to) => next.push((*to, state.clone())),
                Exit::Branch(test, holds, fails) => {
                    let (yes, no) = narrowed(context, unit, &state, *test);
                    next.extend(yes.map(|yes| (*holds, yes)));
                    next.push((*fails, no));
                }
                Exit::Any(all) => next.extend(all.iter().map(|to| (*to, state.clone()))),
            }
            let handlers: Vec<usize> = graph.blocks[block].catches.iter().flatten().map(|catch| catch.block).collect();
            let before = entry[block].clone().unwrap_or_default();
            next.extend(handlers.into_iter().map(|to| (to, meet(context, &before, &state))));
            for (to, value) in next {
                let merged = entry[to].as_ref().map_or_else(|| value.clone(), |old| meet(context, old, &value));
                if entry[to].as_ref() != Some(&merged) {
                    entry[to] = Some(merged);
                    changed = true;
                }
            }
        }
        if !changed {
            break;
        }
    }
    let mut found: HashMap<usize, (Node<'t>, Option<Fact>)> = HashMap::new();
    let mut order = Vec::new();
    for (block, start) in entry.iter().enumerate() {
        let Some(mut state) = start.clone() else { continue };
        let mut seen = Vec::new();
        for step in &graph.blocks[block].steps {
            apply(context, unit, &mut state, *step, &mut seen);
        }
        for (node, fact) in seen {
            match found.get_mut(&node.id()) {
                Some((_, known)) => *known = match (known.take(), fact) {
                    (Some(a), Some(b)) => Some(facts::merge(context, &a, &b)),
                    _ => None,
                },
                None => {
                    order.push(node.id());
                    found.insert(node.id(), (node, fact));
                }
            }
        }
    }
    order.into_iter().filter_map(|id| found.remove(&id)).collect()
}

fn meet(context: &Context, a: &State, b: &State) -> State {
    let mut met = State::new();
    for (name, fact) in a {
        let joined = match (fact, b.get(name).unwrap_or(&None)) {
            (Some(x), Some(y)) => Some(facts::merge(context, x, y)),
            _ => None,
        };
        met.insert(name.clone(), joined);
    }
    for name in b.keys() {
        met.entry(name.clone()).or_insert(None);
    }
    met
}

fn local<'t>(context: &Context, node: Node<'t>) -> Option<String> {
    let node = unwrap(node);
    let name = context.text(node);
    (node.kind() == "identifier" && matches!(context.resolver.binding(node, name), Some(Binding::Local(_)))).then(|| name.to_string())
}

/// The states on the side where a test holds and where it fails. An `instanceof` that cannot hold leaves its
/// side out, as SpotBugs does not follow it.
fn narrowed(context: &Context, unit: &Unit, state: &State, test: Node) -> (Option<State>, State) {
    let (mut yes, mut no) = (state.clone(), state.clone());
    let test = unwrap(test);
    match test.kind() {
        "instanceof_expression" => {
            let target = test.child_by_field_name("right").and_then(|right| context.resolver.type_node(right)).map(|kind| kind.erased());
            let left = test.child_by_field_name("left").expect("left");
            let fact = value(context, unit, state, left);
            let never = fact.as_ref().zip(target.as_ref()).is_some_and(|(fact, target)| {
                fact.kind == Type::Null || (!matches!(fact.origin, Origin::Element | Origin::Hidden) && super::judge::impossible(context, fact, target))
            });
            if never && local(context, left).is_some() {
                return (None, no);
            }
            let plain = test.child_by_field_name("name").is_none() && test.child_by_field_name("pattern").is_none();
            let name = local(context, left).filter(|_| plain);
            if let (Some(name), Some(target)) = (name, target) {
                if let Some(fact) = fact.filter(|fact| !facts::subtype(context, &fact.kind, &target)) {
                    let generic = context.resolver.index.generic(&target.name());
                    yes.insert(name, Some(Fact { arguments: fact.arguments.filter(|_| generic), exact: false, callee: None, to_array: false, kind: target, ..fact }));
                }
            }
        }
        "binary_expression" => {
            let operator = test.child_by_field_name("operator").map(|operator| context.text(operator).to_string());
            let (Some(left), Some(right)) = (test.child_by_field_name("left").map(unwrap), test.child_by_field_name("right").map(unwrap)) else { return (Some(yes), no) };
            let checked = if right.kind() == "null_literal" { local(context, left) } else if left.kind() == "null_literal" { local(context, right) } else { None };
            if let Some(name) = checked {
                match operator.as_deref() {
                    Some("==") => _ = yes.insert(name, Some(Fact::null())),
                    Some("!=") => _ = no.insert(name, Some(Fact::null())),
                    _ => {}
                }
            }
        }
        _ => {}
    }
    (Some(yes), no)
}

fn store(context: &Context, unit: &Unit, state: &mut State, name: Node, declared: Option<Type>, given: Option<Node>) {
    let name = context.text(name).to_string();
    let fact = given.and_then(|given| value(context, unit, state, given));
    let fact = fact.map(|fact| {
        let holder = if matches!(fact.origin, Origin::Parameter | Origin::Caught) && fact.holder.is_some() { fact.holder.clone() } else { Some(name.clone()) };
        let widened = declared.as_ref().and_then(|declared| facts::declared(context, declared, fact.origin));
        match widened {
            Some(widened) if fact.kind != Type::Null && !facts::subtype(context, &fact.kind, &widened.kind) => Fact { holder, callee: fact.callee, ..widened },
            _ => Fact { holder, to_array: false, ..fact },
        }
    });
    state.insert(name, fact);
}

fn apply<'t>(context: &Context, unit: &Unit<'t>, state: &mut State, step: Node<'t>, seen: &mut Vec<(Node<'t>, Option<Fact>)>) {
    match step.kind() {
        "variable_declarator" => {
            let Some(name) = step.child_by_field_name("name") else { return };
            let declared = crate::engine::source::parent(step).and_then(|holder| context.resolver.declared_type(holder, Some(step)));
            store(context, unit, state, name, declared, step.child_by_field_name("value"));
        }
        "assignment_expression" => {
            let (Some(left), Some(operator)) = (step.child_by_field_name("left"), step.child_by_field_name("operator")) else { return };
            let Some(name) = local(context, left) else { return };
            if context.text(operator) != "=" {
                state.insert(name, None);
                return;
            }
            let declared = context.resolver.type_of(unwrap(left));
            store(context, unit, state, unwrap(left), declared, step.child_by_field_name("right"));
        }
        "catch_formal_parameter" => {
            let Some(name) = step.child_by_field_name("name") else { return };
            let fact = facts::caught(context, step).map(|fact| Fact { holder: Some(context.text(name).to_string()), ..fact });
            state.insert(context.text(name).to_string(), fact);
        }
        "enhanced_for_statement" => {
            let Some(name) = step.child_by_field_name("name") else { return };
            let declared = step.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
            let array = step.child_by_field_name("value").and_then(|value| context.resolver.type_of(value)).is_some_and(|kind| matches!(kind, Type::Array(_)));
            let origin = if array { Origin::Element } else { Origin::Returned };
            let fact = declared.and_then(|declared| facts::declared(context, &declared, origin)).map(|fact| Fact { holder: Some(context.text(name).to_string()), ..fact });
            state.insert(context.text(name).to_string(), fact);
        }
        "resource" => {
            if let Some(name) = step.child_by_field_name("name") {
                let declared = step.child_by_field_name("type").and_then(|written| context.resolver.type_node(written));
                store(context, unit, state, name, declared, step.child_by_field_name("value"));
            }
        }
        "cast_expression" => seen.push((step, step.child_by_field_name("value").and_then(|operand| value(context, unit, state, operand)))),
        "instanceof_expression" => {
            let operand = step.child_by_field_name("left").and_then(|operand| value(context, unit, state, operand));
            seen.push((step, operand.clone()));
            if let Some(name) = step.child_by_field_name("name") {
                let target = step.child_by_field_name("right").and_then(|right| context.resolver.type_node(right));
                let fact = target.and_then(|target| facts::declared(context, &target, operand.as_ref().map_or(Origin::Other, |fact| fact.origin)));
                state.insert(context.text(name).to_string(), fact.map(|fact| Fact { holder: Some(context.text(name).to_string()), ..fact }));
            }
        }
        _ => {}
    }
}

/// The fact of an expression's value where it runs.
pub fn value(context: &Context, unit: &Unit, state: &State, node: Node) -> Option<Fact> {
    let node = unwrap(node);
    let resolver = context.resolver;
    match node.kind() {
        "identifier" => match resolver.binding(node, context.text(node))? {
            Binding::Local(declared) => match state.get(context.text(node)) {
                Some(known) => known.clone(),
                None if unit.locals.contains(context.text(node)) => None,
                None => facts::declared(context, &declared?, Origin::Field),
            },
            Binding::Field(..) => field(context, node),
        },
        "field_access" => match node.child_by_field_name("field").map(|field| field.kind()) {
            Some("this") => None,
            _ => field(context, node),
        },
        "this" => Some(Fact { holder: Some("this".to_string()), ..Fact::new(Type::class(&unit.own), Origin::Parameter) }).filter(|_| unit.instance),
        "method_invocation" => call(context, unit, state, node),
        "object_creation_expression" => {
            let anonymous = children(node).iter().any(|part| part.kind() == "class_body");
            let kind = if anonymous { Type::class(resolver.scope.names.get(&node.id())?) } else { resolver.type_of(node)?.erased() };
            Some(Fact { exact: true, ..Fact::new(kind, Origin::Created) })
        }
        "array_creation_expression" => Some(Fact { exact: true, ..Fact::new(resolver.type_of(node)?.erased(), Origin::Created) }),
        "string_literal" | "text_block" => Some(Fact { exact: true, ..Fact::new(Type::class("java.lang.String"), Origin::Created) }),
        "null_literal" => Some(Fact::null()),
        "ternary_expression" => {
            let (yes, no) = (node.child_by_field_name("consequence")?, node.child_by_field_name("alternative")?);
            Some(facts::merge(context, &value(context, unit, state, yes)?, &value(context, unit, state, no)?))
        }
        "assignment_expression" => value(context, unit, state, node.child_by_field_name("right")?),
        "cast_expression" => {
            let target = node.child_by_field_name("type").and_then(|written| resolver.type_node(written))?;
            let inner = value(context, unit, state, node.child_by_field_name("value")?);
            match inner {
                Some(inner) if inner.kind == Type::Null || facts::subtype(context, &inner.kind, &target.erased()) => Some(inner),
                Some(inner) => facts::declared(context, &target, inner.origin).map(|fact| Fact { holder: inner.holder, ..fact }),
                None => facts::declared(context, &target, Origin::Other),
            }
        }
        "array_access" => resolver.type_of(node).and_then(|kind| facts::declared(context, &kind, Origin::Element)),
        _ => resolver.type_of(node).and_then(|kind| facts::declared(context, &kind, Origin::Other)),
    }
}

fn field(context: &Context, node: Node) -> Option<Fact> {
    let declared = context.resolver.type_of(node)?;
    let mut fact = facts::declared(context, &declared, Origin::Field)?;
    if fields::field_key(context, node).is_some() {
        let stored = observed::observed(context, node).map(|kind| kind.erased());
        if let Some(stored) = stored.filter(|stored| *stored != fact.kind && facts::subtype(context, stored, &fact.kind)) {
            fact = Fact::new(stored, Origin::Field);
        }
    }
    Some(fact)
}

fn call(context: &Context, unit: &Unit, state: &State, node: Node) -> Option<Fact> {
    let found = context.resolver.resolve_call(node)?;
    let method = &found.method;
    let origin = if method.is_static || method.is_private { Origin::Hidden } else { Origin::Returned };
    let callee = compare::called(context, node, &found);
    let arguments = node.child_by_field_name("arguments").map(crate::engine::source::named_children).unwrap_or_default();
    let collection = context.resolver.index.is_subtype(&found.receiver.erased().name(), "java.util.Collection");
    if method.name == "toArray" && collection && !method.is_static {
        let given = arguments.first().and_then(|given| value(context, unit, state, *given));
        return match arguments.len() {
            0 => Some(Fact { exact: true, callee, to_array: true, ..Fact::new(Type::Array(Box::new(Type::class(crate::java::types::model::OBJECT))), Origin::Returned) }),
            _ => given.filter(|given| given.exact).map(|given| Fact { callee, origin: Origin::Returned, holder: None, ..given }),
        };
    }
    let generic = context.resolver.type_of(node).filter(|generic| generic.erased() == method.returns.erased()).unwrap_or_else(|| method.returns.clone());
    facts::declared(context, &generic, origin).map(|fact| Fact { callee, ..fact })
}
