//! What each step of a body does to the values it works with: dereferences, stores, tests, and calls that can
//! change the fields of the object the method runs on.
use super::super::Context;
use super::marks;
use super::paths::{Finder, strip};
use crate::engine::source::{children, named_children, parent};
use crate::java::flow::cfg::{self, Cfg, Exit};
use crate::java::types::expr::{Call, Receiver};
use crate::java::types::model::{Method, Type, flag};
use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

#[derive(Clone, Copy, PartialEq)]
pub enum How {
    /// A method is called on the value.
    Call,
    /// The value is handed to a method that dereferences that parameter on every path.
    Parameter,
    /// A field or an array element is read or written through the value, or it is unboxed, iterated, locked on,
    /// switched on or thrown: none of these has a line of its own in the class file.
    Other,
}

pub enum Effect<'a> {
    Deref { of: Node<'a>, path: Option<usize>, at: Node<'a>, how: How },
    /// A path takes the value of an expression, or a value nothing is known about.
    Assign { to: usize, from: Option<Node<'a>>, sources: Vec<usize> },
    /// A call that can change the fields of `this`.
    Invalidate,
    /// The path is not null afterwards, or the step did not finish: `Objects.requireNonNull`, an assertion.
    Checked(usize),
    /// An `assert` was passed: SpotBugs reports nothing later for a value that only may be null here.
    Asserted,
}

/// A branch on whether a path is null.
pub struct Test {
    pub path: usize,
    /// `Some(true)`: null where the test holds. `None`: only known not to be null where it holds (`instanceof`).
    pub null_holds: Option<bool>,
    pub node: usize,
}

/// What is shared by the bodies of one file.
pub struct Shared<'c, 'a> {
    pub context: &'c Context<'a>,
    summaries: RefCell<HashMap<usize, u64>>,
    /// Summaries that may say too little, kept while the outermost method is worked out so that each body is
    /// built once for it; kept for good once `MOST` bodies were built.
    passing: RefCell<HashMap<usize, u64>>,
    /// The methods being worked out, outermost first.
    running: RefCell<Vec<usize>>,
    /// Set when a summary met a method still being worked out or the limits below, so it may say too little.
    cut: Cell<bool>,
    built: Cell<u32>,
    marked: RefCell<HashMap<(String, String, String), bool>>,
    overridden: RefCell<HashMap<(String, String, usize), bool>>,
}

/// How deep calls are followed, and after how many bodies worked out for one class summaries that may say too
/// little are no longer worked out again.
const DEEPEST: usize = 48;
const MOST: u32 = 4000;
const BOXES: &[&str] = &[
    "java.lang.Integer", "java.lang.Long", "java.lang.Short", "java.lang.Byte", "java.lang.Character", "java.lang.Double", "java.lang.Float",
    "java.lang.Boolean",
];
const PRIMITIVES: &[&str] = &["integral_type", "floating_point_type", "boolean_type"];

pub fn arguments<'a>(call: Node<'a>) -> Vec<Node<'a>> {
    let listed = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
    listed.into_iter().filter(|part| !part.kind().ends_with("comment")).collect()
}

impl<'c, 'a> Shared<'c, 'a> {
    pub fn new(context: &'c Context<'a>) -> Self {
        Shared {
            context,
            summaries: RefCell::default(),
            passing: RefCell::default(),
            running: RefCell::default(),
            cut: Cell::new(false),
            built: Cell::new(0),
            marked: RefCell::default(),
            overridden: RefCell::default(),
        }
    }

    fn key(call: &Call) -> (String, String, usize) {
        (call.declaring.clone(), call.method.name.clone(), call.method.parameters.len())
    }

    /// Whether the call's result is taken as possibly null.
    fn marked(&self, call: &Call) -> bool {
        let key = (call.declaring.clone(), call.method.name.clone(), format!("{:?}", call.method.parameters));
        if let Some(known) = self.marked.borrow().get(&key) {
            return *known;
        }
        let found = marks::method(self.context.resolver.index, &call.declaring, &call.method);
        self.marked.borrow_mut().insert(key, found);
        found
    }

    fn overridden(&self, call: &Call) -> bool {
        let key = Self::key(call);
        if let Some(known) = self.overridden.borrow().get(&key) {
            return *known;
        }
        let found = self.context.resolver.index.overridden_in_sources(&key.0, &key.1, key.2);
        self.overridden.borrow_mut().insert(key, found);
        found
    }

    fn declaration(&self, class: Node<'a>, method: &Method) -> Option<Node<'a>> {
        let body = class.child_by_field_name("body")?;
        let mut members = children(body);
        members.extend(children(body).into_iter().filter(|part| part.kind() == "enum_body_declarations").flat_map(children));
        members.into_iter().find(|member| {
            let named = match member.kind() {
                "method_declaration" => member.child_by_field_name("name").is_some_and(|name| self.context.text(name) == method.name),
                "constructor_declaration" => method.name == "<init>",
                _ => false,
            };
            named && self.context.resolver.parameters(member.child_by_field_name("parameters")).0 == method.parameters
        })
    }

    /// A bit per parameter the called method dereferences on every path that leaves it normally. Only for
    /// methods of this file that no class of the run overrides.
    pub fn summary(&self, call: &Call) -> u64 {
        if call.method.varargs {
            return 0;
        }
        let Some(class) = self.context.classes.get(&call.declaring) else { return 0 };
        let Some(declaration) = self.declaration(*class, &call.method) else { return 0 };
        if let Some(known) = self.summaries.borrow().get(&declaration.id()) {
            return *known;
        }
        let final_class = self.context.resolver.index.get(&call.declaring).is_some_and(|info| info.flags & flag::FINAL != 0);
        let fixed = call.method.is_static || call.method.is_private || call.method.name == "<init>" || call.method.flags & flag::FINAL != 0 || final_class;
        // While a method is being worked out, a call back into it counts as dereferencing nothing. What was worked
        // out with such an answer inside is kept only for the outermost method: the others are asked again later.
        let (deep, again) = (self.running.borrow().len(), self.running.borrow().contains(&declaration.id()));
        if let Some(known) = self.passing.borrow().get(&declaration.id()) {
            self.cut.set(true);
            return *known;
        }
        if again || deep >= DEEPEST {
            self.cut.set(true);
            return 0;
        }
        self.running.borrow_mut().push(declaration.id());
        self.built.set(self.built.get() + 1);
        let before = self.cut.replace(false);
        let mut bits = 0;
        if let Some(body) = declaration.child_by_field_name("body").filter(|_| fixed || !self.overridden(call)) {
            let unit = Unit::build(self, &call.declaring, body, declaration.child_by_field_name("parameters"));
            let (entry, _) = super::must::run(&unit);
            for (position, path) in unit.parameters.iter().enumerate().take(64) {
                if super::must::has(&entry[0], *path) {
                    bits |= 1 << position;
                }
            }
        }
        self.running.borrow_mut().pop();
        let cut = self.cut.get();
        if !cut || deep == 0 {
            self.summaries.borrow_mut().insert(declaration.id(), bits);
        } else {
            self.passing.borrow_mut().insert(declaration.id(), bits);
        }
        if deep == 0 && self.built.get() < MOST {
            self.passing.borrow_mut().clear();
        }
        self.cut.set(before || (cut && deep > 0));
        bits
    }
}

pub struct Unit<'c, 'a> {
    pub finder: Finder<'c, 'a>,
    pub cfg: Cfg<'a>,
    /// Per block, per step.
    pub effects: Vec<Vec<Vec<Effect<'a>>>>,
    pub tests: Vec<Option<Test>>,
    /// The calls whose result is taken as possibly null.
    pub nullable_calls: HashSet<usize>,
    /// The path each identifier or field access reads.
    pub reads: HashMap<usize, usize>,
    pub parameters: Vec<usize>,
    pub of_this: Vec<usize>,
    /// Per path: the paths that go through it.
    pub dependents: Vec<Vec<usize>>,
}

impl<'c, 'a> Unit<'c, 'a> {
    pub fn build(shared: &Shared<'c, 'a>, class: &'c str, body: Node<'a>, parameters: Option<Node<'a>>) -> Self {
        let context = shared.context;
        let cfg = cfg::build_with(context.file, body, &|_| false, true);
        let mut unit = Unit {
            finder: Finder::new(context, class),
            cfg,
            effects: Vec::new(),
            tests: Vec::new(),
            nullable_calls: HashSet::new(),
            reads: HashMap::new(),
            parameters: Vec::new(),
            of_this: Vec::new(),
            dependents: Vec::new(),
        };
        for parameter in parameters.map(children).unwrap_or_default() {
            let name = parameter.child_by_field_name("name").or_else(|| {
                children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name"))
            });
            if let Some(name) = name.filter(|_| matches!(parameter.kind(), "formal_parameter" | "spread_parameter")) {
                let path = unit.finder.local(context.text(name));
                unit.parameters.push(path);
            }
        }
        for block in 0..unit.cfg.blocks.len() {
            let steps = unit.cfg.blocks[block].steps.clone();
            let found = steps.into_iter().map(|step| unit.step(shared, step)).collect();
            unit.effects.push(found);
            let test = match &unit.cfg.blocks[block].exit {
                Exit::Branch(test, holds, fails) if !unit.materialized(*holds, *fails) => Some(*test),
                _ => None,
            };
            let test = test.and_then(|test| unit.test(test));
            unit.tests.push(test);
        }
        let paths = &unit.finder.all;
        unit.of_this = (0..paths.len()).filter(|path| paths[*path].of_this).collect();
        unit.dependents = paths
            .iter()
            .map(|path| {
                let start = format!("{}.", path.key);
                (0..paths.len()).filter(|other| paths[*other].key.starts_with(&start)).collect()
            })
            .collect();
        unit
    }

    fn text(&self, node: Node) -> &'c str {
        self.finder.context.text(node)
    }

    /// A test whose two sides do nothing and meet again: its result only becomes a boolean value.
    fn materialized(&self, holds: usize, fails: usize) -> bool {
        let empty = |block: usize| self.cfg.blocks[block].steps.is_empty();
        let next = |block: usize| match self.cfg.blocks[block].exit {
            Exit::Jump(to) => Some(to),
            _ => None,
        };
        empty(holds) && empty(fails) && next(holds).is_some() && next(holds) == next(fails)
    }

    fn test(&mut self, node: Node<'a>) -> Option<Test> {
        let (tested, null_holds) = match node.kind() {
            "binary_expression" => {
                let operator = node.child_by_field_name("operator")?.kind();
                let (left, right) = (strip(node.child_by_field_name("left")?), strip(node.child_by_field_name("right")?));
                let other = match (left.kind(), right.kind()) {
                    ("null_literal", _) => right,
                    (_, "null_literal") => left,
                    _ => return None,
                };
                match operator {
                    "==" => (other, Some(true)),
                    "!=" => (other, Some(false)),
                    _ => return None,
                }
            }
            "instanceof_expression" => (strip(node.child_by_field_name("left")?), None),
            "method_invocation" => {
                let name = self.text(node.child_by_field_name("name")?);
                let owner = node.child_by_field_name("object").map(|object| self.text(object));
                let listed = arguments(node);
                if !matches!(owner, Some("Objects" | "java.util.Objects")) || listed.len() != 1 || !matches!(name, "isNull" | "nonNull") {
                    return None;
                }
                (strip(listed[0]), Some(name == "isNull"))
            }
            _ => return None,
        };
        let tested = if tested.kind() == "assignment_expression" { tested.child_by_field_name("left")? } else { tested };
        let path = self.finder.of(tested)?;
        (!self.finder.all[path].volatile).then_some(Test { path, null_holds, node: node.id() })
    }

    fn instance_access(&self, access: Node<'a>) -> bool {
        match self.finder.accessed(access) {
            Some((_, _, fixed)) => !fixed,
            None => access.child_by_field_name("object").is_some_and(|object| !matches!(self.finder.context.resolver.receiver(object), Some(Receiver::Static(_)))),
        }
    }

    fn sources(&mut self, value: Node<'a>, found: &mut Vec<usize>) {
        let value = strip(value);
        if value.kind() == "ternary_expression" {
            for arm in ["consequence", "alternative"] {
                if let Some(arm) = value.child_by_field_name(arm) {
                    self.sources(arm, found);
                }
            }
        } else {
            found.extend(self.finder.of(value));
        }
    }

    fn assign(&mut self, to: usize, from: Option<Node<'a>>) -> Effect<'a> {
        let mut sources = Vec::new();
        if let Some(from) = from {
            self.sources(from, &mut sources);
        }
        Effect::Assign { to, from, sources }
    }

    fn deref(&mut self, of: Node<'a>, at: Node<'a>, how: How) -> Effect<'a> {
        Effect::Deref { of, path: self.finder.of(of), at, how }
    }

    fn passed(&mut self, shared: &Shared<'c, 'a>, call: &Call, step: Node<'a>, at: Node<'a>, found: &mut Vec<Effect<'a>>) {
        let bits = shared.summary(call);
        for (position, argument) in arguments(step).into_iter().enumerate().take(64) {
            if bits & (1 << position) != 0 {
                found.push(self.deref(argument, at, How::Parameter));
            }
        }
    }

    fn step(&mut self, shared: &Shared<'c, 'a>, step: Node<'a>) -> Vec<Effect<'a>> {
        let resolver = self.finder.context.resolver;
        let mut found = Vec::new();
        let hands_this = |listed: &[Node]| listed.iter().any(|argument| strip(*argument).kind() == "this");
        match step.kind() {
            "method_invocation" => {
                let call = resolver.resolve_call(step);
                let name = step.child_by_field_name("name").unwrap_or(step);
                let object = step.child_by_field_name("object");
                let fixed = call.as_ref().is_some_and(|call| call.method.is_static);
                if let Some(object) = object.filter(|object| !fixed && !matches!(resolver.receiver(*object), Some(Receiver::Static(_)))) {
                    found.push(self.deref(object, name, How::Call));
                }
                let listed = arguments(step);
                if let Some(call) = &call {
                    if call.declaring == "java.util.Objects" && call.method.name == "requireNonNull" {
                        found.extend(listed.first().and_then(|first| self.finder.of(*first)).map(Effect::Checked));
                    } else {
                        self.passed(shared, call, step, name, &mut found);
                    }
                    if shared.marked(call) {
                        self.nullable_calls.insert(step.id());
                    }
                }
                let on_this = match object {
                    Some(object) => matches!(strip(object).kind(), "this" | "super"),
                    None => !fixed,
                };
                if on_this || hands_this(&listed) {
                    found.push(Effect::Invalidate);
                }
            }
            "object_creation_expression" => {
                if let Some((call, _)) = resolver.call_formals(step) {
                    self.passed(shared, &call, step, step, &mut found);
                }
                if hands_this(&arguments(step)) {
                    found.push(Effect::Invalidate);
                }
            }
            "explicit_constructor_invocation" => found.push(Effect::Invalidate),
            "field_access" => {
                if let Some(object) = step.child_by_field_name("object").filter(|_| self.instance_access(step)) {
                    found.push(self.deref(object, step, How::Other));
                }
                let read = self.finder.of(step);
                self.reads.extend(read.map(|path| (step.id(), path)));
            }
            "identifier" => {
                let read = self.finder.of(step);
                self.reads.extend(read.map(|path| (step.id(), path)));
            }
            "array_access" => {
                if let Some(array) = step.child_by_field_name("array") {
                    found.push(self.deref(array, step, How::Other));
                }
            }
            "assignment_expression" => {
                let (left, right) = (step.child_by_field_name("left"), step.child_by_field_name("right"));
                let plain = step.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=");
                if let Some(left) = left {
                    if let Some(object) = left.child_by_field_name("object").filter(|_| left.kind() == "field_access" && self.instance_access(left)) {
                        found.push(self.deref(object, left, How::Other));
                    }
                    if let Some(to) = self.finder.of(left) {
                        found.push(self.assign(to, right.filter(|_| plain)));
                    }
                }
            }
            "variable_declarator" | "resource" | "enhanced_for_statement" | "catch_formal_parameter" => {
                let name = step.child_by_field_name("name").or_else(|| {
                    children(step).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name"))
                });
                if let Some(name) = name.filter(|name| name.kind() == "identifier") {
                    let to = self.finder.local(self.text(name));
                    let from = step.child_by_field_name("value").filter(|_| step.kind() != "enhanced_for_statement");
                    found.push(self.assign(to, from));
                }
            }
            "update_expression" => {
                let operand = named_children(step).into_iter().next();
                if let Some(to) = operand.and_then(|operand| self.finder.of(operand)) {
                    found.push(self.assign(to, None));
                }
            }
            "throw_statement" => {
                if let Some(thrown) = named_children(step).into_iter().find(|part| !part.kind().ends_with("comment")) {
                    found.push(self.deref(thrown, thrown, How::Other));
                }
            }
            "assert_statement" => {
                let mut tested = Vec::new();
                crate::engine::source::walk(step, |part| {
                    if part.kind() == "binary_expression" && children(part).iter().any(|side| side.kind() == "null_literal") {
                        tested.extend(named_children(part));
                    }
                });
                found.push(Effect::Asserted);
                for side in tested {
                    found.extend(self.finder.of(side).map(Effect::Checked));
                }
            }
            _ => {}
        }
        if self.consumed(step) {
            found.push(self.deref(step, step, How::Other));
            if parent(step).is_some_and(|above| above.kind() == "synchronized_statement") {
                found.push(Effect::Invalidate);
            }
        }
        found
    }

    fn boxed(&self, node: Node<'a>) -> bool {
        matches!(strip(node).kind(), "identifier" | "field_access" | "method_invocation")
            && matches!(self.finder.context.resolver.type_of(node), Some(Type::Class(name, _)) if BOXES.contains(&name.as_str()))
    }

    fn primitive(&self, node: Node<'a>) -> bool {
        !matches!(self.finder.context.resolver.type_of(node), Some(Type::Class(..) | Type::Array(_)))
    }

    /// Whether the value of the node is dereferenced by where it stands: iterated, locked on, switched on or unboxed.
    fn consumed(&self, node: Node<'a>) -> bool {
        let Some(above) = parent(node) else { return false };
        let field = |name: &str| above.child_by_field_name(name) == Some(node);
        match above.kind() {
            "enhanced_for_statement" => field("value"),
            "synchronized_statement" => node.kind() == "parenthesized_expression",
            "switch_expression" => field("condition") && !self.primitive(node),
            "binary_expression" => {
                let operator = above.child_by_field_name("operator").map_or("", |operator| operator.kind());
                let other = if field("left") { above.child_by_field_name("right") } else { above.child_by_field_name("left") };
                match operator {
                    "==" | "!=" => other.is_some_and(|other| strip(other).kind() != "null_literal" && self.primitive(other)) && self.boxed(node),
                    "+" => self.boxed(node) && !matches!(self.finder.context.resolver.type_of(above), Some(Type::Class(name, _)) if name == "java.lang.String"),
                    _ => self.boxed(node),
                }
            }
            "unary_expression" | "update_expression" => self.boxed(node),
            "parenthesized_expression" => {
                let around = parent(above).map_or("", |around| around.kind());
                matches!(around, "if_statement" | "while_statement" | "do_statement") && self.boxed(node)
            }
            "ternary_expression" => field("condition") && self.boxed(node),
            "variable_declarator" => {
                let declared = parent(above).and_then(|declaration| declaration.child_by_field_name("type"));
                field("value") && declared.is_some_and(|declared| PRIMITIVES.contains(&declared.kind())) && self.boxed(node)
            }
            "assignment_expression" => {
                let plain = above.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "=");
                let target = above.child_by_field_name("left");
                field("right") && (!plain || target.is_some_and(|target| self.primitive(target))) && self.boxed(node)
            }
            "return_statement" => {
                let mut current = parent(above);
                while let Some(at) = current {
                    match at.kind() {
                        "method_declaration" => {
                            return at.child_by_field_name("type").is_some_and(|declared| PRIMITIVES.contains(&declared.kind())) && self.boxed(node);
                        }
                        "lambda_expression" | "class_body" => return false,
                        _ => current = parent(at),
                    }
                }
                false
            }
            "array_access" => field("index") && self.boxed(node),
            _ => false,
        }
    }
}
