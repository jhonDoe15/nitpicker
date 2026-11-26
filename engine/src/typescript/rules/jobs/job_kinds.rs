//! `jobKind`: whether a function is a scheduled or queue job handler, and which kind.
use crate::typescript::rules::support::view::Node;
use crate::typescript::rules::writes::imports::ImportedBinding;
use std::collections::HashMap;

pub type Bindings = HashMap<String, ImportedBinding>;
type Candidates<'c> = &'c [(&'c str, &'c [&'c str])];

const SCHEDULE_MODULE: &str = "@nestjs/schedule";
const BULLMQ_MODULE: &str = "@nestjs/bullmq";
const BULL_MODULES: [&str; 2] = ["@nestjs/bull", BULLMQ_MODULE];
const DECORATORS: [(&str, &[&str]); 4] = [
    ("Cron", &[SCHEDULE_MODULE]),
    ("Interval", &[SCHEDULE_MODULE]),
    ("Timeout", &[SCHEDULE_MODULE]),
    ("Process", &BULL_MODULES),
];
const PROCESSOR: [(&str, &[&str]); 1] = [("Processor", &BULL_MODULES)];

fn name_of(node: Option<Node>) -> Option<String> {
    node.and_then(|node| node.name()).map(|name| name.into_owned())
}

fn decorator_name(decorator: Node) -> Option<String> {
    let expression = decorator.node("expression")?;
    let callee = if expression.is("CallExpression") { expression.node("callee")? } else { expression };
    if callee.is("Identifier") { name_of(Some(callee)) } else { None }
}

fn decorated_with(node: Node, names: Candidates, bindings: &Bindings) -> Option<String> {
    node.nodes("decorators").into_iter().filter_map(decorator_name).find(|name| {
        let module = bindings.get(name).map_or("", |binding| binding.module.as_str());
        names.iter().find(|(each, _)| each == name).is_some_and(|(_, modules)| modules.contains(&module))
    })
}

fn method_job(method: Node, bindings: &Bindings) -> Option<String> {
    if let Some(decorator) = decorated_with(method, &DECORATORS, bindings) {
        return Some(format!("@{decorator}"));
    }
    let owner = method.parent()?.parent()?;
    let named_process = name_of(method.node("key")).as_deref() == Some("process");
    let superclass = name_of(owner.node("superClass")).unwrap_or_default();
    let extends_worker = bindings.get(&superclass).is_some_and(|binding| binding.module == BULLMQ_MODULE);
    let is_processor = named_process && (decorated_with(owner, &PROCESSOR, bindings).is_some() || extends_worker);
    is_processor.then(|| "queue processor `process`".to_string())
}

fn callback_job(function: Node, bindings: &Bindings) -> Option<String> {
    let call = function.parent()?;
    if call.is("NewExpression") {
        let callee = call.node("callee")?;
        let worker = callee.is("Identifier") && name_of(Some(callee)).as_deref() == Some("Worker");
        let module = bindings.get("Worker").map_or("", |binding| binding.module.as_str());
        let is_second = call.nodes("arguments").get(1) == Some(&function);
        return (worker && is_second && ["bullmq", "bull"].contains(&module)).then(|| "queue worker".to_string());
    }
    let callee = call.node("callee").filter(|callee| call.is("CallExpression") && callee.is("MemberExpression") && !callee.flag("computed"))?;
    if call.nodes("arguments").get(1) != Some(&function) {
        return None;
    }
    let method = name_of(callee.node("property"));
    if method.as_deref() == Some("define") && bindings.values().any(|binding| binding.module == "agenda") {
        return Some("Agenda job".to_string());
    }
    let object = callee.node("object").filter(|object| object.is("Identifier"));
    let root = object.and_then(|object| name_of(Some(object))).and_then(|name| bindings.get(&name));
    (method.as_deref() == Some("schedule") && root.is_some_and(|root| root.module == "node-cron")).then(|| "node-cron task".to_string())
}

/// The kind of job a function handles, from the file's imports.
pub fn job_kind(function: Node, bindings: &Bindings) -> Option<String> {
    let parent = function.parent()?;
    if parent.is("MethodDefinition") && parent.node("value") == Some(function) {
        method_job(parent, bindings)
    } else {
        callback_job(function, bindings)
    }
}
