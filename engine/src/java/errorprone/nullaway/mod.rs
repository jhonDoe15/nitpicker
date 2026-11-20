//! NullAway's dereference check on the engine's own control-flow graph: which expressions may be null where
//! they are dereferenced. Follows NullAway 0.14.2 (MIT licence, Copyright (c) 2017 Uber Technologies, Inc.):
//! facts are kept per access path (a local, a field chain, a call without arguments), joined where paths meet.
use super::Context;
mod functional;
mod models;
mod sites;
use crate::engine::source::{children, named_children, parent, walk};
use crate::java::flow::cfg::{self, Cfg, Exit, unwrap};
use crate::java::types::expr::{Binding, Call, Receiver};
use crate::java::types::model::{ClassInfo, Field, Type, flag};
use std::collections::{HashMap, VecDeque};
use tree_sitter::Node;

const ABSENT: u8 = 0;
const NULL: u8 = 1;
const NONNULL: u8 = 2;
const NULLABLE: u8 = 3;
const BOTTOM: u8 = 4;

fn least_upper(a: u8, b: u8) -> u8 {
    if a == b || b == BOTTOM {
        a
    } else if a == BOTTOM {
        b
    } else {
        NULLABLE
    }
}

fn greatest_lower(a: u8, b: u8) -> u8 {
    if a == b || b == NULLABLE {
        a
    } else if a == NULLABLE {
        b
    } else {
        BOTTOM
    }
}

type Store = Vec<u8>;

fn read(store: &Store, path: usize) -> u8 {
    store.get(path).copied().unwrap_or(ABSENT)
}

fn write(store: &mut Store, path: usize, value: u8) {
    if store.len() <= path {
        store.resize(path + 1, ABSENT);
    }
    store[path] = value;
}

/// Keeps what both sides know. Says whether the target changed.
fn join(target: &mut Option<Store>, from: &Store) -> bool {
    let Some(known) = target else {
        *target = Some(from.clone());
        return true;
    };
    let mut changed = false;
    for (path, slot) in known.iter_mut().enumerate() {
        let other = read(from, path);
        let joined = if *slot == ABSENT || other == ABSENT { ABSENT } else { least_upper(*slot, other) };
        if joined != *slot {
            *slot = joined;
            changed = true;
        }
    }
    changed
}

fn annotated_packages() -> &'static [String] {
    static PACKAGES: std::sync::OnceLock<Vec<String>> = std::sync::OnceLock::new();
    PACKAGES.get_or_init(|| std::env::var("NP_NULLAWAY_PACKAGES").map(|list| list.split(',').map(String::from).collect()).unwrap_or_default())
}

fn annotated(class: &str) -> bool {
    let packages = annotated_packages();
    packages.is_empty() || packages.iter().any(|package| class.starts_with(package.as_str()) && class[package.len()..].starts_with('.'))
}

fn strip(mut node: Node) -> Node {
    loop {
        let inner = unwrap(node);
        match inner.kind() {
            "cast_expression" => match inner.child_by_field_name("value") {
                Some(value) => node = value,
                None => return inner,
            },
            _ => return inner,
        }
    }
}

struct Flow<'a, 't> {
    context: &'a Context<'a>,
    cfg: Cfg<'t>,
    paths: HashMap<String, usize>,
    values: HashMap<(usize, usize), u8>,
    /// Which lowering of a `finally` body is being worked on.
    copy: usize,
    /// Names bound inside the body: parameters, declared variables, loop and catch variables.
    locals: std::collections::HashSet<String>,
    /// What is known where a lambda or a class inside a method starts, by node.
    inner: HashMap<usize, Vec<(String, u8)>>,
    /// The switch expression each result node belongs to.
    owners: HashMap<usize, usize>,
}

impl<'a, 't> Flow<'a, 't> {
    fn text(&self, node: Node) -> &'a str {
        self.context.file.text_of(node)
    }
    fn path(&mut self, name: String) -> usize {
        let next = self.paths.len();
        *self.paths.entry(name).or_insert(next)
    }
    fn value(&self, node: Node) -> u8 {
        self.known(node).unwrap_or(NONNULL)
    }
    /// The ternary or switch expression that takes this node's value as its own, so that the value
    /// travels in the store and a later arm reaches the join again.
    fn owner(&self, node: Node) -> Option<usize> {
        if let Some(switch) = self.owners.get(&node.id()) {
            return Some(*switch);
        }
        let parent = node.parent().filter(|parent| parent.kind() == "ternary_expression")?;
        let arm = ["consequence", "alternative"].into_iter().any(|field| parent.child_by_field_name(field) == Some(node));
        arm.then(|| parent.id())
    }
    fn known(&self, node: Node) -> Option<u8> {
        self.values.get(&(node.id(), self.copy)).copied()
    }
    fn local(&mut self, name: Node) -> usize {
        let name = self.text(name).to_string();
        self.locals.insert(name.clone());
        self.path(name)
    }

    /// A record component read as a field from a method of the record: whether it may be null.
    fn component(&self, usage: Node) -> Option<bool> {
        let name = self.text(usage);
        if self.locals.contains(name) {
            return None;
        }
        let mut current = parent(usage);
        while let Some(at) = current {
            match at.kind() {
                "compact_constructor_declaration" | "class_declaration" | "interface_declaration" | "enum_declaration" => return None,
                "record_declaration" => {
                    let parameters = at.child_by_field_name("parameters")?;
                    let found = children(parameters).into_iter().find(|part| part.child_by_field_name("name").is_some_and(|written| self.text(written) == name))?;
                    return Some(crate::java::helpers::marked_nullable(self.context.file, found));
                }
                _ => current = parent(at),
            }
        }
        None
    }

    fn field(&self, access: Node) -> Option<(&'a ClassInfo, &'a Field, bool)> {
        let resolver = self.context.resolver;
        let name = self.text(access.child_by_field_name("field")?);
        match resolver.receiver(access.child_by_field_name("object")?)? {
            Receiver::Static(owner) => resolver.index.field(&owner, name).map(|(class, field)| (class, field, true)),
            Receiver::Value(Type::Class(owner, _)) => resolver.index.field(&owner, name).map(|(class, field)| (class, field, false)),
            Receiver::Value(_) => None,
        }
    }

    /// Whether a field access reads a static field or goes through a type name: nothing is dereferenced then.
    fn fixed(&self, access: Node, found: Option<(&ClassInfo, &Field, bool)>) -> bool {
        match found {
            Some((_, field, fixed)) => fixed || field.flags & flag::STATIC != 0,
            None => access.child_by_field_name("object").is_none_or(|object| !matches!(self.context.resolver.receiver(object), Some(Receiver::Value(_)))),
        }
    }

    fn nullable_field(class: &ClassInfo, field: &Field) -> bool {
        field.flags & flag::NULLABLE != 0 && annotated(&class.name)
    }

    /// A value that a path can pass through: `this` and the like, besides real paths.
    fn base(&mut self, node: Node) -> Option<String> {
        let node = strip(node);
        match node.kind() {
            "this" | "super" => Some("this".to_string()),
            _ => self.name_of(node),
        }
    }

    fn constant(&self, node: Node) -> Option<String> {
        let node = unwrap(node);
        let kind = node.kind();
        if kind.ends_with("_literal") && kind != "null_literal" || kind == "true" || kind == "false" {
            return Some(self.text(node).to_string());
        }
        None
    }

    fn name_of(&mut self, node: Node) -> Option<String> {
        let node = strip(node);
        let resolver = self.context.resolver;
        match node.kind() {
            "identifier" if resolver.binding(node, self.text(node)).is_none() => {
                resolver.pattern_variable(node, self.text(node)).map(|_| self.text(node).to_string())
            }
            "identifier" => match resolver.binding(node, self.text(node))? {
                Binding::Local(_) if self.component(node).is_some() => Some(format!("this.{}", self.text(node))),
                Binding::Local(_) => Some(self.text(node).to_string()),
                Binding::Field(_, class, field) if field.flags & flag::STATIC != 0 => Some(format!("{}.{}", class.name, field.name)),
                Binding::Field(..) => Some(format!("this.{}", self.text(node))),
            },
            "field_access" => {
                let (class, field, fixed) = self.field(node)?;
                if fixed || field.flags & flag::STATIC != 0 {
                    return Some(format!("{}.{}", class.name, field.name));
                }
                let base = self.base(node.child_by_field_name("object")?)?;
                Some(format!("{base}.{}", field.name))
            }
            "method_invocation" => {
                let call = resolver.resolve_call(node)?;
                let arguments: Vec<Node> = node.child_by_field_name("arguments").map(named_children).unwrap_or_default();
                let arguments: Vec<Node> = arguments.into_iter().filter(|argument| !argument.kind().ends_with("comment")).collect();
                let object = node.child_by_field_name("object");
                if map_method(resolver, &call, "get", 1) {
                    let key = match self.constant(arguments[0]) {
                        Some(key) => key,
                        None => self.name_of(arguments[0])?,
                    };
                    let base = match object {
                        Some(object) => self.base(object)?,
                        None => "this".to_string(),
                    };
                    return Some(format!("{base}.get[{key}]"));
                }
                if map_method(resolver, &call, "remove", 1) {
                    return None;
                }
                let mut constants = Vec::new();
                for argument in &arguments {
                    constants.push(self.constant(*argument)?);
                }
                if call.method.is_static {
                    return Some(format!("{}.{}({})", call.declaring, call.method.name, constants.join(",")));
                }
                let base = match object {
                    Some(object) => self.base(object)?,
                    None => "this".to_string(),
                };
                Some(format!("{base}.{}({})", call.method.name, constants.join(",")))
            }
            "array_access" => {
                let array = strip(node.child_by_field_name("array")?);
                let index = node.child_by_field_name("index")?;
                if !matches!(array.kind(), "identifier" | "field_access") {
                    return None;
                }
                let at = if index.kind() == "decimal_integer_literal" || matches!(index.kind(), "identifier" | "field_access") {
                    self.text(index).to_string()
                } else {
                    return None;
                };
                let base = self.name_of(array)?;
                Some(format!("{base}[{at}]"))
            }
            _ => None,
        }
    }

    fn path_of(&mut self, node: Node) -> Option<usize> {
        let name = self.name_of(node)?;
        Some(self.path(name))
    }

    fn known_or(&mut self, store: &Store, node: Node, otherwise: u8) -> u8 {
        match self.path_of(node) {
            Some(path) if read(store, path) != ABSENT => read(store, path),
            _ => otherwise,
        }
    }

    fn settle(&mut self, store: &mut Store, node: Node, value: u8) {
        if let Some(path) = self.path_of(node) {
            write(store, path, value);
        }
    }

    fn arguments(call: Node<'t>) -> Vec<Node<'t>> {
        let list: Vec<Node> = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
        list.into_iter().filter(|argument| !argument.kind().ends_with("comment")).collect()
    }

    fn step(&mut self, node: Node<'t>, store: &mut Store) -> u8 {
        let resolver = self.context.resolver;
        match node.kind() {
            "null_literal" => NULL,
            "identifier" => match resolver.binding(node, self.text(node)) {
                Some(Binding::Local(Some(Type::Primitive(_)))) => NONNULL,
                Some(Binding::Local(_)) => match self.component(node) {
                    Some(true) => self.known_or(store, node, NULLABLE),
                    _ => self.known_or(store, node, NONNULL),
                },
                Some(Binding::Field(_, class, field)) if Self::nullable_field(class, field) => self.known_or(store, node, NULLABLE),
                _ => NONNULL,
            },
            "field_access" => {
                let found = self.field(node);
                let fixed = self.fixed(node, found);
                if let (false, Some(object)) = (fixed, node.child_by_field_name("object")) {
                    self.settle(store, object, NONNULL);
                }
                match found {
                    Some((class, field, _)) if Self::nullable_field(class, field) => self.known_or(store, node, NULLABLE),
                    _ => NONNULL,
                }
            }
            "method_invocation" => self.call(node, store),
            "assignment_expression" => {
                if node.child_by_field_name("operator").is_none_or(|operator| operator.kind() != "=") {
                    return NONNULL;
                }
                let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return NONNULL };
                let value = self.value(right);
                match left.kind() {
                    "identifier" => self.settle(store, left, value),
                    "field_access" => {
                        let fixed = self.fixed(left, self.field(left));
                        if let (false, Some(object)) = (fixed, left.child_by_field_name("object")) {
                            self.settle(store, object, NONNULL);
                        }
                        self.settle(store, left, value);
                    }
                    "array_access" => {
                        if let Some(array) = left.child_by_field_name("array") {
                            self.settle(store, array, NONNULL);
                        }
                    }
                    _ => {}
                }
                value
            }
            "variable_declarator" | "resource" => {
                let Some(name) = node.child_by_field_name("name") else { return NONNULL };
                let Some(value) = node.child_by_field_name("value") else {
                    self.local(name);
                    return NONNULL;
                };
                let value = self.value(value);
                let path = self.local(name);
                write(store, path, value);
                value
            }
            "enhanced_for_statement" => {
                if let Some(value) = node.child_by_field_name("value") {
                    self.settle(store, value, NONNULL);
                }
                if let Some(name) = node.child_by_field_name("name") {
                    let path = self.local(name);
                    write(store, path, NONNULL);
                    let keys = node.child_by_field_name("value").map(strip).filter(|value| value.kind() == "method_invocation");
                    let map = keys.filter(|keys| resolver.resolve_call(*keys).is_some_and(|call| map_method(resolver, &call, "keySet", 0)));
                    if let Some(base) = map.and_then(|keys| keys.child_by_field_name("object")).and_then(|map| self.base(map)) {
                        let path = self.path(format!("{base}.get[{}]", self.text(name)));
                        write(store, path, NONNULL);
                    }
                }
                NONNULL
            }
            "catch_formal_parameter" => {
                if let Some(name) = node.child_by_field_name("name") {
                    let path = self.local(name);
                    write(store, path, NONNULL);
                }
                NONNULL
            }
            "method_reference" => {
                let object = named_children(node).into_iter().next();
                if let Some(object) = object.filter(|object| matches!(resolver.receiver(*object), Some(Receiver::Value(_)))) {
                    self.settle(store, object, NONNULL);
                }
                NONNULL
            }
            "switch_label" => {
                let holds_null = |label: Node| named_children(label).into_iter().any(|part| part.kind() == "null_literal" || named_children(part).into_iter().any(|inner| inner.kind() == "null_literal"));
                let switch = std::iter::successors(node.parent(), |parent| parent.parent()).find(|parent| matches!(parent.kind(), "switch_expression" | "switch_statement"));
                let Some(switch) = switch else { return NONNULL };
                let labels = switch.child_by_field_name("body").map(named_children).unwrap_or_default().into_iter().flat_map(|case| children(case).into_iter().filter(|part| part.kind() == "switch_label").collect::<Vec<_>>());
                let mut labels = labels;
                if labels.any(holds_null) && !holds_null(node) {
                    if let Some(condition) = switch.child_by_field_name("condition") {
                        self.settle(store, condition, NONNULL);
                    }
                }
                NONNULL
            }
            "parenthesized_expression" => self.value(unwrap(node)),
            "cast_expression" => {
                let primitive = node.child_by_field_name("type").is_some_and(|kind| matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type"));
                match node.child_by_field_name("value") {
                    Some(value) if !primitive => self.value(value),
                    _ => NONNULL,
                }
            }
            "ternary_expression" => {
                let arms = [node.child_by_field_name("consequence"), node.child_by_field_name("alternative")];
                let known: Vec<u8> = arms.into_iter().flatten().filter_map(|arm| self.known(arm)).collect();
                let joined = self.path(format!("(result {}", node.id()));
                match read(store, joined) {
                    ABSENT => known.into_iter().reduce(least_upper).unwrap_or(NONNULL),
                    value => value,
                }
            }
            "switch_expression" => {
                let results = self.cfg.results.get(&node.id()).cloned().unwrap_or_default();
                let known: Vec<u8> = results.iter().filter_map(|result| self.known(*result)).collect();
                let joined = self.path(format!("(result {}", node.id()));
                match read(store, joined) {
                    ABSENT => known.into_iter().reduce(least_upper).unwrap_or(NONNULL),
                    value => value,
                }
            }
            "array_access" => {
                if let Some(array) = node.child_by_field_name("array") {
                    self.settle(store, array, NONNULL);
                }
                NONNULL
            }
            "lambda_expression" | "object_creation_expression" | "class_declaration" | "record_declaration" | "enum_declaration"
            | "interface_declaration" => {
                let known: Vec<(String, u8)> = self
                    .paths
                    .iter()
                    .filter(|(name, _)| !name.contains('('))
                    .map(|(name, path)| (name.clone(), read(store, *path)))
                    .filter(|(_, value)| *value != ABSENT)
                    .collect();
                self.inner.insert(node.id(), known);
                NONNULL
            }
            _ => NONNULL,
        }
    }

    fn call(&mut self, node: Node<'t>, store: &mut Store) -> u8 {
        let resolver = self.context.resolver;
        let found = resolver.resolve_call(node);
        let object = node.child_by_field_name("object");
        let fixed = match (&found, object) {
            (Some(call), _) => call.method.is_static,
            (None, Some(object)) => matches!(resolver.receiver(object), Some(Receiver::Static(_)) | None),
            (None, None) => true,
        };
        if let (false, Some(object)) = (fixed, object) {
            self.settle(store, object, NONNULL);
        }
        let Some(call) = found else { return NONNULL };
        let arguments = Self::arguments(node);
        for position in modelled(resolver, models::FAIL_IF_NULL_PARAMETERS, &call) {
            if let Some(argument) = arguments.get(position) {
                self.settle(store, *argument, NONNULL);
            }
        }
        if (map_method(resolver, &call, "put", 2) || map_method(resolver, &call, "putIfAbsent", 2)) && arguments.len() == 2 {
            let value = self.value(arguments[1]);
            if let Some(path) = self.map_path(node, arguments[0]) {
                write(store, path, value);
            }
        }
        if map_method(resolver, &call, "computeIfAbsent", 2) && arguments.len() == 2 {
            if let Some(path) = self.map_path(node, arguments[0]) {
                write(store, path, NONNULL);
            }
        }
        if map_method(resolver, &call, "remove", 1) && arguments.len() == 1 {
            let known = self.map_path(node, arguments[0]).map(|path| read(store, path)).filter(|value| *value != ABSENT);
            if let Some(path) = self.map_path(node, arguments[0]) {
                write(store, path, NULLABLE);
            }
            return known.unwrap_or(NULLABLE);
        }
        let depends = modelled(resolver, models::NULL_IMPLIES_NULL_PARAMETERS, &call);
        if !depends.is_empty() {
            let any = depends.iter().any(|position| arguments.get(*position).is_some_and(|argument| self.value(*argument) != NONNULL));
            return if any { self.known_or(store, node, NULLABLE) } else { NONNULL };
        }
        let loose = !annotated(&call.declaring);
        if has_model(resolver, models::NONNULL_RETURNS, &call, loose) {
            return NONNULL;
        }
        if nullable_model(resolver, &call, loose) || !loose && call.method.flags & flag::NULLABLE != 0 {
            return self.known_or(store, node, NULLABLE);
        }
        NONNULL
    }

    fn map_path(&mut self, call: Node, key: Node) -> Option<usize> {
        let key = match self.constant(key) {
            Some(key) => key,
            None => self.name_of(key)?,
        };
        let base = match call.child_by_field_name("object") {
            Some(object) => self.base(object)?,
            None => "this".to_string(),
        };
        Some(self.path(format!("{base}.get[{key}]")))
    }

    /// What a test tells each side: the store when it holds and when it does not.
    fn sides(&mut self, test: Node<'t>, store: &Store) -> (Store, Store) {
        let (mut holds, mut fails) = (store.clone(), store.clone());
        let resolver = self.context.resolver;
        match test.kind() {
            "binary_expression" => {
                let operator = test.child_by_field_name("operator").map(|operator| operator.kind());
                let (Some(left), Some(right)) = (test.child_by_field_name("left"), test.child_by_field_name("right")) else { return (holds, fails) };
                if !matches!(operator, Some("==" | "!=")) {
                    return (holds, fails);
                }
                let (left_value, right_value) = (self.value(left), self.value(right));
                let (same, other) = if operator == Some("==") { (&mut holds, &mut fails) } else { (&mut fails, &mut holds) };
                let unequal = |value: u8| if value == NULL { NONNULL } else { NULLABLE };
                for (side, own, opposite) in [(left, left_value, right_value), (right, right_value, left_value)] {
                    let side = match unwrap(side) {
                        assigned if assigned.kind() == "assignment_expression" => assigned.child_by_field_name("left").unwrap_or(assigned),
                        plain => plain,
                    };
                    if let Some(path) = self.path_of(side) {
                        write(same, path, greatest_lower(left_value, right_value));
                        write(other, path, greatest_lower(own, unequal(opposite)));
                    }
                }
            }
            "instanceof_expression" => {
                if let Some(left) = test.child_by_field_name("left") {
                    self.settle(&mut holds, left, NONNULL);
                }
            }
            "method_invocation" => {
                let Some(call) = resolver.resolve_call(test) else { return (holds, fails) };
                let arguments = Self::arguments(test);
                for position in modelled(resolver, models::NULL_IMPLIES_TRUE_PARAMETERS, &call) {
                    if let Some(argument) = arguments.get(position) {
                        self.settle(&mut fails, *argument, NONNULL);
                    }
                }
                for position in modelled(resolver, models::NULL_IMPLIES_FALSE_PARAMETERS, &call) {
                    if let Some(argument) = arguments.get(position) {
                        self.settle(&mut holds, *argument, NONNULL);
                    }
                }
                if map_method(resolver, &call, "containsKey", 1) && arguments.len() == 1 {
                    if let Some(path) = self.map_path(test, arguments[0]) {
                        write(&mut holds, path, NONNULL);
                    }
                }
            }
            _ => {}
        }
        (holds, fails)
    }

    /// The exception types a step can throw, as the Checker Framework's flow graph has them: declared
    /// exceptions and the unchecked roots for a call, a null pointer exception for a dereference.
    fn thrown(&self, node: Node) -> Vec<String> {
        let resolver = self.context.resolver;
        let unchecked = || vec!["java.lang.RuntimeException".to_string(), "java.lang.Error".to_string()];
        let null_pointer = "java.lang.NullPointerException".to_string();
        match node.kind() {
            "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" => match resolver.call_formals(node) {
                Some((call, _)) => {
                    let mut all = call.method.throws.clone();
                    all.extend(unchecked());
                    all
                }
                None => unchecked(),
            },
            "field_access" if !self.fixed(node, self.field(node)) => vec![null_pointer],
            "array_access" => vec![null_pointer, "java.lang.ArrayIndexOutOfBoundsException".to_string()],
            "cast_expression" => vec!["java.lang.ClassCastException".to_string()],
            "throw_statement" => {
                let value = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"));
                let kind = value.and_then(|value| resolver.type_of(value)).map(|kind| kind.name());
                vec![kind.unwrap_or_else(|| "java.lang.Throwable".to_string())]
            }
            _ => Vec::new(),
        }
    }

    /// The handler blocks an exception of one of these types can reach: in each enclosing `try`, a handler
    /// that surely catches it ends the search, one that may catch it does not.
    fn landings(&self, frames: &[Vec<cfg::Catch<'t>>], thrown: &[String]) -> Vec<usize> {
        let resolver = self.context.resolver;
        let mut found = Vec::new();
        for exception in thrown {
            'frames: for frame in frames {
                for handler in frame {
                    if handler.types.is_empty() {
                        found.push(handler.block);
                        break 'frames;
                    }
                    for written in &handler.types {
                        let Some(caught) = resolver.type_node(*written).map(|kind| kind.name()) else {
                            found.push(handler.block);
                            continue;
                        };
                        if resolver.index.is_subtype(exception, &caught) {
                            found.push(handler.block);
                            break 'frames;
                        }
                        if resolver.index.is_subtype(&caught, exception) {
                            found.push(handler.block);
                        }
                    }
                }
            }
        }
        found.sort_unstable();
        found.dedup();
        found
    }

    fn run(&mut self, start: Store) -> Vec<Option<Store>> {
        let count = self.cfg.blocks.len();
        let mut inputs: Vec<Option<Store>> = vec![None; count];
        inputs[0] = Some(start);
        let mut queued = vec![false; count];
        let mut queue = VecDeque::from([0usize]);
        queued[0] = true;
        let mut rounds = 0usize;
        while let Some(block) = queue.pop_front() {
            queued[block] = false;
            rounds += 1;
            if rounds > 200 * count + 1000 {
                break;
            }
            let Some(mut store) = inputs[block].clone() else { continue };
            self.copy = self.cfg.blocks[block].copy;
            let mut reach = |inputs: &mut Vec<Option<Store>>, to: usize, store: &Store| {
                if join(&mut inputs[to], store) && !queued[to] {
                    queued[to] = true;
                    queue.push_back(to);
                }
            };
            let catches = self.cfg.blocks[block].catches.clone();
            for position in 0..self.cfg.blocks[block].steps.len() {
                let node = self.cfg.blocks[block].steps[position];
                // An exception leaves with what was known just before the step that throws it.
                if !catches.is_empty() {
                    for handler in self.landings(&catches, &self.thrown(node)) {
                        reach(&mut inputs, handler, &store);
                    }
                }
                let value = self.step(node, &mut store);
                self.values.insert((node.id(), self.copy), value);
                if self.unboxes(node) {
                    self.settle(&mut store, node, NONNULL);
                }
                if let Some(owner) = self.owner(node) {
                    let path = self.path(format!("(result {owner}"));
                    write(&mut store, path, value);
                }
            }
            if matches!(self.cfg.blocks[block].exit, Exit::End) {
                let last = catches.iter().flatten().find(|handler| handler.types.is_empty());
                if let Some(last) = last {
                    reach(&mut inputs, last.block, &store);
                }
            }
            match &self.cfg.blocks[block].exit {
                Exit::End => {}
                Exit::Jump(to) => reach(&mut inputs, *to, &store),
                Exit::Any(all) => {
                    for to in all.clone() {
                        reach(&mut inputs, to, &store);
                    }
                }
                Exit::Branch(test, holds, fails) => {
                    let (test, holds, fails) = (*test, *holds, *fails);
                    if self.unboxed_test(test) {
                        self.settle(&mut store, test, NONNULL);
                    }
                    let (when_holds, when_fails) = self.sides(test, &store);
                    reach(&mut inputs, holds, &when_holds);
                    reach(&mut inputs, fails, &when_fails);
                }
            }
        }
        inputs
    }

    fn may_be_null(&mut self, expression: Node) -> bool {
        let expression = strip(expression);
        let resolver = self.context.resolver;
        let possible = match expression.kind() {
            "null_literal" => return true,
            "identifier" => match resolver.binding(expression, self.text(expression)) {
                Some(Binding::Local(_)) => self.component(expression).is_none_or(|nullable| nullable),
                Some(Binding::Field(_, class, field)) => field.constant.is_none() && Self::nullable_field(class, field),
                None => false,
            },
            "field_access" => self.field(expression).is_some_and(|(class, field, _)| field.constant.is_none() && Self::nullable_field(class, field)),
            "method_invocation" => match resolver.resolve_call(expression) {
                Some(call) => {
                    let loose = !annotated(&call.declaring);
                    if !loose && call.method.flags & flag::NULLABLE != 0 {
                        !has_model(resolver, models::NONNULL_RETURNS, &call, loose)
                    } else {
                        nullable_model(resolver, &call, loose) || !modelled(resolver, models::NULL_IMPLIES_NULL_PARAMETERS, &call).is_empty()
                    }
                }
                None => false,
            },
            "ternary_expression" | "switch_expression" => true,
            "assignment_expression" => expression.child_by_field_name("operator").is_some_and(|operator| operator.kind() == "="),
            _ => false,
        };
        possible && matches!(self.known(expression), Some(NULL | NULLABLE))
    }
}

fn arity(written: &str) -> usize {
    if written.is_empty() { 0 } else { written.split(',').count() }
}

fn fits(resolver: &crate::java::types::scope::Resolver, row: &models::Model, call: &Call, inherited: bool) -> bool {
    let same_types = || {
        row.2.split(',').zip(&call.method.parameters).all(|(written, kind)| {
            let written = written.trim();
            !written.contains('.') || written.ends_with("[]") || written.ends_with("...") || written == kind.name()
        })
    };
    row.1 == call.method.name
        && arity(row.2) == call.method.parameters.len()
        && (row.2.is_empty() || same_types())
        && (row.0 == call.declaring || inherited && resolver.index.is_subtype(&call.declaring, row.0) || resolver.index.is_subtype(row.0, &call.declaring) && inherited)
}

/// The parameter positions a table names for the called method.
fn modelled(resolver: &crate::java::types::scope::Resolver, table: &[models::Model], call: &Call) -> Vec<usize> {
    table.iter().filter(|row| fits(resolver, row, call, true)).map(|row| row.3).collect()
}

fn has_model(resolver: &crate::java::types::scope::Resolver, table: &[models::Model], call: &Call, inherited: bool) -> bool {
    table.iter().any(|row| fits(resolver, row, call, inherited))
}

fn nullable_model(resolver: &crate::java::types::scope::Resolver, call: &Call, inherited: bool) -> bool {
    has_model(resolver, models::ALWAYS_NULLABLE_RETURNS, call, inherited) || has_model(resolver, models::NULLABLE_RETURNS_JSPECIFY_MODE_DISABLED, call, inherited)
}

fn map_method(resolver: &crate::java::types::scope::Resolver, call: &Call, name: &str, parameters: usize) -> bool {
    call.method.name == name
        && call.method.parameters.len() == parameters
        && (call.declaring == "java.util.Map" || resolver.index.is_subtype(&call.declaring, "java.util.Map"))
}

/// Guava's `checkState` and `checkArgument`: they throw unless their first argument holds.
fn guard(context: &Context, call: Node) -> bool {
    let name = call.child_by_field_name("name").map(|name| context.text(name));
    matches!(name, Some("checkState" | "checkArgument"))
        && context.resolver.resolve_call(call).is_some_and(|found| found.declaring == "com.google.common.base.Preconditions")
}

/// The body to analyse for a node that starts one, and where its parameters are.
fn unit<'t>(node: Node<'t>) -> Option<(Node<'t>, Option<Node<'t>>)> {
    match node.kind() {
        "method_declaration" | "constructor_declaration" | "compact_constructor_declaration" | "lambda_expression" => {
            Some((node.child_by_field_name("body")?, node.child_by_field_name("parameters")))
        }
        "enum_constant" => Some((node.child_by_field_name("arguments")?, None)),
                "static_initializer" => Some((children(node).into_iter().find(|part| part.kind() == "block")?, None)),
        "block" if parent(node).is_some_and(|above| above.kind() == "class_body") => Some((node, None)),
        "variable_declarator" if parent(node).is_some_and(|above| matches!(above.kind(), "field_declaration" | "constant_declaration")) => {
            Some((node.child_by_field_name("value")?, None))
        }
        _ => None,
    }
}

/// The node whose recorded facts a body starts from: the lambda itself, or the class inside a method that holds it.
fn surroundings(node: Node) -> Option<usize> {
    if node.kind() == "lambda_expression" {
        return Some(node.id());
    }
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "class_body" => match parent(at) {
                Some(above) if above.kind() == "object_creation_expression" => return Some(above.id()),
                Some(above) if parent(above).is_some_and(|outer| !matches!(outer.kind(), "class_body" | "program" | "interface_body" | "enum_body_declarations")) => {
                    return Some(above.id());
                }
                _ => return None,
            },
            "interface_body" | "enum_body" | "annotation_type_body" => return None,
            _ => current = parent(at),
        }
    }
    None
}

/// Whether the nearest `@NullMarked` or `@NullUnmarked` around a node is the second: such code is not checked.
fn unmarked(context: &Context, node: Node) -> bool {
    let mut current = Some(node);
    while let Some(at) = current {
        let names = crate::java::helpers::annotation_names(context.file, at);
        let last = |name: &&str| name.rsplit('.').next().unwrap_or_default().to_string();
        if names.iter().any(|name| last(name) == "NullUnmarked") {
            return true;
        }
        if names.iter().any(|name| last(name) == "NullMarked") {
            return false;
        }
        current = parent(at);
    }
    false
}

pub fn null_away(context: &Context, root: Node) {
    if root.kind() != "program" {
        return;
    }
    let mut inner: HashMap<usize, Vec<(String, u8)>> = HashMap::new();
    let mut reported = std::collections::HashSet::new();
    walk(root, |node| {
        if node.kind() == "method_declaration" && !unmarked(context, node) {
            sites::overriding(context, node);
        }
        if matches!(node.kind(), "lambda_expression" | "method_reference") && !unmarked(context, node) {
            functional::standing_in(context, node);
        }
        let Some((body, parameters)) = unit(node) else { return };
        let unit_node = node;
        if unmarked(context, node) {
            return;
        }
        let cfg = cfg::build(context.file, body, &|call| guard(context, call));
        let owners = cfg.results.iter().flat_map(|(switch, results)| results.iter().map(|result| (result.id(), *switch))).collect();
        let mut flow = Flow { context, cfg, paths: HashMap::new(), values: HashMap::new(), copy: 0, locals: Default::default(), inner: HashMap::new(), owners };
        let mut start = Store::new();
        if let Some(known) = surroundings(node).and_then(|key| inner.get(&key)) {
            for (name, value) in known {
                if !name.contains('.') {
                    flow.locals.insert(name.clone());
                }
                let path = flow.path(name.clone());
                write(&mut start, path, *value);
            }
        }
        let parameters = match node.kind() {
            "compact_constructor_declaration" => parent(node).and_then(parent).and_then(|record| record.child_by_field_name("parameters")),
            _ => parameters,
        };
        // An implicitly typed lambda parameter takes what the functional interface's method says about it.
        let inherited: u64 = if node.kind() == "lambda_expression" {
            let target = context.resolver.lambda_target(node);
            let found = target.as_ref().and_then(|target| context.resolver.index.functional_method(&target.name()));
            found.filter(|(declaring, _)| annotated(&declaring.name)).map_or(0, |(_, method)| method.nullable_parameters)
        } else {
            0
        };
        let mut implicit = 0usize;
        for parameter in parameters.map(children).unwrap_or_default() {
            let (name, nullable) = match parameter.kind() {
                "identifier" => {
                    implicit += 1;
                    (Some(parameter), implicit <= 64 && inherited & (1 << (implicit - 1)) != 0)
                }
                "formal_parameter" | "spread_parameter" => {
                    let name = parameter.child_by_field_name("name").or_else(|| {
                        children(parameter).into_iter().find(|part| part.kind() == "variable_declarator").and_then(|part| part.child_by_field_name("name"))
                    });
                    (name, parameter.kind() == "formal_parameter" && crate::java::helpers::marked_nullable(context.file, parameter))
                }
                _ => (None, false),
            };
            if let Some(name) = name {
                let path = flow.local(name);
                write(&mut start, path, if nullable { NULLABLE } else { NONNULL });
            }
        }
        if let Some(parameters) = parameters.filter(|parameters| parameters.kind() == "identifier") {
            let path = flow.local(parameters);
            write(&mut start, path, if inherited & 1 != 0 { NULLABLE } else { NONNULL });
        }
        let inputs = flow.run(start);
        for block in 0..flow.cfg.blocks.len() {
            if inputs[block].is_none() {
                continue;
            }
            flow.copy = flow.cfg.blocks[block].copy;
            for position in 0..flow.cfg.blocks[block].steps.len() {
                let node = flow.cfg.blocks[block].steps[position];
                flow.sites(node, unit_node, &mut reported);
                if flow.unboxes(node) {
                    flow.unboxing(node, &mut reported);
                }
                let (object, mark) = match node.kind() {
                    "field_access" | "method_invocation" => (node.child_by_field_name("object"), "."),
                    "array_access" => (node.child_by_field_name("array"), "["),
                    "method_reference" => (named_children(node).into_iter().next(), "::"),
                    _ => continue,
                };
                let Some(object) = object else { continue };
                if !flow.may_be_null(object) || !reported.insert(node.id()) {
                    continue;
                }
                let sign = children(node).into_iter().find(|part| part.kind() == mark && part.start_byte() >= object.end_byte());
                let at = sign.filter(|_| mark != "::").map_or(node.start_byte(), |sign| sign.start_byte());
                context.report("NullAway", node, at, &format!("dereferenced expression '{}' is @Nullable", context.text(object)));
            }
        }
        for block in 0..flow.cfg.blocks.len() {
            if let (Some(_), Exit::Branch(test, _, _)) = (&inputs[block], &flow.cfg.blocks[block].exit) {
                let test = *test;
                flow.copy = flow.cfg.blocks[block].copy;
                if flow.unboxed_test(test) {
                    flow.unboxing_test(test, &mut reported);
                }
            }
        }
        flow.copy = 0;
        match unit_node.kind() {
            "variable_declarator" => flow.initialized(unit_node),
            "lambda_expression" => flow.lambda_value(unit_node),
            "enum_constant" => flow.sites(unit_node, unit_node, &mut reported),
            _ => {}
        }
        inner.extend(flow.inner);
    });
}
