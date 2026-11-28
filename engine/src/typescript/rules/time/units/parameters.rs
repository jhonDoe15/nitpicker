//! `unit-parameters.mts`: which arguments of a call take a time unit. Types are not read: without a program the
//! parameter names a signature would add are none.
use super::constants::{Env, resolve_function};
use super::names::{Unit, argument_unit_of_call_name, unit_of_name};
use super::nodes::{callee_text, string_literal, unwrap};
use crate::typescript::rules::support::scope::{Def, DefKind};
use crate::typescript::rules::support::view::Node;

pub struct ParameterUnit {
    pub index: usize,
    pub unit: Unit,
    pub name: String,
}

const TIMER_CALLS: [&str; 2] = ["setTimeout", "setInterval"];
const PROMISE_TIMERS: [&str; 2] = ["timers/promises", "node:timers/promises"];
const DELAY: &str = "delay";

fn import_source(definition: &Def) -> Option<String> {
    if definition.kind != DefKind::ImportBinding {
        return None;
    }
    let declaration = definition.node.parent().filter(|parent| parent.is("ImportDeclaration"))?;
    declaration.node("source").and_then(string_literal).map(|source| source.into_owned())
}

fn delay(index: usize) -> ParameterUnit {
    ParameterUnit { index, unit: Unit::Ms, name: DELAY.to_string() }
}

fn first_definition<'a, 's>(env: Env<'a, 's>, callee: Node<'s>, name: &str) -> Option<Def<'s>> {
    let symbol = env.scopes.variable_by_name(name, callee.start())?;
    env.scopes.defs(symbol).into_iter().next()
}

fn timer_parameter<'a, 's>(env: Env<'a, 's>, call: Node<'s>, text: &str) -> Option<ParameterUnit> {
    let mut parts = text.split('.');
    let first = parts.next().unwrap_or("");
    let second = parts.next();
    let owner = second.map(|_| first);
    let name = second.unwrap_or(first);
    if !TIMER_CALLS.contains(&name) || owner.is_some_and(|owner| owner != "globalThis" && owner != "window") {
        return None;
    }
    if owner.is_some() {
        return Some(delay(1));
    }
    let Some(definition) = first_definition(env, call.node("callee")?, name) else { return Some(delay(1)) };
    let source = import_source(&definition).unwrap_or_default();
    PROMISE_TIMERS.contains(&source.as_str()).then(|| delay(0))
}

fn known_parameters<'a, 's>(env: Env<'a, 's>, call: Node<'s>, text: &str) -> Option<Vec<ParameterUnit>> {
    if call.is("NewExpression") {
        let dated = text == "Date" && call.nodes("arguments").len() == 1;
        return dated.then(|| vec![ParameterUnit { index: 0, unit: Unit::Ms, name: "value".to_string() }]);
    }
    if text == "AbortSignal.timeout" {
        return Some(vec![ParameterUnit { index: 0, unit: Unit::Ms, name: "milliseconds".to_string() }]);
    }
    if let Some(timer) = timer_parameter(env, call, text) {
        return Some(vec![timer]);
    }
    let last = text.rsplit('.').next().unwrap_or("");
    argument_unit_of_call_name(last).map(|unit| vec![ParameterUnit { index: 0, unit, name: last.to_string() }])
}

fn parameter_name(parameter: Node) -> String {
    let named = if parameter.is("AssignmentPattern") { parameter.node("left") } else { Some(parameter) };
    let name = named.filter(|node| node.is("Identifier")).and_then(|node| node.name());
    name.map(|name| name.into_owned()).unwrap_or_default()
}

pub fn parameter_units<'a, 's>(env: Env<'a, 's>, call: Node<'s>) -> Vec<ParameterUnit> {
    let Some(callee) = call.node("callee") else { return Vec::new() };
    let text = callee_text(callee).unwrap_or_default();
    if let Some(known) = known_parameters(env, call, &text) {
        return known;
    }
    let Some(local) = resolve_function(env, unwrap(callee)) else { return Vec::new() };
    local
        .nodes("params")
        .into_iter()
        .enumerate()
        .filter_map(|(index, parameter)| {
            let name = parameter_name(parameter);
            unit_of_name(&name).map(|unit| ParameterUnit { index, unit, name })
        })
        .collect()
}
