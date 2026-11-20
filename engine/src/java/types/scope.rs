//! Name resolution inside one file: package, imports, enclosing types, type parameters.
use crate::java::fields::Fields;
use super::index::TypeIndex;
use super::model::{ClassInfo, Field, Method, OBJECT, Type};
use std::cell::{Cell, RefCell};
use crate::engine::source::{SourceFile, children};
use std::collections::HashMap;
use tree_sitter::Node;

pub const TYPE_DECLARATIONS: &[&str] = &[
    "class_declaration",
    "interface_declaration",
    "enum_declaration",
    "record_declaration",
    "annotation_type_declaration",
];

#[derive(Default)]
pub struct FileScope {
    pub package: String,
    pub single: HashMap<String, String>,
    pub on_demand: Vec<String>,
    pub static_single: HashMap<String, Vec<String>>,
    pub static_on_demand: Vec<String>,
    /// Every class in the file by node id: members, local classes (`Outer.1Local`) and anonymous ones (`Outer.1`).
    pub names: HashMap<usize, String>,
}

fn name_text<'f>(file: &'f SourceFile, node: Node) -> &'f str {
    children(node)
        .into_iter()
        .find(|child| matches!(child.kind(), "scoped_identifier" | "identifier"))
        .map(|child| file.text_of(child))
        .unwrap_or_default()
}

impl FileScope {
    pub fn of(file: &SourceFile) -> FileScope {
        let mut scope = FileScope::default();
        for node in children(file.tree.root_node()) {
            match node.kind() {
                "package_declaration" => scope.package = name_text(file, node).to_string(),
                "import_declaration" => {
                    let parts = children(node);
                    let is_static = parts.iter().any(|part| part.kind() == "static");
                    let star = parts.iter().any(|part| part.kind() == "asterisk");
                    let name = name_text(file, node).to_string();
                    let (owner, last) = name.rsplit_once('.').unwrap_or(("", &name));
                    match (is_static, star) {
                        (false, false) => {
                            scope.single.insert(last.to_string(), name.clone());
                        }
                        (false, true) => scope.on_demand.push(name),
                        (true, false) => {
                            scope.static_single.entry(last.to_string()).or_default().push(owner.to_string());
                        }
                        (true, true) => scope.static_on_demand.push(name),
                    }
                }
                _ => {}
            }
        }
        let package = scope.package.clone();
        name_classes(file, file.tree.root_node(), &package, true, &mut HashMap::new(), &mut scope.names);
        scope
    }
}

const MEMBER_HOLDERS: &[&str] =
    &["program", "class_body", "interface_body", "enum_body", "enum_body_declarations", "annotation_type_body"];

fn name_classes(
    file: &SourceFile,
    node: Node,
    enclosing: &str,
    top: bool,
    counters: &mut HashMap<(String, String), u32>,
    names: &mut HashMap<usize, String>,
) {
    fn local(counters: &mut HashMap<(String, String), u32>, enclosing: &str, simple: &str) -> String {
        let count = counters.entry((enclosing.to_string(), simple.to_string())).or_insert(0);
        *count += 1;
        format!("{enclosing}.{count}{simple}")
    }
    for child in children(node) {
        let kind = child.kind();
        if TYPE_DECLARATIONS.contains(&kind) {
            let simple = child.field("name").map(|name| file.text_of(name)).unwrap_or_default();
            let name = if !MEMBER_HOLDERS.contains(&node.kind()) {
                local(counters, enclosing, simple)
            } else if top && enclosing.is_empty() {
                simple.to_string()
            } else {
                format!("{enclosing}.{simple}")
            };
            names.insert(child.id(), name.clone());
            name_classes(file, child, &name, false, counters, names);
        } else if matches!(kind, "object_creation_expression" | "enum_constant")
            && children(child).iter().any(|part| part.kind() == "class_body")
        {
            let name = local(counters, enclosing, "");
            names.insert(child.id(), name.clone());
            for part in children(child) {
                if part.kind() == "class_body" {
                    name_classes(file, part, &name, false, counters, names);
                } else {
                    name_classes(file, part, enclosing, top, counters, names);
                }
            }
        } else {
            name_classes(file, child, enclosing, top, counters, names);
        }
    }
}

pub fn declared_name(_file: &SourceFile, scope: &FileScope, declaration: Node) -> Option<String> {
    scope.names.get(&declaration.id()).cloned()
}

/// The class a node belongs to when the walk up from `inner` reaches `node`: anonymous classes only count from inside their body.
pub fn class_at(scope: &FileScope, node: Node, inner: Node) -> Option<String> {
    let name = scope.names.get(&node.id())?;
    (TYPE_DECLARATIONS.contains(&node.kind()) || inner.kind() == "class_body").then(|| name.clone())
}

/// Enclosing classes, innermost first.
pub fn enclosing_types(scope: &FileScope, at: Node) -> Vec<String> {
    let mut found = Vec::new();
    let mut inner = at;
    let mut current = Some(at);
    while let Some(node) = current {
        found.extend(class_at(scope, node, inner));
        inner = node;
        current = crate::engine::source::parent(node);
    }
    found
}

pub fn enclosing_type(_file: &SourceFile, scope: &FileScope, at: Node) -> Option<String> {
    enclosing_types(scope, at).into_iter().next()
}

pub fn type_parameter<'t>(file: &SourceFile, at: Node<'t>, name: &str) -> Option<Node<'t>> {
    let mut current = Some(at);
    while let Some(node) = current {
        // Only declarations carry type parameters: the bodies and blocks in between are not searched.
        let list = node.kind().ends_with("_declaration").then(|| {
            node.field("type_parameters").or_else(|| children(node).into_iter().find(|child| child.kind() == "type_parameters"))
        });
        if let Some(list) = list.flatten() {
            for parameter in children(list).into_iter().filter(|child| child.kind() == "type_parameter") {
                let named = children(parameter)
                    .into_iter()
                    .find(|child| matches!(child.kind(), "type_identifier" | "identifier"))
                    .is_some_and(|child| file.text_of(child) == name);
                if named {
                    return Some(parameter);
                }
            }
        }
        current = crate::engine::source::parent(node);
    }
    None
}

pub struct Resolver<'a> {
    pub index: &'a TypeIndex,
    pub file: &'a SourceFile,
    pub scope: &'a FileScope,
    pub(super) cache: RefCell<HashMap<usize, Option<Type>>>,
    pub(super) depth: Cell<u32>,
    /// Expressions whose context is being worked out, so that work does not ask for them again.
    pub(super) busy: RefCell<std::collections::HashSet<usize>>,
    /// Counts answers given without a part that was still being worked out; such answers are not kept.
    pub(super) skipped: Cell<u64>,
    /// Types worked out since the outermost question began; past a limit the question is given up.
    pub(super) work: Cell<u32>,
    /// Calls whose method is being picked right now: asking again from inside would repeat all of that work.
    pub(super) resolving: RefCell<HashMap<usize, u8>>,
    pub(super) mapping: RefCell<HashMap<usize, u8>>,
    pub(super) loose: RefCell<HashMap<usize, Option<Type>>>,
    /// What each type node stands for, asked many times by the rules.
    written: RefCell<HashMap<(usize, bool), Option<Type>>>,
    simples: RefCell<HashMap<(usize, String), Option<String>>>,
    pub(super) locals: RefCell<HashMap<usize, std::rc::Rc<Vec<(String, usize, u32, u32)>>>>,
    /// The pattern variables declared in a method, lambda or class body: where each starts, its name and its type.
    pub(super) patterns: RefCell<HashMap<usize, std::rc::Rc<Vec<(usize, String, Option<Type>)>>>>,
    /// The method each call resolved to when asked from the outside: several rules ask about the same call.
    pub(super) calls: RefCell<HashMap<usize, Option<std::rc::Rc<super::expr::Call>>>>,
}

fn written_names<'f>(file: &'f SourceFile, list: Option<Node>) -> Vec<&'f str> {
    list.map(children)
        .unwrap_or_default()
        .into_iter()
        .filter(|child| child.kind() == "type_parameter")
        .filter_map(|parameter| children(parameter).into_iter().find(|c| matches!(c.kind(), "type_identifier" | "identifier")))
        .map(|name| file.text_of(name))
        .collect()
}

impl<'a> Resolver<'a> {
    pub fn new(index: &'a TypeIndex, file: &'a SourceFile, scope: &'a FileScope) -> Resolver<'a> {
        Resolver { index, file, scope, cache: RefCell::new(HashMap::new()), depth: Cell::new(0), busy: RefCell::new(std::collections::HashSet::new()), skipped: Cell::new(0), work: Cell::new(0), resolving: RefCell::new(HashMap::new()), loose: RefCell::new(HashMap::new()), written: RefCell::new(HashMap::new()), locals: RefCell::new(HashMap::new()), mapping: RefCell::new(HashMap::new()), patterns: RefCell::new(HashMap::new()), calls: RefCell::new(HashMap::new()), simples: RefCell::new(HashMap::new()) }
    }

    /// Where the lookup of a simple name starts to matter: every node below the same place sees the same classes.
    fn lookup_place(at: Node) -> usize {
        let mut inner = at;
        let mut current = Some(at);
        while let Some(node) = current {
            let holds = matches!(node.kind(), "block" | "constructor_body" | "switch_block_statement_group" | "program");
            let around = crate::engine::source::parent(node);
            let member = around.is_some_and(|owner| {
                TYPE_DECLARATIONS.contains(&owner.kind())
                    && (owner.field("body") == Some(node) || (owner.kind() == "record_declaration" && owner.field("parameters") == Some(node)))
            });
            if (holds || member || node.kind() == "class_body") && node.id() != at.id() {
                return node.id();
            }
            inner = node;
            current = around;
        }
        inner.id()
    }

    /// The class a simple name stands for at a place. Every place directly inside the same block or class body
    /// gets the same answer, so it is kept per block or body.
    fn simple(&self, at: Node, name: &str) -> Option<String> {
        let key = (Self::lookup_place(at), name.to_string());
        if let Some(known) = self.simples.borrow().get(&key) {
            return known.clone();
        }
        let found = self.read_simple(at, name);
        self.simples.borrow_mut().insert(key, found.clone());
        found
    }

    fn read_simple(&self, at: Node, name: &str) -> Option<String> {
        let mut inner = at;
        let mut current = Some(at);
        while let Some(node) = current {
            if matches!(node.kind(), "block" | "constructor_body" | "switch_block_statement_group") {
                let local = children(node).into_iter().find(|child| {
                    TYPE_DECLARATIONS.contains(&child.kind())
                        && child.field("name").is_some_and(|written| self.file.text_of(written) == name)
                });
                if let Some(found) = local.and_then(|local| self.scope.names.get(&local.id())) {
                    return Some(found.clone());
                }
            }
            // Names in the header of a class are looked up around it: its members and what it inherits are not in scope there.
            // The components of a record are the exception: they see the members.
            let inside = |field: &'static str| node.field(field) == Some(inner);
            let header = TYPE_DECLARATIONS.contains(&node.kind()) && !inside("body") && !(node.kind() == "record_declaration" && inside("parameters"));
            if let Some(owner) = class_at(self.scope, node, inner).filter(|_| !header) {
                for ancestor in self.index.lineage(&owner).iter() {
                    let nested = format!("{ancestor}.{name}");
                    let hidden = *ancestor != owner && self.index.get(&nested).is_some_and(|info| info.flags & super::model::flag::PRIVATE != 0);
                    if self.index.has(&nested) && !hidden {
                        return Some(nested);
                    }
                }
                if TYPE_DECLARATIONS.contains(&node.kind())
                    && node.field("name").is_some_and(|written| self.file.text_of(written) == name)
                {
                    return Some(owner);
                }
            }
            inner = node;
            current = crate::engine::source::parent(node);
        }
        if let Some(imported) = self.scope.single.get(name) {
            return Some(imported.clone());
        }
        // A single static import of a member type shadows the package's own types, like a single type import.
        let nested = self.scope.static_single.get(name).into_iter().flatten().map(|owner| format!("{owner}.{name}"));
        if let Some(found) = nested.into_iter().find(|candidate| self.index.has(candidate)) {
            return Some(found);
        }
        let local = if self.scope.package.is_empty() { name.to_string() } else { format!("{}.{name}", self.scope.package) };
        if self.index.has(&local) {
            return Some(local);
        }
        for package in &self.scope.on_demand {
            let candidate = format!("{package}.{name}");
            if self.index.has(&candidate) {
                return Some(candidate);
            }
        }
        let mut wide = self.scope.static_on_demand.iter().map(|owner| format!("{owner}.{name}"));
        if let Some(found) = wide.find(|candidate| self.index.has(candidate)) {
            return Some(found);
        }
        let lang = format!("java.lang.{name}");
        self.index.has(&lang).then_some(lang)
    }

    /// A possibly qualified class name as written, without type arguments.
    pub fn class_name(&self, at: Node, text: &str) -> Option<String> {
        let segments: Vec<&str> = text.split('.').map(str::trim).collect();
        if let Some(first) = self.simple(at, segments[0]) {
            return Some(self.member_class(first, &segments[1..]));
        }
        let joined = segments.join(".");
        if self.index.has(&joined) {
            return Some(joined);
        }
        // A package, then a class, then member classes: a member class can be one a supertype declares.
        let outer = (2..segments.len()).find(|end| self.index.has(&segments[..*end].join(".")));
        if let Some(end) = outer {
            return Some(self.member_class(segments[..end].join("."), &segments[end..]));
        }
        (segments.len() > 1 && segments[0].chars().all(|c| c.is_lowercase())).then_some(joined)
    }

    /// The member class a path of names leads to from a class; each step also looks in the supertypes.
    fn member_class(&self, mut name: String, path: &[&str]) -> String {
        for segment in path {
            let nested = self.index.lineage(&name).iter().map(|ancestor| format!("{ancestor}.{segment}")).find(|candidate| self.index.has(candidate));
            name = nested.unwrap_or(format!("{name}.{segment}"));
        }
        name
    }

    /// The bound of a type parameter. Several bounds become one class type named `A&B`.
    fn bound(&self, parameter: Node) -> Type {
        let list = children(parameter).into_iter().find(|child| child.kind() == "type_bound");
        let parts: Vec<String> = list
            .map(crate::engine::source::named_children)
            .unwrap_or_default()
            .into_iter()
            .map(|part| if part.kind() == "generic_type" { part.named_child(0).unwrap_or(part) } else { part })
            .filter_map(|part| self.written(part, false))
            .map(|kind| kind.name())
            .collect();
        let parts: Vec<String> = if parts.len() > 1 { parts.into_iter().filter(|part| part != OBJECT).collect() } else { parts };
        if parts.is_empty() { Type::class(OBJECT) } else { Type::class(&parts.join("&")) }
    }

    /// The type a type node stands for. Type variables stay variables for member signatures
    /// (`keep`), and become their bound where an expression of that type is used.
    pub fn written(&self, node: Node, keep: bool) -> Option<Type> {
        let key = (node.id(), keep);
        if let Some(known) = self.written.borrow().get(&key) {
            return known.clone();
        }
        let kind = self.read_written(node, keep);
        self.written.borrow_mut().insert(key, kind.clone());
        kind
    }

    fn read_written(&self, node: Node, keep: bool) -> Option<Type> {
        match node.kind() {
            "integral_type" | "floating_point_type" | "boolean_type" | "void_type" => {
                let name = ["byte", "short", "int", "long", "char", "float", "double", "boolean", "void"]
                    .into_iter()
                    .find(|name| *name == self.file.text_of(node))?;
                Some(Type::Primitive(name))
            }
            "array_type" => {
                let mut kind = self.written(node.field("element")?, keep)?;
                let dimensions = node.field("dimensions")?;
                for _ in 0..self.file.text_of(dimensions).matches('[').count() {
                    kind = Type::Array(Box::new(kind));
                }
                Some(kind)
            }
            "generic_type" => {
                let Type::Class(name, _) = self.written(node.named_child(0)?, keep)? else { return None };
                let list = children(node).into_iter().find(|child| child.kind() == "type_arguments");
                let arguments = list
                    .map(crate::engine::source::named_children)
                    .unwrap_or_default()
                    .into_iter()
                    .filter(|argument| !argument.kind().ends_with("comment"))
                    .map(|argument| self.written(argument, keep).unwrap_or(Type::class("?")))
                    .collect();
                Some(Type::Class(name, arguments))
            }
            "wildcard" => {
                let bound = crate::engine::source::named_children(node).into_iter().rev().find_map(|part| self.written(part, keep));
                Some(bound.unwrap_or(Type::Wildcard))
            }
            "annotated_type" => self.written(crate::engine::source::named_children(node).pop()?, keep),
            "type_identifier" | "scoped_type_identifier" | "identifier" | "scoped_identifier" => {
                let mut segments = Vec::new();
                if node.child_count() == 0 {
                    segments.push(self.file.text_of(node));
                }
                crate::engine::source::walk(node, |part| {
                    if node.child_count() == 0 {
                        return;
                    }
                    let annotation = crate::engine::source::ancestor(part, &["marker_annotation", "annotation", "type_arguments"]);
                    let inside = annotation.is_some_and(|found| found.start_byte() >= node.start_byte() && found.end_byte() <= node.end_byte());
                    if matches!(part.kind(), "identifier" | "type_identifier") && part.child_count() == 0 && !inside {
                        segments.push(self.file.text_of(part));
                    }
                });
                let text = segments.join(".");
                if !text.contains('.') {
                    if let Some(parameter) = type_parameter(self.file, node, &text) {
                        return Some(if keep { Type::Variable(text) } else { self.bound(parameter) });
                    }
                }
                self.class_name(node, &text).map(|name| Type::Class(name, Vec::new()))
            }
            _ => None,
        }
    }

    pub fn type_node(&self, node: Node) -> Option<Type> {
        self.written(node, false)
    }

    fn with_dimensions(&self, holder: Node, mut kind: Type) -> Type {
        if let Some(dimensions) = holder.field("dimensions") {
            for _ in 0..self.file.text_of(dimensions).matches('[').count() {
                kind = Type::Array(Box::new(kind));
            }
        }
        kind
    }

    fn declared(&self, declaration: Node, declarator: Option<Node>, keep: bool) -> Option<Type> {
        let kind = self.written(declaration.field("type")?, keep)?;
        Some(self.with_dimensions(declarator.unwrap_or(declaration), kind))
    }

    pub fn declared_type(&self, declaration: Node, declarator: Option<Node>) -> Option<Type> {
        self.declared(declaration, declarator, false)
    }

    /// Erased and generic parameter types, and whether the last one is variable arity.
    fn parameter_names(&self, member: Node) -> Vec<String> {
        let mut names = Vec::new();
        for parameter in member.child_by_field_name("parameters").map(children).unwrap_or_default() {
            let holder = match parameter.kind() {
                "formal_parameter" => parameter,
                "spread_parameter" => match children(parameter).into_iter().find(|part| part.kind() == "variable_declarator") {
                    Some(declarator) => declarator,
                    None => continue,
                },
                _ => continue,
            };
            names.push(holder.child_by_field_name("name").map(|name| self.file.text_of(name).to_string()).unwrap_or_default());
        }
        names
    }

    /// The types a `throws` clause lists; one that cannot be read is kept as `?`.
    fn thrown(&self, member: Node) -> Vec<Type> {
        let Some(clause) = children(member).into_iter().find(|part| part.kind() == "throws") else { return Vec::new() };
        let mut cursor = clause.walk();
        clause.named_children(&mut cursor).map(|kind| self.written(kind, true).unwrap_or(Type::class("?"))).collect()
    }

    fn parameters(&self, list: Option<Node>) -> (Vec<Type>, Vec<Type>, bool) {
        let mut erased = Vec::new();
        let mut generic = Vec::new();
        let mut varargs = false;
        for parameter in list.map(children).unwrap_or_default() {
            let unknown = Type::class("?");
            let both = |keep: bool| match parameter.kind() {
                "formal_parameter" => Some(self.declared(parameter, None, keep).unwrap_or(unknown.clone())),
                "spread_parameter" => {
                    let mut cursor = parameter.walk();
                    let element = parameter.named_children(&mut cursor).find_map(|child| self.written(child, keep));
                    Some(Type::Array(Box::new(element.unwrap_or(unknown.clone()))))
                }
                _ => None,
            };
            let Some(kind) = both(false) else { continue };
            varargs |= parameter.kind() == "spread_parameter";
            erased.push(kind.erased());
            generic.push(both(true).unwrap_or(unknown));
        }
        (erased, generic, varargs)
    }

    /// The bits the annotations of a declaration give.
    pub fn marks(&self, declaration: Node) -> u16 {
        let holder = super::super::helpers::modifiers(declaration).unwrap_or(declaration);
        let annotations = children(holder).into_iter().filter(|part| matches!(part.kind(), "marker_annotation" | "annotation"));
        let names = annotations.filter_map(|annotation| annotation.child_by_field_name("name")).map(|name| self.file.text_of(name));
        names.fold(0, |bits, written| {
            let full = self.class_name(declaration, written).unwrap_or_else(|| written.to_string());
            bits | super::model::flag::of_annotation(&full)
        })
    }

    fn class_flags(&self, declaration: Node) -> u16 {
        use super::model::flag;
        let has = super::super::helpers::has_modifier;
        let mut bits = self.marks(declaration);
        for (word, bit) in [("final", flag::FINAL), ("public", flag::PUBLIC), ("protected", flag::PROTECTED), ("static", flag::STATIC), ("abstract", flag::ABSTRACT), ("sealed", flag::SEALED), ("private", flag::PRIVATE)] {
            if has(declaration, word) {
                bits |= bit;
            }
        }
        bits | match declaration.kind() {
            "enum_declaration" => flag::ENUM,
            "record_declaration" => flag::RECORD | flag::FINAL,
            "annotation_type_declaration" => flag::ANNOTATION,
            _ => 0,
        }
    }

    /// Supertypes and type parameters; members are filled in by `members` once every source class is registered.
    pub fn class_header(&self, declaration: Node, name: String) -> ClassInfo {
        let listed = |field: &'static str| -> Vec<Type> {
            let holder = declaration
                .field(field)
                .or_else(|| children(declaration).into_iter().find(|child| child.kind() == field));
            let Some(holder) = holder else { return Vec::new() };
            let list = children(holder).into_iter().find(|child| child.kind() == "type_list").unwrap_or(holder);
            let mut cursor = list.walk();
            list.named_children(&mut cursor)
                .filter_map(|written| self.written(written, true))
                .filter(|kind| matches!(kind, Type::Class(..)))
                .collect()
        };
        let kind = declaration.kind();
        let own = Type::class(&name);
        let own_name = name.clone();
        if matches!(kind, "object_creation_expression" | "enum_constant") {
            let base = match kind {
                "enum_constant" => crate::engine::source::parent(declaration).and_then(|body| crate::engine::source::parent(body)).and_then(|owner| self.scope.names.get(&owner.id())).map(|owner| Type::class(owner)),
                _ => declaration.field("type").and_then(|written| self.written(written, true)),
            };
            let interface = base.as_ref().is_some_and(|base| self.index.get(&base.name()).is_some_and(|info| info.is_interface));
            let named = base.as_ref().map(Type::name);
            return ClassInfo {
                name,
                superclass: named.clone().filter(|_| !interface),
                interfaces: named.into_iter().filter(|_| interface).collect(),
                generic_supers: base.into_iter().collect(),
                package: self.scope.package.clone(),
                ..ClassInfo::default()
            };
        }
        let parent = match kind {
            "enum_declaration" => Some(Type::Class("java.lang.Enum".to_string(), vec![own])),
            "record_declaration" => Some(Type::class("java.lang.Record")),
            "class_declaration" => listed("superclass").into_iter().next(),
            _ => None,
        };
        let mut above = listed("interfaces");
        above.extend(listed("extends_interfaces"));
        if kind == "annotation_type_declaration" {
            above.push(Type::class("java.lang.annotation.Annotation"));
        }
        let type_parameters = children(declaration)
            .into_iter()
            .filter(|child| child.kind() == "type_parameters")
            .flat_map(children)
            .filter(|child| child.kind() == "type_parameter")
            .filter_map(|parameter| {
                let named = children(parameter).into_iter().find(|c| matches!(c.kind(), "type_identifier" | "identifier"))?;
                Some((self.file.text_of(named).to_string(), self.bound(parameter)))
            })
            .collect();
        ClassInfo {
            name,
            superclass: parent.as_ref().map(Type::name),
            interfaces: above.iter().map(Type::name).collect(),
            generic_supers: parent.into_iter().chain(above).collect(),
            package: self.scope.package.clone(),
            type_parameters,
            fields: Vec::new(),
            methods: Vec::new(),
            is_interface: matches!(kind, "interface_declaration" | "annotation_type_declaration"),
            enum_constants: (kind == "enum_declaration").then(|| {
                let body = children(declaration).into_iter().find(|child| child.kind() == "enum_body");
                body.map_or(0, |body| children(body).into_iter().filter(|member| member.kind() == "enum_constant").count() as u32)
            }),
            permitted: self.permitted(declaration, &own_name, &listed("permits")),
            record_components: (kind == "record_declaration").then(Vec::new),
            flags: self.class_flags(declaration),
        }
    }

    /// The classes a sealed declaration permits: the ones it lists, else the ones in its file that extend it directly.
    fn permitted(&self, declaration: Node, name: &str, listed: &[Type]) -> Option<Vec<String>> {
        let modifiers = children(declaration).into_iter().find(|child| child.kind() == "modifiers")?;
        if !self.file.text_of(modifiers).split_whitespace().any(|word| word == "sealed") {
            return None;
        }
        if !listed.is_empty() {
            return Some(listed.iter().map(Type::name).collect());
        }
        let mut found = Vec::new();
        let mut root = declaration;
        while let Some(parent) = root.parent() {
            root = parent;
        }
        let mut stack = vec![root];
        while let Some(node) = stack.pop() {
            if TYPE_DECLARATIONS.contains(&node.kind()) && node.id() != declaration.id() {
                let above = ["superclass", "interfaces", "extends_interfaces"].into_iter().filter_map(|field| {
                    node.child_by_field_name(field).or_else(|| children(node).into_iter().find(|child| child.kind() == field))
                });
                let mut names = above.flat_map(|holder| {
                    let list = children(holder).into_iter().find(|child| child.kind() == "type_list").unwrap_or(holder);
                    let mut cursor = list.walk();
                    list.named_children(&mut cursor).filter_map(|written| self.written(written, true)).map(|kind| kind.name()).collect::<Vec<_>>()
                });
                if names.any(|above| above == name) {
                    found.extend(self.scope.names.get(&node.id()).cloned());
                }
            }
            stack.extend(children(node));
        }
        Some(found)
    }

    /// Whether an expression has the shape of a constant expression; the fields it reads are collected.
    pub fn constant_shape(&self, expression: Node, uses: &mut Vec<(String, String)>) -> bool {
        let mut all = |uses: &mut Vec<(String, String)>| {
            crate::engine::source::named_children(expression)
                .into_iter()
                .filter(|part| !part.kind().ends_with("comment"))
                .all(|part| self.constant_shape(part, uses))
        };
        match expression.kind() {
            "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal"
            | "decimal_floating_point_literal" | "hex_floating_point_literal" | "character_literal" | "string_literal" | "true" | "false" => true,
            "parenthesized_expression" | "binary_expression" | "ternary_expression" | "unary_expression" | "array_initializer" => all(uses),
            "cast_expression" => {
                let simple = expression.field("type").is_some_and(|written| {
                    matches!(written.kind(), "integral_type" | "floating_point_type" | "boolean_type")
                        || matches!(self.file.text_of(written), "String" | "java.lang.String")
                });
                simple && expression.field("value").is_some_and(|value| self.constant_shape(value, uses))
            }
            "identifier" => {
                uses.push((String::new(), self.file.text_of(expression).to_string()));
                true
            }
            "field_access" | "scoped_identifier" => {
                let written: String = self.file.text_of(expression).split_whitespace().collect();
                let Some((owner, name)) = written.rsplit_once('.') else { return false };
                if !owner.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '$' | '.')) {
                    return false;
                }
                let Some(owner) = self.class_name(expression, owner) else { return false };
                uses.push((owner, name.to_string()));
                true
            }
            _ => false,
        }
    }

    pub fn members(&self, declaration: Node, info: &mut ClassInfo) {
        let body = declaration.field("body").or_else(|| children(declaration).into_iter().find(|part| part.kind() == "class_body"));
        let Some(body) = body else { return };
        let has = super::super::helpers::has_modifier;
        let plain = |name: &str, parameters: Vec<Type>, returns: Type| Method {
            name: name.to_string(),
            generic_parameters: parameters.clone(),
            parameters,
            generic_returns: returns.clone(),
            returns,
            type_parameters: Vec::new(),
            type_bounds: Vec::new(),
            package_private: false,
            is_abstract: false,
            is_static: false,
            is_private: false,
            varargs: false,
            flags: super::model::flag::PUBLIC,
            throws: Vec::new(),
            names: Vec::new(),
        };
        let bits = |member: Node| -> u16 {
            use super::model::flag;
            let mut bits = 0;
            for (word, bit) in [("final", flag::FINAL), ("public", flag::PUBLIC), ("protected", flag::PROTECTED), ("static", flag::STATIC), ("abstract", flag::ABSTRACT)] {
                if has(member, word) {
                    bits |= bit;
                }
            }
            let deprecated = super::super::helpers::annotation_names(self.file, member).iter().any(|name| matches!(*name, "Deprecated" | "java.lang.Deprecated"));
            if deprecated {
                bits |= flag::DEPRECATED;
            }
            if info.is_interface {
                bits |= flag::PUBLIC;
            }
            bits | self.marks(member)
        };
        let mut members = children(body);
        members.extend(children(body).into_iter().filter(|child| child.kind() == "enum_body_declarations").flat_map(children));
        for member in members {
            match member.kind() {
                "field_declaration" | "constant_declaration" => {
                    for declarator in super::super::helpers::declarators(member) {
                        let Some(name) = declarator.field("name") else { continue };
                        let Some(kind) = self.declared(member, Some(declarator), false) else { continue };
                        info.fields.push(Field {
                            name: self.file.text_of(name).to_string(),
                            kind: kind.erased(),
                            generic: self.declared(member, Some(declarator), true).unwrap_or(kind.clone()),
                            constant: (info.is_interface || has(member, "final"))
                                .then(|| declarator.field("value"))
                                .flatten()
                                .and_then(|value| super::expr::literal_text(self.file, value)),
                            fixed: (info.is_interface || (has(member, "final") && has(member, "static"))).then(|| declarator.field("value")).flatten().and_then(
                                |value| {
                                    let mut uses = Vec::new();
                                    self.constant_shape(value, &mut uses).then_some(uses)
                                },
                            ),
                            strict: (matches!(&kind, Type::Primitive(_)) || kind.name() == "java.lang.String")
                                && declarator.field("value").is_some_and(|value| value.kind() != "array_initializer"),
                            is_private: has(member, "private"),
                            flags: bits(member) | if info.is_interface { super::model::flag::STATIC | super::model::flag::FINAL } else { 0 },
                        });
                    }
                }
                "enum_constant" => {
                    if let Some(name) = member.field("name") {
                        let own = Type::class(&info.name);
                        info.fields.push(Field {
                            name: self.file.text_of(name).to_string(),
                            kind: own.clone(),
                            generic: own,
                            constant: None,
                            fixed: None,
                            strict: false,
                            is_private: false,
                            flags: super::model::flag::PUBLIC | super::model::flag::STATIC | super::model::flag::FINAL,
                        });
                    }
                }
                "method_declaration" | "annotation_type_element_declaration" => {
                    let Some(name) = member.field("name") else { continue };
                    let unknown = Type::class("?");
                    let returned = |keep: bool| {
                        let kind = member.field("type").and_then(|kind| self.written(kind, keep));
                        self.with_dimensions(member, kind.unwrap_or(unknown.clone()))
                    };
                    let (parameters, generic_parameters, varargs) = self.parameters(member.field("parameters"));
                    info.methods.push(Method {
                        name: self.file.text_of(name).to_string(),
                        parameters,
                        returns: returned(false).erased(),
                        generic_parameters,
                        generic_returns: returned(true),
                        type_parameters: written_names(self.file, member.field("type_parameters"))
                            .into_iter()
                            .map(String::from)
                            .collect(),
                        type_bounds: member
                            .field("type_parameters")
                            .map(children)
                            .unwrap_or_default()
                            .into_iter()
                            .filter(|child| child.kind() == "type_parameter")
                            .map(|parameter| self.bound(parameter))
                            .collect(),
                        package_private: !info.is_interface && !has(member, "public") && !has(member, "protected") && !has(member, "private"),
                        is_static: has(member, "static"),
                        is_private: has(member, "private"),
                        is_abstract: member.field("body").is_none()
                            && (info.is_interface || has(member, "abstract")),
                        varargs,
                        flags: bits(member) | if member.field("body").is_none() && info.is_interface { super::model::flag::ABSTRACT } else { 0 },
                        throws: self.thrown(member),
                        names: self.parameter_names(member),
                    });
                }
                "constructor_declaration" => {
                    let (parameters, generic_parameters, varargs) = self.parameters(member.field("parameters"));
                    info.methods.push(Method {
                        generic_parameters,
                        varargs,
                        throws: self.thrown(member),
                        names: self.parameter_names(member),
                        flags: bits(member),
                        ..plain("<init>", parameters, Type::Primitive("void"))
                    });
                }
                _ => {}
            }
        }
        if matches!(declaration.kind(), "class_declaration" | "enum_declaration") && !info.methods.iter().any(|method| method.name == "<init>") {
            info.methods.push(plain("<init>", Vec::new(), Type::Primitive("void")));
        }
        if declaration.kind() == "enum_declaration" {
            let own = Type::class(&info.name);
            info.methods.push(Method { is_static: true, ..plain("values", Vec::new(), Type::Array(Box::new(own.clone()))) });
            info.methods.push(Method { is_static: true, ..plain("valueOf", vec![Type::class("java.lang.String")], own) });
        }
        if declaration.kind() == "record_declaration" {
            let (parameters, generic_parameters, varargs) = self.parameters(declaration.field("parameters"));
            if !info.methods.iter().any(|method| method.name == "<init>" && method.parameters == parameters) {
                info.methods.push(Method { generic_parameters, varargs, ..plain("<init>", parameters, Type::Primitive("void")) });
            }
            for component in declaration.field("parameters").map(children).unwrap_or_default() {
                let (Some(name), Some(kind)) = (component.field("name"), self.declared(component, None, false)) else {
                    continue;
                };
                let name = self.file.text_of(name).to_string();
                let generic = self.declared(component, None, true).unwrap_or(kind.clone());
                info.fields.push(Field { name: name.clone(), kind: kind.erased(), generic: generic.clone(), constant: None, fixed: None, strict: false, is_private: true, flags: super::model::flag::FINAL });
                info.record_components.get_or_insert_with(Vec::new).push(generic.clone());
                info.methods.push(Method { generic_returns: generic, ..plain(&name, Vec::new(), kind.erased()) });
            }
        }
    }
}
