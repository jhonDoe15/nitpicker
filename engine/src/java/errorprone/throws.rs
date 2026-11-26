//! What a block can throw, as Error Prone's `ScanThrownTypes` counts it, and the check that uses it.
use super::Context;
use super::doc::{Comment, Kind, parse};
use super::fixes::Fix;
use super::javadoc::comment_before;
use crate::engine::source::{children, named_children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::model::Type;
use std::collections::HashMap;
use tree_sitter::Node;

const TYPES: &[&str] = &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

struct Thrown<'c, 'a> {
    context: &'c Context<'a>,
    frames: Vec<Vec<String>>,
    /// By catch clause: what its variable can hold.
    held: HashMap<usize, Vec<String>>,
    /// A call or a type could not be worked out.
    unknown: bool,
}

impl Thrown<'_, '_> {
    fn add(&mut self, name: String) {
        let top = self.frames.last_mut().expect("a frame");
        if !top.contains(&name) {
            top.push(name);
        }
    }
    fn add_type(&mut self, kind: Option<Type>) {
        match kind {
            Some(Type::Class(name, _)) if name != "?" => self.add(name),
            _ => self.unknown = true,
        }
    }
    fn add_call(&mut self, call: Node) {
        match self.context.resolver.call_throws(call) {
            Some(listed) => listed.into_iter().for_each(|kind| self.add_type(Some(kind))),
            None => self.unknown = true,
        }
    }
    fn subtype(&self, name: &str, of: &str) -> bool {
        self.context.resolver.index.is_subtype(name, of)
    }
    fn catch_types(&self, clause: Node) -> Vec<Option<Type>> {
        let parameter = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter");
        let kinds = parameter.into_iter().flat_map(children).filter(|part| part.kind() == "catch_type").flat_map(named_children);
        kinds.map(|kind| self.context.resolver.type_node(kind)).collect()
    }
    fn catch_name(&self, clause: Node) -> Option<&str> {
        let parameter = children(clause).into_iter().find(|part| part.kind() == "catch_formal_parameter")?;
        parameter.child_by_field_name("name").map(|name| self.context.text(name))
    }
    fn resource(&mut self, resource: Node) {
        let resolver = self.context.resolver;
        let kind = match resource.child_by_field_name("type") {
            Some(written) if self.context.text(written) != "var" => resolver.type_node(written),
            Some(_) => resource.child_by_field_name("value").and_then(|value| resolver.type_of(value)),
            None => resource.named_child(0).and_then(|value| resolver.type_of(value)),
        };
        let Some(Type::Class(class, _)) = kind else {
            self.unknown = true;
            return;
        };
        if !resolver.index.complete(&class) {
            self.unknown = true;
        }
        if !self.subtype(&class, "java.lang.AutoCloseable") {
            return;
        }
        let closes = resolver.index.methods(&class, "close");
        match closes.iter().find(|(_, method)| method.parameters.is_empty() && method.returns == Type::Primitive("void")) {
            Some((_, method)) => method.throws.clone().into_iter().for_each(|thrown| self.add_type(Some(thrown.erased()))),
            None => self.unknown = true,
        }
    }
    fn attempt(&mut self, node: Node) {
        self.frames.push(Vec::new());
        if let Some(resources) = node.child_by_field_name("resources") {
            for resource in named_children(resources) {
                self.resource(resource);
            }
            self.scan(resources);
        }
        if let Some(body) = node.child_by_field_name("body") {
            self.scan(body);
        }
        let clauses: Vec<Node> = children(node).into_iter().filter(|part| part.kind() == "catch_clause").collect();
        for clause in &clauses {
            let mut caught = Vec::new();
            let mut held = Vec::new();
            for member in self.catch_types(*clause) {
                let Some(Type::Class(member, _)) = member else {
                    self.unknown = true;
                    continue;
                };
                for thrown in self.frames.last().expect("a frame") {
                    if self.subtype(thrown, &member) {
                        caught.push(thrown.clone());
                        held.push(thrown.clone());
                    }
                    if self.subtype(&member, thrown) {
                        held.push(member.clone());
                    }
                }
            }
            self.frames.last_mut().expect("a frame").retain(|thrown| !caught.contains(thrown));
            self.held.insert(clause.id(), held);
        }
        for clause in clauses {
            if let Some(body) = clause.child_by_field_name("body") {
                self.scan(body);
            }
        }
        if let Some(last) = children(node).into_iter().find(|part| part.kind() == "finally_clause") {
            self.scan(last);
        }
        let inner = self.frames.pop().expect("a frame");
        inner.into_iter().for_each(|name| self.add(name));
    }
    fn throw(&mut self, node: Node) {
        let Some(thrown) = node.named_child(0) else { return };
        if thrown.kind() == "identifier" {
            let name = self.context.text(thrown);
            let mut current = parent(node);
            while let Some(at) = current {
                if at.kind() == "catch_clause" && self.catch_name(at) == Some(name) {
                    let held = self.held.get(&at.id()).cloned().unwrap_or_default();
                    if held.is_empty() {
                        self.catch_types(at).into_iter().for_each(|kind| self.add_type(kind));
                    } else {
                        held.into_iter().for_each(|name| self.add(name));
                    }
                    return;
                }
                current = parent(at);
            }
        }
        let kind = self.context.resolver.type_of(thrown).map(|kind| kind.erased());
        self.add_type(kind);
    }
    /// The constructor javac makes for an anonymous class throws what the fields and blocks of its body throw.
    fn initializers(&mut self, creation: Node) {
        let Some(body) = children(creation).into_iter().find(|part| part.kind() == "class_body") else { return };
        for member in children(body) {
            let run = match member.kind() {
                "block" => true,
                "field_declaration" => !has_modifier(member, "static"),
                _ => false,
            };
            if run {
                for part in children(member) {
                    self.scan(part);
                }
            }
        }
    }
    fn scan(&mut self, node: Node) {
        match node.kind() {
            "lambda_expression" | "class_body" | "method_declaration" => return,
            kind if TYPES.contains(&kind) => return,
            "method_invocation" | "explicit_constructor_invocation" => self.add_call(node),
            "object_creation_expression" => {
                self.add_call(node);
                self.initializers(node);
            }
            "try_statement" | "try_with_resources_statement" => return self.attempt(node),
            "throw_statement" => self.throw(node),
            _ => {}
        }
        for child in children(node) {
            self.scan(child);
        }
    }
}

/// The class names a tree can throw; `None` when a call or a type in it could not be worked out.
pub fn thrown_by(context: &Context, trees: &[Node]) -> Option<Vec<String>> {
    let mut all = Vec::new();
    for tree in trees {
        let mut scanner = Thrown { context, frames: vec![Vec::new()], held: HashMap::new(), unknown: false };
        scanner.scan(*tree);
        if scanner.unknown {
            return None;
        }
        all.append(&mut scanner.frames[0]);
    }
    Some(all)
}

/// What the resources and the block of a `try` can throw before any of its `catch` clauses sees it.
pub fn thrown_in_try(context: &Context, attempt: Node) -> Option<Vec<String>> {
    let mut scanner = Thrown { context, frames: vec![Vec::new()], held: HashMap::new(), unknown: false };
    if let Some(resources) = attempt.child_by_field_name("resources") {
        for resource in named_children(resources) {
            scanner.resource(resource);
        }
        scanner.scan(resources);
    }
    if let Some(body) = attempt.child_by_field_name("body") {
        scanner.scan(body);
    }
    (!scanner.unknown).then(|| scanner.frames.swap_remove(0))
}

/// `Some(true)` for a checked exception; `None` when the class is not fully known.
fn checked(context: &Context, name: &str) -> Option<bool> {
    let index = context.resolver.index;
    if !index.complete(name) || !index.has(name) {
        return None;
    }
    let under = |of: &str| index.is_subtype(name, of);
    Some(under("java.lang.Throwable") && !under("java.lang.RuntimeException") && !under("java.lang.Error"))
}

pub fn can_be_overridden(method: Node) -> bool {
    if method.kind() != "method_declaration" || ["static", "private", "final"].iter().any(|word| has_modifier(method, word)) {
        return false;
    }
    let Some(mut body) = parent(method) else { return true };
    if body.kind() == "enum_body_declarations" {
        let Some(enum_body) = parent(body) else { return true };
        body = enum_body;
    }
    let Some(owner) = parent(body) else { return true };
    match owner.kind() {
        "class_declaration" => !has_modifier(owner, "final"),
        "record_declaration" | "object_creation_expression" | "enum_constant" => false,
        "enum_declaration" => children(body).into_iter().any(|part| part.kind() == "enum_constant" && part.child_by_field_name("body").is_some()),
        _ => true,
    }
}

fn field_values<'t>(method: Node<'t>) -> Vec<Node<'t>> {
    let Some(body) = parent(method) else { return Vec::new() };
    if matches!(body.kind(), "interface_body" | "annotation_type_body") {
        return Vec::new();
    }
    let mut values = Vec::new();
    for member in children(body) {
        if member.kind() == "field_declaration" && !has_modifier(member, "static") {
            values.extend(children(member).into_iter().filter(|part| part.kind() == "variable_declarator").filter_map(|part| part.child_by_field_name("value")));
        }
    }
    values
}

pub fn checked_exception_not_thrown(context: &Context, node: Node) {
    if !matches!(node.kind(), "method_declaration" | "constructor_declaration") {
        return;
    }
    let Some(clause) = children(node).into_iter().find(|part| part.kind() == "throws") else { return };
    let Some(body) = node.child_by_field_name("body") else { return };
    if has_modifier(node, "abstract") || can_be_overridden(node) {
        return;
    }
    let mut trees = vec![body];
    if !has_modifier(node, "static") {
        trees.extend(field_values(node));
    }
    let Some(thrown) = thrown_by(context, &trees) else { return };
    let mut real = Vec::new();
    for name in thrown {
        match checked(context, &name) {
            Some(true) => real.push(name),
            Some(false) => {}
            None => return,
        }
    }
    let mut unthrown = Vec::new();
    for listed in named_children(clause) {
        let Some(Type::Class(name, _)) = context.resolver.type_node(listed) else { return };
        match checked(context, &name) {
            Some(true) if !real.iter().any(|thrown| context.resolver.index.is_subtype(thrown, &name)) => unthrown.push(listed),
            Some(_) => {}
            None => return,
        }
    }
    let Some(first) = unthrown.first() else { return };
    let at = children(*first).into_iter().rfind(|part| part.kind() == ".").map_or(first.start_byte(), |dot| dot.start_byte());
    let mut names: Vec<&str> = unthrown.iter().map(|listed| context.text(*listed)).collect();
    names.sort_unstable();
    let text = format!(
        "This method does not throw checked exceptions ({}) despite claiming to. This may cause consumers of the API to incorrectly \
         attempt to handle, or propagate, this exception.",
        names.join(", ")
    );
    let kept: Vec<Node> = named_children(clause).into_iter().filter(|listed| !listed.kind().ends_with("comment") && !unthrown.contains(listed)).collect();
    let fix = javadoc_fix(context, node, &kept).merged(throws_fix(context, clause, &kept));
    context.report_fixed("CheckedExceptionNotThrown", node, at, &text, &[fix]);
}

/// The `throws` clause without the exceptions that cannot be thrown.
fn throws_fix(context: &Context, clause: Node, kept: &[Node]) -> Fix {
    let Some(last) = named_children(clause).into_iter().next_back() else { return Fix::new() };
    let Some(first) = kept.first() else {
        let keyword = children(clause).into_iter().find(|part| part.kind() == "throws").map_or(clause.start_byte(), |word| word.start_byte());
        return Fix::replace(keyword, last.end_byte(), "");
    };
    let written: Vec<&str> = kept.iter().map(|listed| context.text(*listed)).collect();
    Fix::replace(first.start_byte(), last.end_byte(), written.join(", "))
}

/// Removes the `@throws` tags of the doc comment that name an exception the method cannot throw.
fn javadoc_fix(context: &Context, method: Node, kept: &[Node]) -> Fix {
    let mut fix = Fix::new();
    let Some(written) = comment_before(context, method) else { return fix };
    let Some(comment) = Comment::of(context.text(written), written.start_byte()) else { return fix };
    let thrown: Vec<String> = kept.iter().filter_map(|listed| context.resolver.type_node(*listed)).map(|kind| kind.name()).collect();
    for tag in parse(&comment).tags.iter().filter(|tag| tag.kind == Kind::Block && matches!(tag.name.as_str(), "throws" | "exception")) {
        let Some(reference) = tag.children.first().filter(|child| child.kind == Kind::Reference) else { continue };
        let Some(name) = context.resolver.class_name(method, reference.name.trim()).filter(|name| context.resolver.index.has(name)) else { continue };
        if thrown.contains(&name) {
            continue;
        }
        if let (Some(start), Some(end)) = (comment.source_pos(tag.pos), comment.source_pos(tag.end_position())) {
            fix = fix.delete(start, end);
        }
    }
    fix
}
