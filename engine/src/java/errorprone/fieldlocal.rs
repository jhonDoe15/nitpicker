//! FieldCanBeLocal.
use super::fixes::Fix;
use super::keep::{VARIABLES, should_keep};
use super::nodes::{is_variable_use, name_position};
use super::symbols::{VarSym, variable_symbol};
use super::Context;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::{has_modifier, modifiers};
use crate::java::types::model::target;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

const CHECK: &str = "FieldCanBeLocal";
const CLASSES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const METHODS: &[&str] = &["method_declaration", "constructor_declaration", "compact_constructor_declaration"];

struct Candidate<'t> {
    symbol: VarSym,
    declarator: Node<'t>,
    declaration: Node<'t>,
}

struct State<'a, 't> {
    context: &'a Context<'a>,
    candidates: Vec<Candidate<'t>>,
    alive: HashSet<VarSym>,
    names: HashSet<String>,
    assigned: HashMap<VarSym, Vec<Node<'t>>>,
    uses: HashMap<VarSym, Vec<Node<'t>>>,
    in_method: bool,
}

fn usable_on_local(context: &Context, declaration: Node) -> bool {
    modifiers(declaration).map(children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).all(|annotation| {
        let Some(name) = annotation.child_by_field_name("name") else { return true };
        let bits = context.resolver.class_name(annotation, context.text(name)).and_then(|full| context.resolver.index.get(&full)).and_then(|info| info.targets);
        bits.is_none_or(|bits| bits & (target::bit("LOCAL_VARIABLE") | target::bit("TYPE_USE")) != 0)
    })
}

fn collect<'t>(context: &Context, node: Node<'t>, found: &mut Vec<Candidate<'t>>) {
    for part in children(node) {
        if part.kind() == "field_declaration" && has_modifier(part, "private") && !context.suppressed(CHECK, part) {
            if !usable_on_local(context, part) || should_keep(context, part, VARIABLES) {
                continue;
            }
            for declarator in children(part).into_iter().filter(|inner| inner.kind() == "variable_declarator") {
                let Some(name) = declarator.child_by_field_name("name") else { continue };
                if context.text(name).starts_with("unused") {
                    continue;
                }
                if let Some(symbol) = field_symbol(context, declarator) {
                    found.push(Candidate { symbol, declarator, declaration: part });
                }
            }
        } else if part.kind() != "field_declaration" && !(CLASSES.contains(&part.kind()) && context.suppressed(CHECK, part)) {
            collect(context, part, found);
        }
    }
}

fn field_symbol(context: &Context, declarator: Node) -> Option<VarSym> {
    let class = crate::java::types::scope::enclosing_type(context.file, context.resolver.scope, declarator)?;
    Some(VarSym::Field(class, context.text(declarator.child_by_field_name("name")?).to_string()))
}

impl<'a, 't> State<'a, 't> {
    fn symbol_of(&self, node: Node<'t>) -> Option<VarSym> {
        let name = match node.kind() {
            "identifier" => self.context.text(node),
            "field_access" => self.context.text(node.child_by_field_name("field")?),
            _ => return None,
        };
        if !self.names.contains(name) {
            return None;
        }
        variable_symbol(self.context, node).filter(|symbol| matches!(symbol, VarSym::Field(..)))
    }

    fn handle_use(&mut self, node: Node<'t>, assigned_now: &HashSet<VarSym>) {
        let Some(symbol) = self.symbol_of(node) else { return };
        if !self.alive.contains(&symbol) {
            return;
        }
        let list = self.uses.entry(symbol.clone()).or_default();
        if !list.iter().any(|known| known.id() == node.id()) {
            list.push(node);
        }
        if !assigned_now.contains(&symbol) {
            self.alive.remove(&symbol);
        }
    }

    fn inner(&mut self, node: Node<'t>, depth_ok: bool, assigned_now: &mut HashSet<VarSym>) {
        match node.kind() {
            kind if METHODS.contains(&kind) || kind == "lambda_expression" => {}
            "assignment_expression" if node.child_by_field_name("operator").is_some_and(|operator| self.context.text(operator) == "=") => {
                let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
                self.inner(right, false, assigned_now);
                if let Some(symbol) = self.symbol_of(left).filter(|symbol| self.alive.contains(symbol)) {
                    if depth_ok {
                        assigned_now.insert(symbol.clone());
                        let list = self.assigned.entry(symbol).or_default();
                        if !list.iter().any(|known| known.id() == node.id()) {
                            list.push(node);
                        }
                    }
                }
                self.inner(left, false, assigned_now);
            }
            "identifier" => {
                if is_variable_use(node) {
                    self.handle_use(node, assigned_now);
                }
            }
            "field_access" => {
                self.handle_use(node, assigned_now);
                for part in children(node) {
                    self.inner(part, false, assigned_now);
                }
            }
            "method_invocation" | "object_creation_expression" => {
                assigned_now.clear();
                for part in children(node) {
                    self.inner(part, false, assigned_now);
                }
            }
            _ => {
                for part in children(node) {
                    self.inner(part, false, assigned_now);
                }
            }
        }
    }

    /// Scans the body of a method or lambda: an assignment that is a statement of the body itself is unconditional.
    fn method_like(&mut self, body: Node<'t>) {
        let mut assigned_now = HashSet::new();
        if matches!(body.kind(), "block" | "constructor_body") {
            for statement in children(body) {
                let top = statement.kind() == "expression_statement";
                if top {
                    if let Some(assign) = named_children(statement).into_iter().find(|part| !part.kind().ends_with("comment")) {
                        self.inner(assign, true, &mut assigned_now);
                        continue;
                    }
                }
                self.inner(statement, false, &mut assigned_now);
            }
        } else {
            self.inner(body, false, &mut assigned_now);
        }
    }

    fn outer(&mut self, node: Node<'t>) {
        let kind = node.kind();
        if CLASSES.contains(&kind) || (kind == "class_body" && parent(node).is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant"))) {
            if CLASSES.contains(&kind) && self.context.suppressed(CHECK, node) {
                return;
            }
            self.in_method = false;
            for part in children(node) {
                self.outer(part);
            }
        } else if METHODS.contains(&kind) {
            let Some(body) = node.child_by_field_name("body").or_else(|| children(node).into_iter().find(|part| part.kind() == "constructor_body")) else { return };
            self.method_like(body);
            self.in_method = true;
            for part in children(node) {
                self.outer(part);
            }
            self.in_method = false;
        } else if kind == "lambda_expression" {
            if let Some(body) = node.child_by_field_name("body") {
                self.method_like(body);
            }
            self.in_method = true;
            for part in children(node) {
                self.outer(part);
            }
            self.in_method = false;
        } else if kind == "identifier" {
            if !self.in_method && is_variable_use(node) {
                if let Some(symbol) = self.symbol_of(node) {
                    self.alive.remove(&symbol);
                }
            }
        } else if kind == "field_access" {
            if !self.in_method {
                if let Some(symbol) = self.symbol_of(node) {
                    self.alive.remove(&symbol);
                }
            }
            for part in children(node) {
                self.outer(part);
            }
        } else {
            for part in children(node) {
                self.outer(part);
            }
        }
    }
}

fn annotations_source(context: &Context, declaration: Node) -> String {
    let all: Vec<Node> = modifiers(declaration).map(children).unwrap_or_default().into_iter().filter(|part| matches!(part.kind(), "annotation" | "marker_annotation")).collect();
    match (all.first(), all.last()) {
        (Some(first), Some(last)) => context.file.text[first.start_byte()..last.end_byte()].to_string(),
        _ => String::new(),
    }
}

fn is_assignment_target(node: Node) -> bool {
    parent(node).is_some_and(|holder| holder.kind() == "assignment_expression" && holder.child_by_field_name("left").is_some_and(|left| left.id() == node.id()))
}

pub fn field_can_be_local(context: &Context, root: Node) {
    let mut found = Vec::new();
    collect(context, root, &mut found);
    if found.is_empty() {
        return;
    }
    let names = found.iter().filter_map(|candidate| candidate.declarator.child_by_field_name("name")).map(|name| context.text(name).to_string()).collect();
    let alive = found.iter().map(|candidate| candidate.symbol.clone()).collect();
    let mut state = State { context, candidates: Vec::new(), alive, names, assigned: HashMap::new(), uses: HashMap::new(), in_method: false };
    state.candidates = found;
    state.outer(root);
    for candidate in &state.candidates {
        if !state.alive.contains(&candidate.symbol) {
            continue;
        }
        let Some(assignments) = state.assigned.get(&candidate.symbol).filter(|list| !list.is_empty()) else { continue };
        let uses = state.uses.get(&candidate.symbol).map(Vec::as_slice).unwrap_or_default();
        if uses.iter().all(|usage| is_assignment_target(*usage)) {
            continue;
        }
        let fix = build_fix(context, candidate, assignments, uses);
        context.report_fixed(CHECK, candidate.declarator, name_position(candidate.declarator), "This field can be replaced with a local variable in the methods that use it.", &[fix]);
    }
}

fn build_fix(context: &Context, candidate: &Candidate, assignments: &[Node], uses: &[Node]) -> Fix {
    let declaration = candidate.declaration;
    let kind = declaration.child_by_field_name("type").map(|written| context.text(written)).unwrap_or_default();
    let annotations = annotations_source(context, declaration);
    let mut fix = Fix::replace(declaration.start_byte(), declaration.end_byte(), "");
    let mut deleted: HashSet<usize> = HashSet::new();
    let mut scopes: HashSet<usize> = HashSet::new();
    for assignment in assignments {
        let (Some(left), Some(right)) = (assignment.child_by_field_name("left"), assignment.child_by_field_name("right")) else { continue };
        let assignee = if left.kind() == "field_access" { left.child_by_field_name("field").map(|field| context.text(field)) } else { Some(context.text(left)) };
        if right.kind() == "identifier" && Some(context.text(right)) == assignee {
            deleted.insert(left.id());
            if let Some(statement) = parent(*assignment) {
                fix = fix.delete(statement.start_byte(), statement.end_byte());
            }
            continue;
        }
        let scope = parent(*assignment).and_then(parent);
        if scope.is_none_or(|scope| scopes.insert(scope.id())) {
            fix = fix.insert(assignment.start_byte(), format!("{annotations} {kind} "));
        }
    }
    for usage in uses {
        if deleted.contains(&usage.id()) || usage.kind() != "field_access" {
            continue;
        }
        if let Some(object) = usage.child_by_field_name("object").filter(|object| object.kind() == "this") {
            fix = fix.delete(object.start_byte(), object.end_byte() + 1);
        }
    }
    fix
}
