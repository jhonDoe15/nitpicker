//! Sinks on the taint layer, and sinks that the parameters of their method reach: those wait for the whole run,
//! since a call anywhere that hands such a parameter a tainted value raises the finding to priority 1.
//! The first sink is FindSecBugs' PATH_TRAVERSAL_IN for `new java.io.File(String)`; the other path sinks and the
//! other injection patterns build on the same calls.
use super::calls::{Key, Site, declared};
use super::flow::{Flow, Mode, Shared};
use super::{Level, THIS};
use crate::engine::finding::Finding;
use crate::engine::source::{children, named_children};
use crate::java::spotbugs::{Context, names, place};
use std::collections::HashMap;
use std::sync::Mutex;
use tree_sitter::Node;

const PATH_TRAVERSAL_IN: &str = "PATH_TRAVERSAL_IN";

/// A finding whose value comes from parameters of its method, waiting for the calls of the run.
struct Waiting {
    method: Key,
    params: u64,
    level: Level,
    finding: Finding,
}

/// Findings that parameters reach, and the calls of the run with the method making each, settled when the run
/// ends. Calls made in anonymous classes are not kept: they do not count.
#[derive(Default)]
pub struct Derived {
    waiting: Mutex<Vec<Waiting>>,
    sites: Mutex<Vec<(Option<Key>, Site)>>,
}

/// What the calls of the run hand a parameter, worst last: no call, or only values that come from parameters
/// nothing is known about (`None`), then safe, unknown and tainted values.
type Handed = Option<Level>;

/// What each parameter is handed by the calls of the run, worked out until nothing changes.
fn parameters(sites: &[(Option<Key>, Site)]) -> HashMap<(Key, usize), Handed> {
    let mut levels: HashMap<(Key, usize), Handed> = HashMap::new();
    loop {
        let mut next: HashMap<(Key, usize), Handed> = HashMap::new();
        for (caller, site) in sites {
            for (position, argument) in site.arguments.iter().enumerate() {
                let params = argument.params & !THIS;
                let mut handed = if params == 0 || argument.level > Level::Safe { Some(argument.level) } else { None };
                if argument.params & THIS != 0 {
                    handed = handed.max(Some(Level::Unknown));
                }
                for bit in (0..63).filter(|bit| params & (1 << bit) != 0) {
                    let from = caller.as_ref().and_then(|caller| levels.get(&(caller.clone(), bit)).copied().flatten());
                    handed = handed.max(from.or(if caller.is_none() { Some(Level::Unknown) } else { None }));
                }
                let known = next.entry((site.callee.clone(), position)).or_default();
                *known = (*known).max(handed);
            }
        }
        if next == levels {
            return levels;
        }
        levels = next;
    }
}

impl Derived {
    pub fn settle(&self, out: &mut Vec<Finding>) {
        let (Ok(mut waiting), Ok(sites)) = (self.waiting.lock(), self.sites.lock()) else { return };
        if waiting.is_empty() {
            return;
        }
        let levels = parameters(&sites);
        for Waiting { method, params, level, mut finding } in waiting.drain(..) {
            let handed = (0..63).filter(|bit| params & (1 << bit) != 0).map(|bit| levels.get(&(method.clone(), bit)).copied().flatten().unwrap_or(Level::Unknown));
            let level = handed.fold(level, Level::max);
            if level != Level::Safe {
                finding.priority = Some(if level == Level::Tainted { 1 } else { 2 });
                out.push(finding);
            }
        }
    }
}

/// The bodies of a class: methods, constructors and initializers, each with its parameters and the method it is.
fn bodies<'a>(context: &Context<'a>, own: &str, class: Node<'a>) -> Vec<(Node<'a>, Option<Node<'a>>, Option<Key>)> {
    let body = class.child_by_field_name("body").or_else(|| children(class).into_iter().find(|part| part.kind() == "class_body"));
    let Some(body) = body else { return Vec::new() };
    let mut members = children(body);
    members.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
    let mut found = Vec::new();
    for member in members {
        match member.kind() {
            "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" => {
                let parameters = member.child_by_field_name("parameters");
                found.extend(member.child_by_field_name("body").map(|body| (body, parameters, Some(declared(context, own, member)))));
            }
            "static_initializer" => found.extend(children(member).into_iter().find(|part| part.kind() == "block").map(|block| (block, None, None))),
            "block" => found.push((member, None, None)),
            "field_declaration" => {
                let values = children(member).into_iter().filter(|part| part.kind() == "variable_declarator").filter_map(|part| part.child_by_field_name("value"));
                found.extend(values.map(|value| (value, None, None)));
            }
            _ => {}
        }
    }
    found
}

/// The lambdas of a body, the body itself when it is one and those inside other lambdas too, but not those of
/// classes declared in it.
fn lambdas(body: Node) -> Vec<Node> {
    let mut found = Vec::new();
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        if node.kind() == "class_body" {
            continue;
        }
        if node.kind() == "lambda_expression" {
            found.push(node);
        }
        pending.extend(children(node));
    }
    found
}

/// The `new java.io.File(String)` expressions of a body, outside its lambdas and classes.
fn files<'a>(context: &Context<'a>, body: Node<'a>) -> Vec<Node<'a>> {
    let mut found = Vec::new();
    let mut pending = vec![body];
    while let Some(node) = pending.pop() {
        if matches!(node.kind(), "class_body" | "lambda_expression") && node != body {
            continue;
        }
        if node.kind() == "object_creation_expression"
            && let Some(call) = context.resolver.resolve_constructor(node)
        {
            let parameters: Vec<String> = call.method.parameters.iter().map(|kind| kind.erased().name()).collect();
            if call.declaring == "java.io.File" && parameters == ["java.lang.String"] {
                found.push(node);
            }
        }
        pending.extend(children(node));
    }
    found
}

fn check<'a>(shared: &Shared<'_, 'a>, own: &str, body: Node<'a>, parameters: Option<Node<'a>>, method: Option<Key>, anonymous: bool, derived: &Derived) {
    let context = shared.context;
    let sinks = files(context, body);
    if sinks.is_empty() && !context.text(body).contains('(') {
        return;
    }
    let mut flow = Flow::new(shared, own, body, parameters, Mode::Report).run();
    if !anonymous && let Ok(mut sites) = derived.sites.lock() {
        sites.extend(std::mem::take(&mut flow.sites).into_iter().map(|site| (method.clone(), site)));
    }
    for sink in sinks {
        let Some(argument) = sink.child_by_field_name("arguments").and_then(|listed| named_children(listed).into_iter().find(|part| !part.kind().ends_with("comment"))) else { continue };
        let value = flow.value(argument);
        let params = value.params & !THIS;
        let level = if value.params & THIS != 0 || (params != 0 && method.is_none()) { value.level.max(Level::Unknown) } else { value.level };
        if level == Level::Safe && (params == 0 || method.is_none()) {
            continue;
        }
        let label = names::around(context, sink).unwrap_or_default();
        let message = "This API (java/io/File.<init>(Ljava/lang/String;)V) reads a file whose location might be specified by user input".to_string();
        let Some(finding) = context.finding_listed(PATH_TRAVERSAL_IN, sink, line(context, sink), message, place::function(&label), Vec::new()) else { continue };
        match method.as_ref().filter(|_| params != 0 && level != Level::Tainted) {
            Some(method) => {
                if let Ok(mut waiting) = derived.waiting.lock() {
                    waiting.push(Waiting { method: method.clone(), params, level, finding });
                }
            }
            None => context.out.borrow_mut().push(Finding { priority: Some(if level == Level::Tainted { 1 } else { 2 }), ..finding }),
        }
    }
}

/// The line of a call's instruction in the class file: that of the last call or `new` its arguments make on a
/// later line, else that of the expression itself.
fn line(context: &Context, sink: Node) -> usize {
    let mut found = context.line(sink);
    let Some(listed) = sink.child_by_field_name("arguments") else { return found };
    crate::engine::source::walk(listed, |node| {
        let at = match node.kind() {
            "method_invocation" => node.child_by_field_name("arguments").map(|arguments| context.line(arguments)),
            "object_creation_expression" => Some(context.line(node)),
            _ => None,
        };
        found = found.max(at.unwrap_or(found));
    });
    found
}

/// Reports `new java.io.File(String)` with a value that is not safe, in the bodies and lambdas of the classes of a file.
pub fn path_traversal<'a>(context: &Context<'a>, declared: &[Node<'a>], derived: &Derived) {
    if !context.wants(&[PATH_TRAVERSAL_IN]) {
        return;
    }
    let shared = Shared::new(context);
    for declaration in declared {
        let Some(own) = context.resolver.scope.names.get(&declaration.id()) else { continue };
        let anonymous = matches!(declaration.kind(), "object_creation_expression" | "enum_constant");
        for (body, parameters, method) in bodies(context, own, *declaration) {
            if body.kind() != "lambda_expression" {
                check(&shared, own, body, parameters, method, anonymous, derived);
            }
            for lambda in lambdas(body) {
                let (Some(inner), parameters) = (lambda.child_by_field_name("body"), lambda.child_by_field_name("parameters")) else { continue };
                check(&shared, own, inner, parameters, None, anonymous, derived);
            }
        }
    }
}
