//! What each step of a body does to the values it works with: dereferences, stores, tests, and calls that can
//! change the fields of the object the method runs on.
use super::super::Context;
use super::{jdk, marks};
use super::paths::{Finder, strip};
use crate::engine::source::{children, named_children, parent};
use crate::java::flow::cfg::{self, Cfg, Exit};
use crate::java::types::expr::{Call, Receiver};
use crate::java::types::model::{Method, Type, flag};
use std::cell::{Cell, RefCell};
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

/// Why a path is not null after a step.
#[derive(Clone, Copy, PartialEq)]
pub enum Check {
    /// Handed to `Objects.requireNonNull`, which counts as a dereference.
    Required,
    /// An `assert` whose condition holds only when it is not null (`x != null`, alone or joined by `&&`).
    Implied,
    /// Compared with `null` somewhere else in an `assert`.
    Compared,
    /// Locked on with `synchronized` where locking does not count as a dereference.
    Locked,
}

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
    Checked(usize, Check),
    /// An `assert` was passed: SpotBugs reports nothing later for a value that only may be null here.
    Asserted,
}

/// How much a body is worked out for.
#[derive(Clone, Copy, PartialEq)]
pub enum Mode {
    /// For the parameters it dereferences: what callees dereference is worked out, not what they return.
    Dereferences,
    /// For what it returns: everything about callees is worked out.
    Returns,
    /// For reporting: whether a callee never returns null is worked out only when the body tests for null.
    Report,
}

/// Whether something in a body can be null where it is dereferenced: a `null`, a test for null, a result or a
/// field taken as possibly null. Bodies without any are not worked out.
pub fn may_hold_null<'c, 'a>(shared: &Shared<'c, 'a>, class: &'c str, body: Node<'a>) -> bool {
    let context = shared.context;
    let mut finder = Finder::new(context, class);
    let mut found = false;
    crate::engine::source::walk(body, |node| {
        if found {
            return;
        }
        found = match node.kind() {
            "null_literal" => true,
            "method_invocation" => {
                let named = node.child_by_field_name("name").map(|name| context.text(name));
                matches!(named, Some("isNull" | "nonNull")) || context.resolver.resolve_call(node).is_some_and(|call| shared.marked(&call))
            }
            "identifier" | "field_access" => finder.of(node).is_some_and(|path| finder.all[path].checked),
            _ => false,
        };
    });
    found
}

/// A call that hands values to a method that may dereference them, waiting until the body is read.
pub struct Handed<'a> {
    block: usize,
    position: usize,
    /// Where the dereferences go among the effects of the step.
    index: usize,
    call: Call,
    step: Node<'a>,
    at: Node<'a>,
}

/// A branch on whether a path is null.
pub struct Test {
    pub path: usize,
    /// A comparison with `null`, not a call such as `Objects.isNull` or an `instanceof`.
    pub compared: bool,
    /// `Some(true)`: null where the test holds. `None`: only known not to be null where it holds (`instanceof`).
    pub null_holds: Option<bool>,
    pub node: usize,
}

/// What is shared by the bodies of one file.
pub struct Shared<'c, 'a> {
    pub context: &'c Context<'a>,
    summaries: RefCell<HashMap<usize, u64>>,
    /// Summaries worked out without meeting a method still being worked out: the same whatever asked for them.
    pub settled: RefCell<Vec<(Call, u64)>>,
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
    never_null: RefCell<HashMap<usize, bool>>,
    proving: RefCell<Vec<usize>>,
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
            settled: RefCell::default(),
            passing: RefCell::default(),
            running: RefCell::default(),
            cut: Cell::new(false),
            built: Cell::new(0),
            marked: RefCell::default(),
            overridden: RefCell::default(),
            never_null: RefCell::default(),
            proving: RefCell::default(),
        }
    }

    /// Starts the next class: the count of bodies worked out and the summaries that may say too little are per class.
    pub fn next_class(&self) {
        self.built.set(0);
        self.passing.borrow_mut().clear();
    }

    fn key(call: &Call) -> (String, String, usize) {
        (call.declaring.clone(), call.method.name.clone(), call.method.parameters.len())
    }

    /// Whether the call's result is taken as possibly null.
    pub fn marked(&self, call: &Call) -> bool {
        let key = (call.receiver.name(), format!("{}.{}", call.declaring, call.method.name), format!("{:?}", call.method.parameters));
        if let Some(known) = self.marked.borrow().get(&key) {
            return *known;
        }
        let index = self.context.resolver.index;
        let found = marks::method(index, &call.declaring, &call.method) || jdk::returns_null(index, call);
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

    /// Whether the called method never returns null: a JDK method SpotBugs knows so, or a method of this file
    /// that no class of the run overrides and whose every `return` hands back a value known not to be null.
    pub fn never_null(&self, call: &Call) -> bool {
        let index = self.context.resolver.index;
        if jdk::object_never_null(call) {
            return true;
        }
        let Some(class) = self.context.classes.get(&call.declaring) else {
            return self.context.elsewhere.never_null(self.context.project, call).unwrap_or_else(|| jdk::never_null(index, call));
        };
        let Some(declaration) = self.declaration(*class, &call.method) else { return false };
        if let Some(known) = self.never_null.borrow().get(&declaration.id()) {
            return *known;
        }
        if self.proving.borrow().contains(&declaration.id()) || self.proving.borrow().len() >= DEEPEST {
            return false;
        }
        let final_class = index.get(&call.declaring).is_some_and(|info| info.flags & flag::FINAL != 0);
        let fixed = call.method.is_static || call.method.is_private || call.method.flags & flag::FINAL != 0 || final_class;
        let Some(body) = declaration.child_by_field_name("body").filter(|_| fixed || !self.overridden(call)) else { return false };
        self.proving.borrow_mut().push(declaration.id());
        let unit = Unit::build(self, &call.declaring, body, declaration.child_by_field_name("parameters"), Mode::Returns);
        let (starts, ends) = super::must::run(&unit);
        let mut flow = super::forward::Flow::new(&unit, &starts, &ends);
        flow.run();
        let found = flow.never_null(body);
        self.proving.borrow_mut().pop();
        self.never_null.borrow_mut().insert(declaration.id(), found);
        found
    }

    /// A bit per parameter the called method dereferences on every path that leaves it normally. Only for
    /// methods of this file that no class of the run overrides.
    pub fn summary(&self, call: &Call) -> u64 {
        let Some(class) = self.context.classes.get(&call.declaring) else {
            let elsewhere = self.context.elsewhere.dereferences(self.context.project, call);
            return elsewhere.unwrap_or_else(|| jdk::dereferenced(self.context.resolver.index, call));
        };
        if call.method.varargs {
            return 0;
        }
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
            let unit = Unit::build(self, &call.declaring, body, declaration.child_by_field_name("parameters"), Mode::Dereferences);
            let (entry, _) = super::must::run(&unit);
            for (position, path) in unit.parameters.iter().enumerate().take(64) {
                if super::must::has(&entry[0], *path) {
                    bits |= 1 << position;
                }
            }
        }
        self.running.borrow_mut().pop();
        let cut = self.cut.get();
        if !cut {
            self.settled.borrow_mut().push((call.clone(), bits));
        }
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
    pub body: Node<'a>,
    pub finder: Finder<'c, 'a>,
    pub cfg: Cfg<'a>,
    /// Per block, per step.
    pub effects: Vec<Vec<Vec<Effect<'a>>>>,
    pub tests: Vec<Option<Test>>,
    /// The calls whose result is taken as possibly null.
    pub nullable_calls: HashSet<usize>,
    /// Calls that never return null, with the name SpotBugs gives the method.
    pub nonnull_calls: HashMap<usize, String>,
    /// The path each identifier or field access reads.
    pub reads: HashMap<usize, usize>,
    pub parameters: Vec<usize>,
    pub of_this: Vec<usize>,
    /// Per path: the paths that go through it.
    pub dependents: Vec<Vec<usize>>,
    pub mode: Mode,
    /// Whether locking on a value with `synchronized` dereferences it.
    pub locks: bool,
}

impl<'c, 'a> Unit<'c, 'a> {
    /// Whether the unit only works out which parameters an `equals` dereferences, with the rules measured for that.
    pub fn equals_rules(&self) -> bool {
        self.mode == Mode::Dereferences && !self.locks
    }

    pub fn build(shared: &Shared<'c, 'a>, class: &'c str, body: Node<'a>, parameters: Option<Node<'a>>, mode: Mode) -> Self {
        Self::build_with(shared, class, body, parameters, mode, true)
    }

    pub fn build_with(shared: &Shared<'c, 'a>, class: &'c str, body: Node<'a>, parameters: Option<Node<'a>>, mode: Mode, locks: bool) -> Self {
        let context = shared.context;
        let cfg = cfg::build_with(context.file, body, &|_| false, true);
        let mut unit = Unit {
            body,
            finder: Finder::new(context, class),
            cfg,
            effects: Vec::new(),
            tests: Vec::new(),
            nullable_calls: HashSet::new(),
            nonnull_calls: HashMap::new(),
            reads: HashMap::new(),
            parameters: Vec::new(),
            of_this: Vec::new(),
            dependents: Vec::new(),
            mode,
            locks,
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
        let mut called = Vec::new();
        let mut waiting = Vec::new();
        for block in 0..unit.cfg.blocks.len() {
            let steps = unit.cfg.blocks[block].steps.clone();
            let mut found = Vec::new();
            for (position, step) in steps.into_iter().enumerate() {
                let noted = waiting.len();
                found.push(unit.step(shared, step, &mut called, &mut waiting));
                for handed in &mut waiting[noted..] {
                    (handed.block, handed.position) = (block, position);
                }
            }
            unit.effects.push(found);
            let test = match &unit.cfg.blocks[block].exit {
                Exit::Branch(test, holds, fails) if !unit.materialized(*holds, *fails) || !unit.locks => Some(*test),
                _ => None,
            };
            let test = test.and_then(|test| unit.test(test));
            unit.tests.push(test);
        }
        unit.settle(shared, mode, waiting);
        if matches!(mode, Mode::Returns | Mode::Report) {
            let reaching = unit.reaching(mode);
            let called = called.into_iter().filter(|(step, _)| reaching.contains(step));
            let named = |call: &Call| format!("{}.{}()", call.declaring.rsplit('.').next().unwrap_or_default(), call.method.name);
            unit.nonnull_calls = called.filter(|(_, call)| shared.never_null(call)).map(|(step, call)| (step, named(&call))).collect();
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

    /// A test only turned into a boolean: both ways lead straight to the same place, at most pushing `0`/`1`
    /// (or `false`/`true`), as the compiled form of `x == null ? 0 : 1` does.
    fn materialized(&self, holds: usize, fails: usize) -> bool {
        let empty = |block: usize| self.cfg.blocks[block].steps.is_empty();
        let next = |block: usize| match self.cfg.blocks[block].exit {
            Exit::Jump(to) => Some(to),
            _ => None,
        };
        let bit = |block: usize| match self.cfg.blocks[block].steps.as_slice() {
            [only] => match self.text(*only) {
                "0" | "false" => Some(false),
                "1" | "true" => Some(true),
                _ => None,
            },
            _ => None,
        };
        let flag = bit(holds).is_some() && bit(fails).is_some() && bit(holds) != bit(fails);
        (flag || (empty(holds) && empty(fails))) && next(holds).is_some() && next(holds) == next(fails)
    }

    fn test(&mut self, node: Node<'a>) -> Option<Test> {
        let mut by_this = false;
        let (tested, null_holds) = match node.kind() {
            "binary_expression" => {
                let operator = node.child_by_field_name("operator")?.kind();
                let (left, right) = (strip(node.child_by_field_name("left")?), strip(node.child_by_field_name("right")?));
                let condition = parent(node).filter(|above| above.kind() == "parenthesized_expression").and_then(parent);
                let guard = !self.locks && operator == "==" && condition.is_some_and(|above| above.kind() == "if_statement");
                let (other, null) = match (left.kind(), right.kind()) {
                    ("null_literal", _) => (right, true),
                    (_, "null_literal") => (left, true),
                    ("this", _) if guard => (right, false),
                    (_, "this") if guard => (left, false),
                    _ => return None,
                };
                by_this = !null;
                match operator {
                    "==" => (other, Some(null)),
                    "!=" => (other, Some(!null)),
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
        let compared = node.kind() == "binary_expression" && !by_this;
        (!self.finder.all[path].volatile).then_some(Test { path, compared, null_holds, node: node.id() })
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

    /// Notes a call whose callee may dereference what it is handed; what it dereferences is worked out once the
    /// whole body is read, and only for calls handed a value that matters.
    fn passed(&mut self, call: &Call, step: Node<'a>, at: Node<'a>, found: &[Effect<'a>], waiting: &mut Vec<Handed<'a>>) {
        waiting.push(Handed { block: 0, position: 0, index: found.len(), call: call.clone(), step, at });
    }

    /// Whether an argument can hold a value that matters: one that may be null, or, for the dereferences of a
    /// body's parameters, one that came from a parameter.
    fn matters(&mut self, argument: Node<'a>, wanted: &HashSet<usize>, nulls: bool) -> bool {
        if self.finder.of(argument).is_some_and(|path| wanted.contains(&path)) {
            return true;
        }
        if !nulls {
            return false;
        }
        let mut found = false;
        crate::engine::source::walk(argument, |node| {
            found |= node.kind() == "null_literal" || self.nullable_calls.contains(&node.id());
        });
        found || self.reads_any(argument, wanted)
    }

    fn reads_any(&self, node: Node<'a>, wanted: &HashSet<usize>) -> bool {
        let mut found = false;
        crate::engine::source::walk(node, |part| found |= self.reads.get(&part.id()).is_some_and(|path| wanted.contains(path)));
        found
    }

    /// The paths whose value matters: for reporting, those that may hold null (fields taken as possibly null,
    /// paths tested for null, and what is stored from `null`, a possibly null result or such a path); for the
    /// dereferences of a body's parameters, the parameters and what is stored from them.
    fn wanted(&self, mode: Mode) -> HashSet<usize> {
        let mut wanted: HashSet<usize> = match mode {
            Mode::Dereferences => self.parameters.iter().copied().collect(),
            _ => {
                let mut start: HashSet<usize> = (0..self.finder.all.len()).filter(|path| self.finder.all[*path].checked).collect();
                start.extend(self.tests.iter().flatten().map(|test| test.path));
                start
            }
        };
        let nulls = mode != Mode::Dereferences;
        let mut grown = true;
        while grown {
            grown = false;
            for effect in self.effects.iter().flatten().flatten() {
                let Effect::Assign { to, from, sources } = effect else { continue };
                if wanted.contains(to) {
                    continue;
                }
                let mut hit = sources.iter().any(|source| wanted.contains(source));
                if let Some(from) = from.filter(|_| nulls && !hit) {
                    crate::engine::source::walk(from, |node| hit |= node.kind() == "null_literal" || self.nullable_calls.contains(&node.id()));
                }
                if hit {
                    wanted.insert(*to);
                    grown = true;
                }
            }
        }
        wanted
    }

    /// Works out what the noted callees dereference, for the calls handed a value that matters.
    fn settle(&mut self, shared: &Shared<'c, 'a>, mode: Mode, waiting: Vec<Handed<'a>>) {
        let wanted = self.wanted(mode);
        let nulls = mode != Mode::Dereferences;
        for handed in waiting.into_iter().rev() {
            let listed = arguments(handed.step);
            let any = mode == Mode::Returns || listed.iter().any(|argument| self.matters(*argument, &wanted, nulls));
            if !any {
                continue;
            }
            let bits = shared.summary(&handed.call);
            let mut inserted = Vec::new();
            for (position, argument) in listed.into_iter().enumerate().take(64) {
                if bits & (1 << position) != 0 {
                    inserted.push(self.deref(argument, handed.at, How::Parameter));
                }
            }
            let effects = &mut self.effects[handed.block][handed.position];
            for (offset, effect) in inserted.into_iter().enumerate() {
                effects.insert(handed.index + offset, effect);
            }
        }
    }

    /// The expressions whose value an expression is: both arms of `?:`, the value of an assignment.
    fn heads(node: Node<'a>, found: &mut Vec<Node<'a>>) {
        let node = strip(node);
        match node.kind() {
            "ternary_expression" => {
                for arm in ["consequence", "alternative"] {
                    if let Some(arm) = node.child_by_field_name(arm) {
                        Self::heads(arm, found);
                    }
                }
            }
            "assignment_expression" => match node.child_by_field_name("right") {
                Some(right) => Self::heads(right, found),
                None => found.push(node),
            },
            _ => found.push(node),
        }
    }

    /// The calls whose result can reach what matters: for reporting, a test for null; for what a body returns,
    /// a `return`. Only for these is it worked out whether the callee never returns null.
    fn reaching(&mut self, mode: Mode) -> HashSet<usize> {
        let mut heads = Vec::new();
        if mode == Mode::Returns {
            let mut pending = vec![self.body];
            while let Some(node) = pending.pop() {
                for part in children(node) {
                    match part.kind() {
                        "lambda_expression" | "class_body" => {}
                        "return_statement" => {
                            let value = children(part).into_iter().find(|inner| inner.is_named() && !inner.kind().ends_with("comment"));
                            value.into_iter().for_each(|value| Self::heads(value, &mut heads));
                        }
                        _ => pending.push(part),
                    }
                }
            }
        }
        let mut wanted: HashSet<usize> = heads.iter().filter_map(|head| self.finder.of(*head)).collect();
        wanted.extend(self.tests.iter().flatten().filter(|test| test.null_holds.is_some()).map(|test| test.path));
        let mut reaching: HashSet<usize> = heads.iter().filter(|head| head.kind() == "method_invocation").map(|head| head.id()).collect();
        crate::engine::source::walk(self.body, |node| {
            let sides = [node.child_by_field_name("left"), node.child_by_field_name("right")].map(|side| side.map(strip));
            if let ("binary_expression", [Some(left), Some(right)]) = (node.kind(), sides) {
                let call = if left.kind() == "null_literal" { right } else { left };
                if (left.kind() == "null_literal") != (right.kind() == "null_literal") && call.kind() == "method_invocation" {
                    reaching.insert(call.id());
                }
            }
        });
        let mut grown = true;
        while grown {
            grown = false;
            for effect in self.effects.iter().flatten().flatten() {
                let Effect::Assign { to, from: Some(from), sources } = effect else { continue };
                if !wanted.contains(to) {
                    continue;
                }
                for source in sources {
                    grown |= wanted.insert(*source);
                }
                let mut found = Vec::new();
                Self::heads(*from, &mut found);
                for head in found.into_iter().filter(|head| head.kind() == "method_invocation") {
                    grown |= reaching.insert(head.id());
                }
            }
        }
        reaching
    }

    fn step(&mut self, shared: &Shared<'c, 'a>, step: Node<'a>, called: &mut Vec<(usize, Call)>, waiting: &mut Vec<Handed<'a>>) -> Vec<Effect<'a>> {
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
                    let required = call.declaring == "java.util.Objects" && call.method.name == "requireNonNull";
                    if required && self.mode == Mode::Dereferences {
                        found.extend(listed.first().map(|first| self.deref(*first, name, How::Parameter)));
                    } else if required {
                        found.extend(listed.first().and_then(|first| self.finder.of(*first)).map(|path| Effect::Checked(path, Check::Required)));
                    } else {
                        self.passed(call, step, name, &found, waiting);
                    }
                    if shared.marked(call) {
                        self.nullable_calls.insert(step.id());
                    } else {
                        called.push((step.id(), call.clone()));
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
                    self.passed(&call, step, step, &found, waiting);
                }
                if hands_this(&arguments(step)) {
                    found.push(Effect::Invalidate);
                }
            }
            "explicit_constructor_invocation" => {
                if let Some((call, _)) = resolver.call_formals(step) {
                    self.passed(&call, step, step, &found, waiting);
                }
                found.push(Effect::Invalidate);
            }
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
                let mut implied = Vec::new();
                if let Some(condition) = named_children(step).into_iter().find(|part| !part.kind().ends_with("comment")) {
                    self.implied(condition, &mut implied);
                }
                let mut tested = Vec::new();
                crate::engine::source::walk(step, |part| {
                    if part.kind() == "binary_expression" && children(part).iter().any(|side| side.kind() == "null_literal") {
                        tested.extend(named_children(part));
                    }
                });
                found.push(Effect::Asserted);
                for side in tested {
                    let check = if implied.contains(&side.id()) { Check::Implied } else { Check::Compared };
                    found.extend(self.finder.of(side).map(|path| Effect::Checked(path, check)));
                }
            }
            _ => {}
        }
        let lock = parent(step).filter(|above| above.kind() == "synchronized_statement" && step.kind() == "parenthesized_expression");
        if !self.locks && lock.is_some() {
            found.extend(self.finder.of(strip(step)).map(|path| Effect::Checked(path, Check::Locked)));
        }
        if self.consumed(step) {
            found.push(self.deref(step, step, How::Other));
            if parent(step).is_some_and(|above| above.kind() == "synchronized_statement") {
                found.push(Effect::Invalidate);
            }
        }
        found
    }

    /// The values an `assert` condition holds only when they are not null: `x != null`, also inside `&&`.
    fn implied(&self, condition: Node<'a>, out: &mut Vec<usize>) {
        let condition = strip(condition);
        if condition.kind() != "binary_expression" {
            return;
        }
        let operator = condition.child_by_field_name("operator").map_or("", |operator| operator.kind());
        let (Some(left), Some(right)) = (condition.child_by_field_name("left"), condition.child_by_field_name("right")) else { return };
        match operator {
            "&&" => {
                self.implied(left, out);
                self.implied(right, out);
            }
            "!=" if strip(right).kind() == "null_literal" => out.push(left.id()),
            "!=" if strip(left).kind() == "null_literal" => out.push(right.id()),
            _ => {}
        }
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
            "synchronized_statement" => self.locks && node.kind() == "parenthesized_expression",
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
