//! A tree shaped like PMD's Java tree, built from the tree-sitter tree, so XPath rules written for PMD run as they are.
//! The shape and the attribute names follow PMD's documented node reference and its tree dump.
use crate::java::fields::Fields;
use crate::engine::source::{SourceFile, children};
use crate::java::types::expr::{Receiver, literal_text};
use crate::java::types::model::Type;
use crate::java::types::scope::Resolver;
use tree_sitter::Node;

#[derive(Clone, Debug, PartialEq)]
pub enum Value {
    Text(std::rc::Rc<str>),
    Flag(bool),
    Whole(i64),
    Real(f64),
    List(Vec<String>),
}

pub const ROOT: u32 = u32::MAX;

pub struct PNode<'t> {
    pub name: &'static str,
    pub parent: u32,
    pub children: Vec<u32>,
    /// The tree-sitter node this one stands for, when types can be asked about it.
    pub source: Option<Node<'t>>,
    pub start: usize,
    pub end: usize,
    /// Where a finding on this node is reported, when that is not its whole text.
    pub report: Option<(usize, usize)>,
    pub attributes: Vec<(&'static str, Value)>,
}

pub struct PmdTree<'t> {
    /// In document order: a node comes before its children, and those before its next sibling.
    pub nodes: Vec<PNode<'t>>,
    /// The last node below each node; the node itself when it has no children.
    pub last: Vec<u32>,
    /// The nodes of each name, in document order.
    pub named: std::collections::HashMap<&'static str, Vec<u32>>,
    lines: Vec<usize>,
}

const PLACES: [&str; 4] = ["BeginLine", "BeginColumn", "EndLine", "EndColumn"];

/// Renumbers the nodes so that their index is their place in document order.
fn ordered(nodes: Vec<PNode>) -> (Vec<PNode>, Vec<u32>) {
    let mut order: Vec<u32> = Vec::with_capacity(nodes.len());
    let mut stack: Vec<u32> = (0..nodes.len() as u32).rev().filter(|id| nodes[*id as usize].parent == ROOT).collect();
    while let Some(id) = stack.pop() {
        order.push(id);
        stack.extend(nodes[id as usize].children.iter().rev());
    }
    let mut renamed = vec![ROOT; nodes.len()];
    for (new, old) in order.iter().enumerate() {
        renamed[*old as usize] = new as u32;
    }
    let mut slots: Vec<Option<PNode>> = nodes.into_iter().map(Some).collect();
    let mut sorted: Vec<PNode> = Vec::with_capacity(order.len());
    for old in &order {
        let Some(mut node) = slots[*old as usize].take() else { continue };
        if node.parent != ROOT {
            node.parent = renamed[node.parent as usize];
        }
        for kid in &mut node.children {
            *kid = renamed[*kid as usize];
        }
        sorted.push(node);
    }
    let mut last: Vec<u32> = (0..sorted.len() as u32).collect();
    for id in (0..sorted.len()).rev() {
        if let Some(kid) = sorted[id].children.last() {
            last[id] = last[*kid as usize];
        }
    }
    (sorted, last)
}

const ORDER: &[&str] = &[
    "public", "protected", "private", "sealed", "non-sealed", "abstract", "static", "final", "synchronized", "native", "default",
    "strictfp", "transient", "volatile",
];
const TYPE_DECLARATIONS: &[&str] =
    &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

#[derive(Clone, Copy, PartialEq)]
enum Owner {
    Class,
    Interface,
    Enum,
    Record,
    Annotation,
}

fn kids<'t>(node: Node<'t>) -> Vec<Node<'t>> {
    let mut cursor = node.walk();
    node.named_children(&mut cursor).filter(|kid| !kid.kind().ends_with("comment")).collect()
}

fn fields<'t>(node: Node<'t>, name: &str) -> Vec<Node<'t>> {
    let mut cursor = node.walk();
    node.children_by_field_name(name, &mut cursor).collect()
}

fn find<'t>(node: Node<'t>, kind: &str) -> Option<Node<'t>> {
    children(node).into_iter().find(|kid| kid.kind() == kind)
}

/// Source text with its `\uXXXX` escapes replaced, as the Java lexer sees it.
fn unicode_unescaped(written: &str) -> String {
    if !written.contains("\\u") {
        return written.to_string();
    }
    let units: Vec<u16> = written.encode_utf16().collect();
    let mut out: Vec<u16> = Vec::with_capacity(units.len());
    let (mut at, mut slashes) = (0, 0);
    while at < units.len() {
        let unit = units[at];
        if unit == u16::from(b'\\') && slashes % 2 == 0 && units.get(at + 1) == Some(&u16::from(b'u')) {
            let mut digits = at + 1;
            while units.get(digits) == Some(&u16::from(b'u')) {
                digits += 1;
            }
            let hex: Option<String> = units.get(digits..digits + 4).map(|hex| String::from_utf16_lossy(hex));
            if let Some(value) = hex.and_then(|hex| u16::from_str_radix(&hex, 16).ok()) {
                out.push(value);
                at = digits + 4;
                slashes = 0;
                continue;
            }
        }
        slashes = if unit == u16::from(b'\\') { slashes + 1 } else { 0 };
        out.push(unit);
        at += 1;
    }
    String::from_utf16_lossy(&out)
}

fn flag(value: bool) -> Value {
    Value::Flag(value)
}

fn text(value: &str) -> Value {
    Value::Text(std::rc::Rc::from(value))
}

impl<'t> PmdTree<'t> {
    pub fn build(file: &SourceFile, tree_root: Node<'t>, resolver: &Resolver) -> PmdTree<'t> {
        let mut builder = Builder { file, resolver, nodes: Vec::new() };
        builder.unit(tree_root);
        // PMD's lexer reads `>>` as one token, and a type that ends inside it ends where the token ends.
        let bytes = file.text.as_bytes();
        for node in &mut builder.nodes {
            if node.end > 0 && bytes.get(node.end - 1) == Some(&b'>') && node.report.is_none() {
                while bytes.get(node.end) == Some(&b'>') {
                    node.end += 1;
                }
            }
        }
        let mut lines = vec![0];
        lines.extend(file.text.bytes().enumerate().filter(|(_, byte)| *byte == b'\n').map(|(at, _)| at + 1));
        let (nodes, last) = ordered(builder.nodes);
        let mut named: std::collections::HashMap<&'static str, Vec<u32>> = std::collections::HashMap::new();
        for (id, node) in nodes.iter().enumerate() {
            named.entry(node.name).or_default().push(id as u32);
        }
        PmdTree { nodes, last, named, lines }
    }

    /// Line and column as PMD counts them: both from 1, columns in UTF-16 units.
    pub fn place(&self, file: &SourceFile, byte: usize) -> (usize, usize) {
        let byte = (0..=byte.min(file.text.len())).rev().find(|at| file.text.is_char_boundary(*at)).unwrap_or(0);
        let line = self.lines.partition_point(|start| *start <= byte) - 1;
        (line + 1, file.text[self.lines[line]..byte].encode_utf16().count() + 1)
    }

    pub fn attribute(&self, file: &SourceFile, id: u32, name: &str) -> Option<Value> {
        let node = &self.nodes[id as usize];
        if let Some((_, value)) = node.attributes.iter().find(|(key, _)| *key == name) {
            return Some(value.clone());
        }
        let (start, end) = node.report.unwrap_or((node.start, node.end));
        let whole = |value: usize| Some(Value::Whole(value as i64));
        if node.parent == ROOT && end > 0 && name.starts_with("End") {
            // The file ends with its last character, a line break included.
            let (line, column) = self.place(file, end - 1);
            return whole(if name == "EndLine" { line } else { column + 1 });
        }
        match name {
            "BeginLine" => whole(self.place(file, start).0),
            "BeginColumn" => whole(self.place(file, start).1),
            "EndLine" => whole(self.place(file, end).0),
            "EndColumn" => whole(self.place(file, end).1),
            // Every node has an image for XPath; it is empty where PMD keeps none.
            "Image" => Some(Value::Text("".into())),
            _ => None,
        }
    }

    /// The name of an attribute as the tree keeps it, when the node has it.
    pub fn attribute_key(&self, id: u32, name: &str) -> Option<&'static str> {
        let node = &self.nodes[id as usize];
        node.attributes.iter().map(|(key, _)| *key).chain(PLACES).chain(["Image"]).find(|key| *key == name)
    }

    pub fn attribute_names(&self, id: u32) -> Vec<&'static str> {
        let mut names: Vec<&'static str> = self.nodes[id as usize].attributes.iter().map(|(key, _)| *key).collect();
        names.extend(["BeginLine", "BeginColumn", "EndLine", "EndColumn"]);
        names
    }
}

struct Builder<'a, 't> {
    file: &'a SourceFile,
    resolver: &'a Resolver<'a>,
    nodes: Vec<PNode<'t>>,

}

impl<'a, 't> Builder<'a, 't> {
    fn open(&mut self, parent: u32, name: &'static str, source: Option<Node<'t>>, start: usize, end: usize) -> u32 {
        let id = self.nodes.len() as u32;
        self.nodes.push(PNode { name, parent, children: Vec::new(), source, start, end, report: None, attributes: Vec::new() });
        if parent != ROOT {
            self.nodes[parent as usize].children.push(id);
        }
        id
    }

    fn at(&mut self, parent: u32, name: &'static str, node: Node<'t>) -> u32 {
        self.open(parent, name, Some(node), node.start_byte(), node.end_byte())
    }

    fn set(&mut self, id: u32, key: &'static str, value: Value) {
        let attributes = &mut self.nodes[id as usize].attributes;
        match attributes.iter_mut().find(|(known, _)| *known == key) {
            Some(slot) => slot.1 = value,
            None => attributes.push((key, value)),
        }
    }

    fn get(&self, id: u32, key: &str) -> Option<&Value> {
        self.nodes[id as usize].attributes.iter().find(|(known, _)| *known == key).map(|(_, value)| value)
    }

    fn is(&self, id: u32, key: &str) -> bool {
        self.get(id, key) == Some(&Value::Flag(true))
    }

    fn sized(&mut self, id: u32) {
        let size = self.nodes[id as usize].children.len() as i64;
        self.set(id, "Size", Value::Whole(size));
    }

    fn text(&self, node: Node) -> &'a str {
        self.file.text_of(node)
    }

    fn unit(&mut self, root: Node<'t>) {
        let all = kids(root);
        let start = all.first().map_or(0, |first| first.start_byte());
        let id = self.open(ROOT, "CompilationUnit", Some(root), start, self.file.text.len());
        self.set(id, "PackageName", text(""));
        for kid in all {
            match kid.kind() {
                "package_declaration" => {
                    let declaration = self.at(id, "PackageDeclaration", kid);
                    let name = kids(kid).into_iter().rev().find(|part| matches!(part.kind(), "identifier" | "scoped_identifier"));
                    self.nodes[declaration as usize].report = name.map(|name| (name.start_byte(), name.end_byte()));
                    let package: String = name.map(|name| self.text(name)).unwrap_or_default().split_whitespace().collect();
                    self.set(declaration, "Name", text(&package));
                    self.set(id, "PackageName", text(&package));
                    self.modifiers(declaration, kid, &[]);
                }
                "import_declaration" => {
                    let declaration = self.at(id, "ImportDeclaration", kid);
                    let parts = children(kid);
                    let name: String = kids(kid)
                        .into_iter()
                        .find(|part| matches!(part.kind(), "identifier" | "scoped_identifier"))
                        .map(|name| self.text(name).split_whitespace().collect())
                        .unwrap_or_default();
                    let wide = parts.iter().any(|part| part.kind() == "asterisk");
                    self.set(declaration, "Static", flag(parts.iter().any(|part| part.kind() == "static")));
                    self.set(declaration, "ImportOnDemand", flag(wide));
                    self.set(declaration, "ImportedName", text(&name));
                    if !wide {
                        self.set(declaration, "ImportedSimpleName", text(name.rsplit('.').next().unwrap_or_default()));
                    }
                    let package = if wide { name.as_str() } else { name.rsplit_once('.').map_or("", |(package, _)| package) };
                    self.set(declaration, "PackageName", text(package));
                }
                kind if TYPE_DECLARATIONS.contains(&kind) => {
                    self.type_declaration(id, kid, None, false);
                }
                _ => {}
            }
        }
    }

    /// The modifier list of a declaration; returns the effective modifiers.
    fn modifiers(&mut self, parent: u32, declaration: Node<'t>, implicit: &[&'static str]) -> Vec<&'static str> {
        if declaration.kind() == "package_declaration" {
            let notes: Vec<Node<'t>> = kids(declaration).into_iter().filter(|part| matches!(part.kind(), "marker_annotation" | "annotation")).collect();
            let start = notes.first().map_or(declaration.start_byte(), |first| first.start_byte());
            let id = self.open(parent, "ModifierList", None, start, notes.last().map_or(start, |last| last.end_byte()));
            for note in notes {
                self.annotation(id, note);
            }
            self.set(id, "ExplicitModifiers", Value::List(Vec::new()));
            self.set(id, "EffectiveModifiers", Value::List(Vec::new()));
            return Vec::new();
        }
        let written = find(declaration, "modifiers");
        let bare = if declaration.kind() == "enhanced_for_statement" {
            declaration.field("type").map_or(declaration.start_byte(), |written| written.start_byte())
        } else {
            declaration.start_byte()
        };
        let (start, end) = written.map_or((bare, bare), |list| (list.start_byte(), list.end_byte()));
        let id = self.open(parent, "ModifierList", None, start, end);
        let mut explicit: Vec<&'static str> = Vec::new();
        for part in written.map(children).unwrap_or_default() {
            match part.kind() {
                "marker_annotation" | "annotation" => {
                    self.annotation(id, part);
                }
                kind => explicit.extend(ORDER.iter().find(|known| **known == kind)),
            }
        }
        let rank = |modifier: &&'static str| ORDER.iter().position(|known| known == modifier);
        explicit.sort_by_key(rank);
        let mut effective = explicit.clone();
        effective.extend(implicit.iter().filter(|modifier| !explicit.contains(modifier)));
        effective.sort_by_key(rank);
        effective.dedup();
        self.set(id, "ExplicitModifiers", Value::List(explicit.iter().map(|modifier| modifier.to_string()).collect()));
        self.set(id, "EffectiveModifiers", Value::List(effective.iter().map(|modifier| modifier.to_string()).collect()));
        effective
    }

    fn visibility(effective: &[&'static str]) -> &'static str {
        ["public", "protected", "private"].into_iter().find(|level| effective.contains(level)).unwrap_or("package")
    }

    fn annotation(&mut self, parent: u32, node: Node<'t>) -> u32 {
        let id = self.at(parent, "Annotation", node);
        if let Some(name) = node.field("name") {
            self.named_type(id, name);
            self.set(id, "SimpleName", text(self.text(name).rsplit('.').next().unwrap_or_default().trim()));
        }
        if let Some(arguments) = node.field("arguments") {
            let list = self.at(id, "AnnotationMemberList", arguments);
            for kid in kids(arguments) {
                let pair = self.at(list, "MemberValuePair", kid);
                if kid.kind() == "element_value_pair" {
                    let key = kid.field("key").map(|key| self.text(key)).unwrap_or_default();
                    self.set(pair, "Name", text(key));
                    self.set(pair, "Image", text(key));
                    self.set(pair, "Shorthand", flag(false));
                    if let Some(value) = kid.field("value") {
                        self.member_value(pair, value);
                    }
                } else {
                    self.set(pair, "Name", text("value"));
                    self.set(pair, "Image", text("value"));
                    self.set(pair, "Shorthand", flag(true));
                    self.member_value(pair, kid);
                }
            }
            self.sized(list);
        }
        id
    }

    fn member_value(&mut self, parent: u32, node: Node<'t>) {
        match node.kind() {
            "element_value_array_initializer" => {
                let id = self.at(parent, "MemberValueArrayInitializer", node);
                for kid in kids(node) {
                    self.member_value(id, kid);
                }
            }
            "annotation" | "marker_annotation" => {
                self.annotation(parent, node);
            }
            _ => {
                self.expr(parent, node);
            }
        }
    }

    /// Whether dotted text names a class here, as opposed to a package.
    fn names_class(&self, at: Node, written: &str) -> bool {
        match self.resolver.class_name(at, written) {
            // A name brought in by a single-type import is a class even when its jar is not on the class path.
            Some(name) => {
                let first = written.split('.').next().unwrap_or(written);
                self.resolver.index.has(&name) || self.resolver.scope.single.get(first).is_some_and(|imported| name.starts_with(imported.as_str()))
            }
            None => written.rsplit('.').next().is_some_and(|last| last.starts_with(char::is_uppercase)),
        }
    }

    /// A class type from a name written with dots: an annotation name, or a qualifier that is a type.
    fn named_type(&mut self, parent: u32, node: Node<'t>) -> u32 {
        match node.kind() {
            "scoped_identifier" | "scoped_type_identifier" | "field_access" => {
                let id = self.at(parent, "ClassType", node);
                let parts = kids(node);
                let simple = parts.iter().rev().find(|part| matches!(part.kind(), "identifier" | "type_identifier")).copied();
                self.set(id, "SimpleName", text(simple.map(|simple| self.text(simple)).unwrap_or_default()));
                if let Some(scope) = parts.first().copied().filter(|scope| Some(*scope) != simple) {
                    let written: String = self.text(scope).split_whitespace().collect();
                    if scope.kind() == "generic_type" || self.names_class(node, &written) {
                        self.ty(id, scope);
                    } else {
                        self.set(id, "PackageQualifier", text(&written));
                    }
                }
                for part in &parts {
                    if matches!(part.kind(), "marker_annotation" | "annotation") {
                        self.annotation(id, *part);
                    }
                }
                id
            }
            _ => {
                let written = self.text(node);
                match written.rfind('.') {
                    // A record pattern's qualified type, which the grammar read as one name (see `grammar::masked`).
                    Some(dot) if !written.contains(char::is_whitespace) => self.dotted_type(parent, node, node.start_byte(), dot),
                    _ => {
                        let id = self.at(parent, "ClassType", node);
                        self.set(id, "SimpleName", text(written));
                        id
                    }
                }
            }
        }
    }

    /// A class type for `written[..]` of a single name node that holds dots; `dot` is the last one.
    fn dotted_type(&mut self, parent: u32, node: Node<'t>, start: usize, dot: usize) -> u32 {
        let whole = &self.file.text[start..node.end_byte()];
        let id = self.open(parent, "ClassType", Some(node), start, node.end_byte());
        self.set(id, "SimpleName", text(&whole[dot + 1..]));
        self.dotted_scope(id, node, start, dot);
        id
    }

    /// The qualifier `text[start..start + dot]` of a dotted class type: an outer class type, or a package.
    fn dotted_scope(&mut self, id: u32, node: Node<'t>, start: usize, dot: usize) {
        let scope = &self.file.text[start..start + dot];
        if self.names_class(node, scope) {
            let inner = self.open(id, "ClassType", None, start, start + dot);
            let simple = scope.rfind('.');
            self.set(inner, "SimpleName", text(&scope[simple.map_or(0, |at| at + 1)..]));
            if let Some(at) = simple {
                self.dotted_scope(inner, node, start, at);
            }
        } else {
            self.set(id, "PackageQualifier", text(scope));
        }
    }

    fn type_arguments(&mut self, parent: u32, node: Node<'t>) {
        let id = self.at(parent, "TypeArguments", node);
        for kid in kids(node) {
            self.ty(id, kid);
        }
        self.sized(id);
        self.set(id, "Diamond", flag(self.nodes[id as usize].children.is_empty()));
    }

    fn dimensions(&mut self, parent: u32, node: Node<'t>) -> usize {
        let id = self.at(parent, "ArrayDimensions", node);
        let count = self.dims_into(id, node);
        self.sized(id);
        count
    }

    fn dims_into(&mut self, id: u32, node: Node<'t>) -> usize {
        let mut count = 0;
        let mut pending: Vec<Node<'t>> = Vec::new();
        let mut current = None;
        for part in children(node) {
            match part.kind() {
                "marker_annotation" | "annotation" => pending.push(part),
                "[" => {
                    let start = pending.first().map_or(part.start_byte(), |first| first.start_byte());
                    let dim = self.open(id, "ArrayTypeDim", None, start, part.end_byte());
                    self.set(dim, "Varargs", flag(false));
                    for annotation in pending.drain(..) {
                        self.annotation(dim, annotation);
                    }
                    current = Some(dim);
                    count += 1;
                }
                "]" => {
                    if let Some(dim) = current.take() {
                        self.nodes[dim as usize].end = part.end_byte();
                    }
                }
                _ => {}
            }
        }
        count
    }

    /// Puts type annotations on a type; on an array they belong to the element type.
    fn annotate(&mut self, written: u32, annotations: &[Node<'t>]) {
        let Some(first) = annotations.first() else { return };
        let mut target = written;
        while self.nodes[target as usize].name == "ArrayType" {
            self.nodes[target as usize].start = first.start_byte();
            let Some(element) = self.nodes[target as usize].children.first().copied() else { break };
            target = element;
        }
        self.nodes[target as usize].start = first.start_byte();
        let before = self.nodes[target as usize].children.len();
        for annotation in annotations {
            self.annotation(target, *annotation);
        }
        self.nodes[target as usize].children.rotate_left(before);
    }

    fn ty(&mut self, parent: u32, node: Node<'t>) -> u32 {
        match node.kind() {
            "generic_type" => {
                let parts = kids(node);
                let Some(base) = parts.first().copied() else { return self.at(parent, "ClassType", node) };
                let id = self.ty(parent, base);
                self.nodes[id as usize].end = node.end_byte();
                self.nodes[id as usize].source = Some(node);
                if let Some(arguments) = parts.iter().find(|part| part.kind() == "type_arguments") {
                    self.type_arguments(id, *arguments);
                }
                id
            }
            "array_type" => {
                let id = self.at(parent, "ArrayType", node);
                if let Some(element) = node.field("element") {
                    self.ty(id, element);
                }
                let depth = node.field("dimensions").map_or(0, |dimensions| self.dimensions(id, dimensions));
                self.set(id, "ArrayDepth", Value::Whole(depth as i64));
                id
            }
            "integral_type" | "floating_point_type" | "boolean_type" => {
                let id = self.at(parent, "PrimitiveType", node);
                self.set(id, "Kind", text(self.text(node)));
                id
            }
            "void_type" => self.at(parent, "VoidType", node),
            "annotated_type" => {
                let parts = kids(node);
                let Some(inner) = parts.last().copied() else { return self.at(parent, "ClassType", node) };
                let id = self.ty(parent, inner);
                self.annotate(id, &parts[..parts.len() - 1]);
                id
            }
            "wildcard" => {
                let id = self.at(parent, "WildcardType", node);
                self.set(id, "LowerBound", flag(children(node).iter().any(|part| part.kind() == "super")));
                for kid in kids(node) {
                    if matches!(kid.kind(), "marker_annotation" | "annotation") {
                        self.annotation(id, kid);
                    } else if kid.kind() != "super" {
                        self.ty(id, kid);
                    }
                }
                id
            }
            _ => self.named_type(parent, node),
        }
    }

    fn type_parameters(&mut self, parent: u32, node: Node<'t>) {
        let id = self.at(parent, "TypeParameters", node);
        for kid in kids(node).into_iter().filter(|kid| kid.kind() == "type_parameter") {
            let parameter = self.at(id, "TypeParameter", kid);
            for part in kids(kid) {
                match part.kind() {
                    "marker_annotation" | "annotation" => {
                        self.annotation(parameter, part);
                    }
                    "type_identifier" | "identifier" => {
                        self.set(parameter, "Name", text(self.text(part)));
                        self.set(parameter, "Image", text(self.text(part)));
                    }
                    "type_bound" => {
                        let bounds = kids(part);
                        if bounds.len() > 1 {
                            let both = self.at(parameter, "IntersectionType", part);
                            self.nodes[both as usize].start = bounds[0].start_byte();
                            for bound in bounds {
                                self.ty(both, bound);
                            }
                        } else if let Some(bound) = bounds.first() {
                            self.ty(parameter, *bound);
                        }
                    }
                    _ => {}
                }
            }
        }
        self.sized(id);
    }

    fn type_declaration(&mut self, parent: u32, node: Node<'t>, inside: Option<Owner>, local: bool) -> u32 {
        let (name, owner, body_name) = match node.kind() {
            "interface_declaration" => ("ClassDeclaration", Owner::Interface, "ClassBody"),
            "enum_declaration" => ("EnumDeclaration", Owner::Enum, "EnumBody"),
            "record_declaration" => ("RecordDeclaration", Owner::Record, "RecordBody"),
            "annotation_type_declaration" => ("AnnotationTypeDeclaration", Owner::Annotation, "AnnotationTypeBody"),
            _ => ("ClassDeclaration", Owner::Class, "ClassBody"),
        };
        let id = self.at(parent, name, node);
        let mut implicit: Vec<&'static str> = Vec::new();
        let around = crate::engine::source::ancestor(node, TYPE_DECLARATIONS).map(|around| around.kind());
        if matches!(inside, Some(Owner::Interface | Owner::Annotation))
            || (local && matches!(around, Some("interface_declaration" | "annotation_type_declaration")))
        {
            implicit.extend(["public", "static"]);
        }
        match owner {
            Owner::Interface | Owner::Annotation => {
                implicit.push("abstract");
                implicit.extend(inside.map(|_| "static"));
            }
            Owner::Enum => {
                implicit.extend(inside.map(|_| "static"));
                let bodied = node.field("body").is_some_and(|body| {
                    kids(body).iter().any(|constant| constant.kind() == "enum_constant" && constant.field("body").is_some())
                });
                if !bodied {
                    implicit.push("final");
                }
            }
            Owner::Record => {
                implicit.push("final");
                implicit.extend(inside.map(|_| "static"));
            }
            Owner::Class => {}
        }
        let effective = self.modifiers(id, node, &implicit);
        if let Some(parameters) = node.field("type_parameters") {
            self.type_parameters(id, parameters);
        }
        if owner == Owner::Record {
            if let Some(parameters) = node.field("parameters") {
                let parts = kids(parameters);
                let list = match (parts.first(), parts.last()) {
                    (Some(first), Some(last)) => self.open(id, "RecordComponentList", Some(parameters), first.start_byte(), last.end_byte()),
                    _ => {
                        let close = find(parameters, ")").map_or(parameters.end_byte(), |close| close.start_byte());
                        self.open(id, "RecordComponentList", Some(parameters), close, close)
                    }
                };
                for kid in kids(parameters) {
                    let component = self.at(list, "RecordComponent", kid);
                    self.parameter_parts(component, kid, &["private", "final"], "private", false);
                    self.set(component, "Varargs", flag(kid.kind() == "spread_parameter"));
                }
                self.sized(list);
                self.set(list, "Varargs", flag(kids(parameters).last().is_some_and(|last| last.kind() == "spread_parameter")));
            }
        }
        for part in children(node) {
            let list = match part.kind() {
                "superclass" | "extends_interfaces" => "ExtendsList",
                "super_interfaces" => "ImplementsList",
                "permits" => "PermitsList",
                _ => continue,
            };
            let list = self.at(id, list, part);
            let types = find(part, "type_list").map(kids).unwrap_or_else(|| kids(part));
            for written in types {
                self.ty(list, written);
            }
            self.sized(list);
        }
        if let Some(name) = node.field("name") {
            self.set(id, "SimpleName", text(self.text(name)));
        }
        let keyword = children(node).into_iter().find(|part| matches!(part.kind(), "class" | "interface" | "enum" | "record" | "@interface"));
        self.nodes[id as usize].report =
            keyword.map(|keyword| (keyword.start_byte(), if keyword.kind() == "@interface" { keyword.start_byte() + 1 } else { keyword.end_byte() }));
        if !local {
            let known = self.resolver.scope.names.get(&node.id());
            if let Some(canonical) = known.filter(|name| !name.split('.').any(|part| part.starts_with(|first: char| first.is_ascii_digit()))) {
                self.set(id, "CanonicalName", text(canonical));
                self.set(id, "BinaryName", text(canonical));
            }
        }
        let package = &self.resolver.scope.package;
        self.set(id, "PackageName", text(package));
        self.set(id, "Interface", flag(matches!(owner, Owner::Interface | Owner::Annotation)));
        self.set(id, "RegularInterface", flag(owner == Owner::Interface));
        self.set(id, "RegularClass", flag(owner == Owner::Class));
        self.set(id, "Enum", flag(owner == Owner::Enum));
        self.set(id, "Record", flag(owner == Owner::Record));
        self.set(id, "Annotation", flag(owner == Owner::Annotation));
        self.set(id, "Abstract", flag(effective.contains(&"abstract")));
        self.set(id, "Static", flag(effective.contains(&"static")));
        self.set(id, "Final", flag(effective.contains(&"final")));
        self.set(id, "Local", flag(local));
        self.set(id, "Anonymous", flag(false));
        self.set(id, "Nested", flag(inside.is_some() && !local));
        self.set(id, "TopLevel", flag(inside.is_none() && !local));
        self.set(id, "Visibility", text(if local { "local" } else { Self::visibility(&effective) }));
        if let Some(body) = node.field("body") {
            self.body(id, body, body_name, owner);
        }
        id
    }

    fn body(&mut self, parent: u32, body: Node<'t>, name: &'static str, owner: Owner) -> u32 {
        let id = self.at(parent, name, body);
        let seen = self.nodes.len();
        for kid in children(body) {
            match kid.kind() {
                "enum_constant" => self.enum_constant(id, kid),
                "enum_body_declarations" => {
                    // The `;` that ends the constants is no declaration; any later one is.
                    for (position, member) in children(kid).into_iter().enumerate() {
                        if member.kind() == ";" && position > 0 {
                            self.at(id, "EmptyDeclaration", member);
                        } else if member.is_named() && !member.kind().ends_with("comment") {
                            self.member(id, member, owner);
                        }
                    }
                }
                ";" => {
                    self.at(id, "EmptyDeclaration", kid);
                }
                _ if kid.is_named() && !kid.kind().ends_with("comment") => self.member(id, kid, owner),
                _ => {}
            }
        }
        let _ = seen;
        self.sized(id);
        id
    }

    fn enum_constant(&mut self, parent: u32, node: Node<'t>) {
        let id = self.at(parent, "EnumConstant", node);
        self.modifiers(id, node, &["public", "static", "final"]);
        if let Some(name) = node.field("name") {
            self.nodes[id as usize].report = Some((name.start_byte(), name.end_byte()));
            self.set(id, "Name", text(self.text(name)));
            self.set(id, "Image", text(self.text(name)));
            let variable = self.at(id, "VariableId", name);
            self.variable_flags(variable, self.text(name), false, true, "public", true);
            self.set(variable, "EnumConstant", flag(true));
        }
        self.set(id, "MethodName", text("new"));
        self.set(id, "Visibility", text("public"));
        if let Some(arguments) = node.field("arguments") {
            self.arguments(id, arguments);
        }
        self.set(id, "AnonymousClass", flag(node.field("body").is_some()));
        if let Some(body) = node.field("body") {
            self.anonymous(id, body, true);
        }
    }

    fn anonymous(&mut self, parent: u32, body: Node<'t>, constant: bool) {
        let id = self.at(parent, "AnonymousClassDeclaration", body);
        let fixed = crate::engine::source::ancestor(
            body,
            &["method_declaration", "static_initializer", "field_declaration", "constant_declaration", "class_body"],
        );
        let fixed = constant
            || fixed.is_some_and(|scope| match scope.kind() {
                "static_initializer" | "constant_declaration" => true,
                "class_body" => false,
                _ => find(scope, "modifiers").is_some_and(|list| children(list).iter().any(|part| part.kind() == "static")),
            });
        let list = self.open(id, "ModifierList", None, body.start_byte(), body.start_byte());
        self.set(list, "ExplicitModifiers", Value::List(Vec::new()));
        self.set(list, "EffectiveModifiers", Value::List(if fixed { vec!["static".to_string()] } else { Vec::new() }));
        for (key, value) in [("Anonymous", true), ("Interface", false), ("RegularClass", false), ("Local", false), ("Abstract", false)] {
            self.set(id, key, flag(value));
        }
        self.set(id, "Static", flag(fixed));
        self.set(id, "SimpleName", text(""));
        self.set(id, "Visibility", text("anonymous"));
        self.body(id, body, "ClassBody", Owner::Class);
    }

    fn variable_flags(&mut self, id: u32, name: &str, field: bool, fixed: bool, visibility: &'static str, last: bool) {
        self.set(id, "Name", text(name));
        self.set(id, "Field", flag(field));
        self.set(id, "Static", flag(fixed));
        self.set(id, "Final", flag(last));
        self.set(id, "Visibility", text(visibility));
    }

    /// Modifier list, type and variable id of a parameter-like declaration.
    fn parameter_parts(&mut self, id: u32, node: Node<'t>, implicit: &[&'static str], visibility: &'static str, field: bool) {
        let effective = self.modifiers(id, node, implicit);
        let spread = node.kind() == "spread_parameter";
        let written = if spread {
            kids(node).into_iter().find(|kid| !matches!(kid.kind(), "modifiers" | "variable_declarator"))
        } else {
            node.field("type")
        };
        let inferred = written.is_some_and(|written| self.text(written) == "var");
        if let Some(written) = written.filter(|_| !inferred) {
            if spread {
                let dots = find(node, "...");
                let end = dots.map_or(written.end_byte(), |dots| dots.end_byte());
                let array = self.open(id, "ArrayType", Some(node), written.start_byte(), end);
                let (element, inner) = if written.kind() == "array_type" {
                    (written.field("element").unwrap_or(written), written.field("dimensions"))
                } else {
                    (written, None)
                };
                self.ty(array, element);
                let start = inner.or(dots).map_or(end, |first| first.start_byte());
                let dims = self.open(array, "ArrayDimensions", None, start, end);
                let mut depth = inner.map_or(0, |inner| self.dims_into(dims, inner));
                if let Some(dots) = dots {
                    let dim = self.at(dims, "ArrayTypeDim", dots);
                    self.set(dim, "Varargs", flag(true));
                    depth += 1;
                    // An annotation before the dots is hidden from the grammar; it is read from the text.
                    let from = inner.map_or(element.end_byte(), |inner| inner.end_byte());
                    let between = &self.file.text[from..dots.start_byte()];
                    if let Some(at) = between.find('@') {
                        let name = between[at + 1..].trim();
                        let (start, end) = (from + at, from + at + 1 + name.len());
                        if !name.is_empty() && name.chars().all(|c| c.is_alphanumeric() || matches!(c, '_' | '.' | '$')) {
                            self.nodes[dim as usize].start = start;
                            if inner.is_none() {
                                self.nodes[dims as usize].start = start;
                            }
                            let annotation = self.open(dim, "Annotation", None, start, end);
                            let simple = name.rsplit('.').next().unwrap_or(name);
                            self.set(annotation, "SimpleName", text(simple));
                            let written = self.open(annotation, "ClassType", None, start + 1, end);
                            self.set(written, "SimpleName", text(simple));
                            self.set(written, "FullyQualified", flag(name.contains('.')));
                        }
                    }
                }
                self.sized(dims);
                self.set(array, "ArrayDepth", Value::Whole(depth as i64));
            } else {
                self.ty(id, written);
            }
        }
        let declarator = find(node, "variable_declarator");
        let name = declarator.and_then(|declarator| declarator.field("name")).or_else(|| node.field("name"));
        if let Some(name) = name {
            let dims = declarator.unwrap_or(node).field("dimensions");
            let variable = self.open(id, "VariableId", Some(name), name.start_byte(), dims.map_or(name.end_byte(), |dims| dims.end_byte()));
            self.variable_flags(variable, self.text(name), field, false, visibility, effective.contains(&"final"));
            if let Some(dims) = dims {
                self.dimensions(variable, dims);
            }
        }
        self.set(id, "Visibility", text(visibility));
        self.set(id, "Final", flag(effective.contains(&"final")));
    }

    fn formal_parameters(&mut self, parent: u32, node: Node<'t>) -> (usize, bool) {
        let id = self.at(parent, "FormalParameters", node);
        let mut varargs = false;
        let mut count = 0;
        for kid in kids(node) {
            match kid.kind() {
                "formal_parameter" | "spread_parameter" => {
                    let parameter = self.at(id, "FormalParameter", kid);
                    self.parameter_parts(parameter, kid, &[], "local", false);
                    self.set(parameter, "Varargs", flag(kid.kind() == "spread_parameter"));
                    varargs |= kid.kind() == "spread_parameter";
                    count += 1;
                }
                "receiver_parameter" => {
                    let receiver = self.at(id, "ReceiverParameter", kid);
                    if let Some(written) = kids(kid).into_iter().find(|part| part.kind().ends_with("type") || part.kind() == "type_identifier") {
                        self.ty(receiver, written);
                    }
                }
                _ => {}
            }
        }
        self.set(id, "Size", Value::Whole(count as i64));
        (count, varargs)
    }

    fn declarator(&mut self, parent: u32, node: Node<'t>, field: bool, fixed: bool, visibility: &'static str, last: bool) {
        let id = self.at(parent, "VariableDeclarator", node);
        let Some(name) = node.field("name") else { return };
        let dims = node.field("dimensions");
        self.set(id, "Name", text(self.text(name)));
        self.set(id, "Initializer", flag(node.field("value").is_some()));
        let variable = self.open(id, "VariableId", Some(name), name.start_byte(), dims.map_or(name.end_byte(), |dims| dims.end_byte()));
        self.variable_flags(variable, self.text(name), field, fixed, visibility, last);
        if let Some(dims) = dims {
            self.dimensions(variable, dims);
        }
        if let Some(value) = node.field("value") {
            self.expr(id, value);
        }
    }

    fn member(&mut self, parent: u32, node: Node<'t>, owner: Owner) {
        let shared = matches!(owner, Owner::Interface | Owner::Annotation);
        match node.kind() {
            "field_declaration" | "constant_declaration" => {
                let id = self.at(parent, "FieldDeclaration", node);
                let effective = self.modifiers(id, node, if shared { &["public", "static", "final"] } else { &[] });
                if let Some(written) = node.field("type") {
                    self.ty(id, written);
                }
                let (fixed, last, visibility) = (effective.contains(&"static"), effective.contains(&"final"), Self::visibility(&effective));
                let declarators = fields(node, "declarator");
                let first = declarators.first().and_then(|first| first.field("name"));
                self.nodes[id as usize].report = first.map(|name| (name.start_byte(), name.end_byte()));
                for declarator in declarators {
                    self.declarator(id, declarator, true, fixed, visibility, last);
                }
                self.set(id, "Static", flag(fixed));
                self.set(id, "Final", flag(last));
                self.set(id, "Visibility", text(visibility));
            }
            "method_declaration" | "annotation_type_element_declaration" => {
                let id = self.at(parent, "MethodDeclaration", node);
                let written: Vec<&str> = find(node, "modifiers").map(children).unwrap_or_default().iter().map(|part| part.kind()).collect();
                let bodied = node.field("body").is_some();
                let mut implicit: Vec<&'static str> = Vec::new();
                if shared && !written.contains(&"private") {
                    implicit.push("public");
                }
                if shared && !bodied && !written.contains(&"static") && !written.contains(&"default") && !written.contains(&"private") {
                    implicit.push("abstract");
                }
                let effective = self.modifiers(id, node, &implicit);
                if let Some(parameters) = node.field("type_parameters") {
                    self.type_parameters(id, parameters);
                }
                let result = node.field("type");
                if let Some(result) = result {
                    let written = self.ty(id, result);
                    let loose: Vec<Node<'t>> = kids(node)
                        .into_iter()
                        .filter(|part| matches!(part.kind(), "marker_annotation" | "annotation") && part.end_byte() <= result.start_byte())
                        .collect();
                    self.annotate(written, &loose);
                }
                let (arity, varargs) = match node.field("parameters") {
                    Some(parameters) => self.formal_parameters(id, parameters),
                    None => {
                        let at = node.field("name").map_or(node.end_byte(), |name| name.end_byte());
                        let (from, to) = (find(node, "(").map_or(at, |open| open.start_byte()), find(node, ")").map_or(at, |close| close.end_byte()));
                        let list = self.open(id, "FormalParameters", None, from, to);
                        self.set(list, "Size", Value::Whole(0));
                        (0, false)
                    }
                };
                if let Some(throws) = find(node, "throws") {
                    let list = self.at(id, "ThrowsList", throws);
                    for thrown in kids(throws) {
                        self.ty(list, thrown);
                    }
                    self.sized(list);
                }
                if let Some(value) = node.field("value") {
                    let default = self.at(id, "DefaultValue", value);
                    if let Some(keyword) = find(node, "default") {
                        self.nodes[default as usize].start = keyword.start_byte();
                    }
                    self.member_value(default, value);
                }
                if let Some(body) = node.field("body") {
                    self.block(id, body);
                }
                let name = node.field("name");
                let named = name.map(|name| self.text(name)).unwrap_or_default();
                self.nodes[id as usize].report = name.map(|name| (name.start_byte(), name.end_byte()));
                let void = result.is_some_and(|result| result.kind() == "void_type");
                let annotated = find(node, "modifiers").is_some_and(|list| {
                    kids(list).iter().any(|part| part.kind() == "marker_annotation" && self.text(*part).trim_start_matches('@').trim() == "Override")
                });
                let entry = named == "main" && void && effective.contains(&"public") && effective.contains(&"static") && arity == 1;
                self.set(id, "Name", text(named));
                self.set(id, "Arity", Value::Whole(arity as i64));
                self.set(id, "Varargs", flag(varargs));
                self.set(id, "Void", flag(void));
                self.set(id, "Abstract", flag(effective.contains(&"abstract")));
                self.set(id, "Static", flag(effective.contains(&"static")));
                self.set(id, "Final", flag(effective.contains(&"final")));
                self.set(id, "Overridden", flag(annotated || self.overrides(node, named, arity)));
                self.set(id, "MainMethod", flag(entry));
                self.set(id, "Visibility", text(Self::visibility(&effective)));
            }
            "constructor_declaration" | "compact_constructor_declaration" => {
                let compact = node.kind() == "compact_constructor_declaration";
                let id = self.at(parent, if compact { "CompactConstructorDeclaration" } else { "ConstructorDeclaration" }, node);
                let effective = self.modifiers(id, node, if owner == Owner::Enum { &["private"] } else { &[] });
                if let Some(parameters) = node.field("type_parameters") {
                    self.type_parameters(id, parameters);
                }
                let (arity, varargs) = node.field("parameters").map_or((0, false), |parameters| self.formal_parameters(id, parameters));
                if let Some(throws) = find(node, "throws") {
                    let list = self.at(id, "ThrowsList", throws);
                    for thrown in kids(throws) {
                        self.ty(list, thrown);
                    }
                    self.sized(list);
                }
                if let Some(body) = node.field("body") {
                    self.block(id, body);
                }
                let name = node.field("name");
                self.nodes[id as usize].report = name.map(|name| (name.start_byte(), name.end_byte()));
                self.set(id, "Image", text(name.map(|name| self.text(name)).unwrap_or_default()));
                if !compact {
                    self.set(id, "Name", text(name.map(|name| self.text(name)).unwrap_or_default()));
                    self.set(id, "Abstract", flag(false));
                    self.set(id, "Static", flag(false));
                }
                if !compact {
                    self.set(id, "Arity", Value::Whole(arity as i64));
                    self.set(id, "Varargs", flag(varargs));
                }
                self.set(id, "Visibility", text(Self::visibility(&effective)));
            }
            "static_initializer" | "block" => {
                let id = self.at(parent, "Initializer", node);
                self.set(id, "Static", flag(node.kind() == "static_initializer"));
                let body = if node.kind() == "block" { Some(node) } else { find(node, "block") };
                if let Some(body) = body {
                    self.block(id, body);
                }
            }
            kind if TYPE_DECLARATIONS.contains(&kind) => {
                self.type_declaration(parent, node, Some(owner), false);
            }
            _ => {}
        }
    }

    /// A method with that name and parameter count exists in a supertype of the class around the declaration.
    fn overrides(&self, method: Node, name: &str, arity: usize) -> bool {
        let Some(own) = crate::java::types::scope::enclosing_type(self.file, self.resolver.scope, method) else { return false };
        let index = self.resolver.index;
        let variables = index.get(&own).map(|info| info.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect()).unwrap_or_default();
        let receiver = Type::Class(own.clone(), variables);
        let written: Vec<Option<Type>> = method
            .field("parameters")
            .map(kids)
            .unwrap_or_default()
            .into_iter()
            .filter(|kid| matches!(kid.kind(), "formal_parameter" | "spread_parameter"))
            .map(|kid| {
                if kid.kind() == "spread_parameter" {
                    let written = kids(kid).into_iter().find(|part| !matches!(part.kind(), "modifiers" | "variable_declarator"));
                    written.and_then(|written| self.resolver.type_node(written)).map(|kind| Type::Array(Box::new(kind)))
                } else {
                    self.resolver.declared_type(kid, None)
                }
            })
            .collect();
        let interface = index.get(&own).is_some_and(|info| info.is_interface);
        let package = index.get(&own).map(|info| info.package.clone()).unwrap_or_default();
        index
            .lineage(&own)
            .iter()
            .skip(1)
            .filter(|ancestor| !(interface && ancestor.as_str() == "java.lang.Object"))
            .filter_map(|ancestor| index.get(ancestor))
            .any(|info| {
                let map = index.member_map(&receiver, &info.name);
                info.methods.iter().any(|known| {
                    known.name == name
                        && known.parameters.len() == arity
                        && !(known.package_private && info.package != package)
                        && !known.is_static
                        && !known.is_private
                        && known.generic_parameters.iter().zip(&written).all(|(theirs, ours)| {
                            let theirs = theirs.substitute(&map);
                            ours.as_ref().is_none_or(|ours| {
                                matches!(theirs, Type::Variable(_)) || theirs.erased().name() == ours.erased().name()
                            })
                        })
                })
            })
    }

    fn block(&mut self, parent: u32, node: Node<'t>) -> u32 {
        let id = self.at(parent, "Block", node);
        for kid in children(node) {
            if kid.kind() == ";" {
                self.at(id, "EmptyStatement", kid);
            } else if kid.is_named() && !kid.kind().ends_with("comment") {
                self.stmt(id, kid);
            }
        }
        self.sized(id);
        id
    }

    fn local(&mut self, parent: u32, node: Node<'t>, implicit: &[&'static str]) -> u32 {
        let id = self.at(parent, "LocalVariableDeclaration", node);
        let effective = self.modifiers(id, node, implicit);
        let written = node.field("type");
        let inferred = written.is_none_or(|written| self.text(written) == "var");
        if let Some(written) = written.filter(|_| !inferred) {
            self.ty(id, written);
        }
        self.set(id, "TypeInferred", flag(inferred));
        self.set(id, "Visibility", text("local"));
        self.set(id, "Final", flag(effective.contains(&"final")));
        let declarators = fields(node, "declarator");
        if declarators.is_empty() {
            // A resource or a for-each variable: name and value are on the declaration itself.
            if let Some(name) = node.field("name") {
                let value = node.field("value").filter(|_| node.kind() == "resource");
                let end = value.map_or(name.end_byte(), |value| value.end_byte());
                let declarator = self.open(id, "VariableDeclarator", None, name.start_byte(), end);
                self.set(declarator, "Name", text(self.text(name)));
                self.set(declarator, "Initializer", flag(value.is_some()));
                let dims = node.field("dimensions");
                let variable = self.open(declarator, "VariableId", Some(name), name.start_byte(), dims.map_or(name.end_byte(), |dims| dims.end_byte()));
                self.variable_flags(variable, self.text(name), false, false, "local", effective.contains(&"final"));
                if let Some(value) = value {
                    self.expr(declarator, value);
                }
                if node.kind() != "resource" {
                    self.nodes[id as usize].end = name.end_byte();
                }
            }
        }
        for declarator in declarators {
            self.declarator(id, declarator, false, false, "local", effective.contains(&"final"));
        }
        let first = self.nodes[id as usize]
            .children
            .iter()
            .filter(|kid| self.nodes[**kid as usize].name == "VariableDeclarator")
            .find_map(|kid| self.nodes[*kid as usize].children.first().copied());
        self.nodes[id as usize].report = first.map(|first| (self.nodes[first as usize].start, self.nodes[first as usize].end));
        id
    }

    /// The expression inside the parentheses a statement requires around its condition.
    fn condition(&mut self, parent: u32, node: Node<'t>) {
        let inner = if node.kind() == "parenthesized_expression" { kids(node).first().copied().unwrap_or(node) } else { node };
        self.expr(parent, inner);
    }

    fn labelled(&mut self, id: u32, node: Node<'t>) {
        if let Some(label) = kids(node).into_iter().find(|kid| kid.kind() == "identifier") {
            self.set(id, "Label", text(self.text(label)));
            self.set(id, "Image", text(self.text(label)));
        }
    }

    fn stmt(&mut self, parent: u32, node: Node<'t>) {
        match node.kind() {
            "block" | "constructor_body" => {
                self.block(parent, node);
            }
            "local_variable_declaration" => {
                self.local(parent, node, &[]);
            }
            "expression_statement" => {
                let id = self.at(parent, "ExpressionStatement", node);
                if let Some(inner) = kids(node).first() {
                    self.expr(id, *inner);
                }
            }
            "if_statement" => {
                let id = self.at(parent, "IfStatement", node);
                self.set(id, "Else", flag(node.field("alternative").is_some()));
                for (field, plain) in [("condition", true), ("consequence", false), ("alternative", false)] {
                    match node.field(field) {
                        Some(part) if plain => self.condition(id, part),
                        Some(part) => self.stmt(id, part),
                        None => {}
                    }
                }
            }
            "while_statement" | "do_statement" => {
                let id = self.at(parent, if node.kind() == "do_statement" { "DoStatement" } else { "WhileStatement" }, node);
                let (condition, body) = (node.field("condition"), node.field("body"));
                if node.kind() == "do_statement" {
                    body.into_iter().for_each(|body| self.stmt(id, body));
                    condition.into_iter().for_each(|condition| self.condition(id, condition));
                } else {
                    condition.into_iter().for_each(|condition| self.condition(id, condition));
                    body.into_iter().for_each(|body| self.stmt(id, body));
                }
            }
            "for_statement" => {
                let id = self.at(parent, "ForStatement", node);
                let inits = fields(node, "init");
                if let (Some(first), Some(last)) = (inits.first(), inits.last()) {
                    let declares = first.kind() == "local_variable_declaration";
                    let end = if declares { fields(*first, "declarator").last().map_or(last.end_byte(), |last| last.end_byte()) } else { last.end_byte() };
                    let init = self.open(id, "ForInit", None, first.start_byte(), end);
                    if declares {
                        self.local(init, *first, &[]);
                    } else {
                        let list = self.open(init, "StatementExpressionList", None, first.start_byte(), last.end_byte());
                        for init in &inits {
                            self.expr(list, *init);
                        }
                        self.sized(list);
                    }
                }
                if let Some(condition) = node.field("condition") {
                    self.expr(id, condition);
                }
                let updates = fields(node, "update");
                if let (Some(first), Some(last)) = (updates.first(), updates.last()) {
                    let update = self.open(id, "ForUpdate", None, first.start_byte(), last.end_byte());
                    let list = self.open(update, "StatementExpressionList", None, first.start_byte(), last.end_byte());
                    for update in &updates {
                        self.expr(list, *update);
                    }
                    self.sized(list);
                }
                if let Some(body) = node.field("body") {
                    self.stmt(id, body);
                }
            }
            "enhanced_for_statement" => {
                let id = self.at(parent, "ForeachStatement", node);
                let declaration = self.local(id, node, &[]);
                let start = find(node, "modifiers").or(node.field("type")).map_or(node.start_byte(), |first| first.start_byte());
                self.nodes[declaration as usize].start = start;
                self.nodes[declaration as usize].source = None;
                if let Some(value) = node.field("value") {
                    self.expr(id, value);
                }
                if let Some(body) = node.field("body") {
                    self.stmt(id, body);
                }
            }
            "return_statement" | "throw_statement" | "yield_statement" | "assert_statement" => {
                let name = match node.kind() {
                    "return_statement" => "ReturnStatement",
                    "throw_statement" => "ThrowStatement",
                    "yield_statement" => "YieldStatement",
                    _ => "AssertStatement",
                };
                let id = self.at(parent, name, node);
                for kid in kids(node) {
                    self.expr(id, kid);
                }
            }
            "break_statement" | "continue_statement" => {
                let id = self.at(parent, if node.kind() == "break_statement" { "BreakStatement" } else { "ContinueStatement" }, node);
                self.labelled(id, node);
            }
            "labeled_statement" => {
                let id = self.at(parent, "LabeledStatement", node);
                self.labelled(id, node);
                if let Some(inner) = kids(node).into_iter().nth(1) {
                    self.stmt(id, inner);
                }
            }
            "synchronized_statement" => {
                let id = self.at(parent, "SynchronizedStatement", node);
                for kid in kids(node) {
                    if kid.kind() == "block" {
                        self.block(id, kid);
                    } else {
                        self.condition(id, kid);
                    }
                }
            }
            "try_statement" | "try_with_resources_statement" => {
                let id = self.at(parent, "TryStatement", node);
                if let Some(resources) = node.field("resources") {
                    let list = self.at(id, "ResourceList", resources);
                    for kid in kids(resources) {
                        let resource = self.at(list, "Resource", kid);
                        if kid.kind() == "resource" && kid.field("name").is_some() {
                            self.local(resource, kid, &["final"]);
                            self.set(resource, "ConciseResource", flag(false));
                        } else {
                            let inner = if kid.kind() == "resource" { kids(kid).first().copied().unwrap_or(kid) } else { kid };
                            self.expr(resource, inner);
                            self.set(resource, "ConciseResource", flag(true));
                        }
                    }
                    self.sized(list);
                }
                for kid in kids(node) {
                    match kid.kind() {
                        "block" => {
                            self.block(id, kid);
                        }
                        "catch_clause" => {
                            let clause = self.at(id, "CatchClause", kid);
                            if let Some(parameter) = find(kid, "catch_formal_parameter") {
                                let caught = self.at(clause, "CatchParameter", parameter);
                                let effective = self.modifiers(caught, parameter, &[]);
                                let types = find(parameter, "catch_type").map(kids).unwrap_or_default();
                                self.set(caught, "Multicatch", flag(types.len() > 1));
                                if let [only] = types.as_slice() {
                                    self.ty(caught, *only);
                                } else if let (Some(first), Some(last)) = (types.first(), types.last()) {
                                    let union = self.open(caught, "UnionType", None, first.start_byte(), last.end_byte());
                                    for written in &types {
                                        self.ty(union, *written);
                                    }
                                }
                                if let Some(name) = parameter.field("name") {
                                    let variable = self.at(caught, "VariableId", name);
                                    self.variable_flags(variable, self.text(name), false, false, "package", effective.contains(&"final"));
                                    self.set(caught, "Name", text(self.text(name)));
                                }
                                self.set(caught, "Visibility", text("package"));
                            }
                            if let Some(body) = kid.field("body") {
                                self.block(clause, body);
                            }
                        }
                        "finally_clause" => {
                            let clause = self.at(id, "FinallyClause", kid);
                            if let Some(body) = find(kid, "block") {
                                self.block(clause, body);
                            }
                        }
                        _ => {}
                    }
                }
            }
            "switch_expression" => {
                self.switch(parent, node, "SwitchStatement");
            }
            "explicit_constructor_invocation" => {
                let id = self.at(parent, "ExplicitConstructorInvocation", node);
                let target = node.field("constructor").map(|part| part.kind());
                if let Some(object) = node.field("object") {
                    self.expr(id, object);
                }
                if let Some(arguments) = node.field("type_arguments") {
                    self.type_arguments(id, arguments);
                }
                let count = node.field("arguments").map_or(0, |arguments| self.arguments(id, arguments));
                self.set(id, "MethodName", text("new"));
                self.set(id, "This", flag(target == Some("this")));
                self.set(id, "Super", flag(target == Some("super")));
                self.set(id, "ArgumentCount", Value::Whole(count as i64));
            }
            ";" => {
                self.at(parent, "EmptyStatement", node);
            }
            kind if TYPE_DECLARATIONS.contains(&kind) => {
                let id = self.at(parent, "LocalClassStatement", node);
                self.type_declaration(id, node, None, true);
            }
            _ => {}
        }
    }

    fn switch(&mut self, parent: u32, node: Node<'t>, name: &'static str) -> u32 {
        let id = self.at(parent, name, node);
        if let Some(condition) = node.field("condition") {
            self.condition(id, condition);
        }
        let Some(body) = node.field("body") else { return id };
        let tested = node.field("condition");
        let mut seen: Vec<u32> = Vec::new();
        for group in kids(body) {
            let parts = kids(group);
            let labels: Vec<Node> = parts.iter().filter(|part| part.kind() == "switch_label").copied().collect();
            let arrow = group.kind() == "switch_rule";
            for (position, label) in labels.iter().enumerate() {
                let last = position + 1 == labels.len();
                let end = if last { group.end_byte() } else { label.end_byte() + 1 };
                let branch = self.open(id, if arrow { "SwitchArrowBranch" } else { "SwitchFallthroughBranch" }, None, label.start_byte(), end);
                // `case null, default` is the default label too; the grammar reads its `default` as a name.
                let default = self.text(*label).trim_start().starts_with("default") || kids(*label).iter().any(|part| self.text(*part) == "default");
                self.set(branch, "Default", flag(default));
                let written = self.at(branch, "SwitchLabel", *label);
                self.set(written, "Default", flag(default));
                seen.push(written);
                let constants: Vec<Node<'t>> = kids(*label).into_iter().filter(|part| self.text(*part) != "default").collect();
                for constant in constants {
                    match constant.kind() {
                        "guard" => {
                            let guard = self.at(written, "Guard", constant);
                            kids(constant).first().into_iter().for_each(|inner| {
                                self.expr(guard, *inner);
                            });
                        }
                        "pattern" | "type_pattern" | "record_pattern" => {
                            self.pattern(written, constant);
                        }
                        _ => {
                            self.expr(written, constant);
                        }
                    }
                }
                if !last {
                    continue;
                }
                for part in parts.iter().filter(|part| part.kind() != "switch_label") {
                    if arrow && part.kind() == "expression_statement" {
                        kids(*part).first().into_iter().for_each(|inner| {
                            self.expr(branch, *inner);
                        });
                    } else {
                        self.stmt(branch, *part);
                    }
                }
            }
        }
        self.switch_facts(id, tested, &seen);
        id
    }

    /// The attributes of a switch that look at all its labels at once.
    fn switch_facts(&mut self, id: u32, tested: Option<Node<'t>>, labels: &[u32]) {
        const PATTERNS: &[&str] = &["TypePattern", "RecordPattern", "UnnamedPattern"];
        let mut default_case = false;
        let mut any_pattern = false;
        let mut count = 0;
        let mut written: Vec<Node<'t>> = Vec::new();
        for label in labels {
            let kids = self.nodes[*label as usize].children.clone();
            let patterned = kids.iter().any(|kid| PATTERNS.contains(&self.nodes[*kid as usize].name));
            self.set(*label, "PatternLabel", flag(patterned));
            default_case |= self.is(*label, "Default");
            any_pattern |= patterned;
            count += kids.len();
            for kid in kids.iter().filter(|kid| self.nodes[**kid as usize].name == "TypePattern") {
                let kind = self.nodes[*kid as usize].children.iter().find(|part| self.nodes[**part as usize].name != "ModifierList");
                written.extend(kind.and_then(|kind| self.nodes[*kind as usize].source));
            }
        }
        let tested = tested.map(|tested| if tested.kind() == "parenthesized_expression" { kids(tested).first().copied().unwrap_or(tested) } else { tested });
        let facts = super::switches::facts(self.resolver, tested, default_case, any_pattern, count, &written);
        self.set(id, "DefaultCase", flag(facts.default_case));
        self.set(id, "ExhaustiveEnumSwitch", flag(facts.exhaustive_enum));
        self.set(id, "Exhaustive", flag(facts.exhaustive));
    }

    fn pattern(&mut self, parent: u32, node: Node<'t>) {
        match node.kind() {
            "pattern" => {
                kids(node).first().into_iter().for_each(|inner| self.pattern(parent, *inner));
            }
            "record_pattern" => {
                let id = self.at(parent, "RecordPattern", node);
                for kid in kids(node) {
                    match kid.kind() {
                        "record_pattern_body" => {
                            let list = self.at(id, "PatternList", kid);
                            for part in kids(kid) {
                                let inner = if part.kind() == "record_pattern_component" { kids(part) } else { vec![part] };
                                if inner.len() == 2 {
                                    let typed = self.at(list, "TypePattern", part);
                                    self.modifiers(typed, part, &[]);
                                    self.set(typed, "Visibility", text("package"));
                                    if self.text(inner[0]) != "var" {
                                        self.ty(typed, inner[0]);
                                    }
                                    let variable = self.at(typed, "VariableId", inner[1]);
                                    self.variable_flags(variable, self.text(inner[1]), false, false, "local", false);
                                } else {
                                    inner.first().into_iter().for_each(|only| self.pattern(list, *only));
                                }
                            }
                            self.sized(list);
                        }
                        _ => {
                            self.ty(id, kid);
                        }
                    }
                }
            }
            _ => {
                let id = self.at(parent, "TypePattern", node);
                self.modifiers(id, node, &[]);
                self.set(id, "Visibility", text("package"));
                let parts = kids(node);
                let name = parts.iter().rev().find(|part| part.kind() == "identifier").copied();
                if let Some(written) = parts.iter().find(|part| part.kind() != "modifiers" && Some(**part) != name) {
                    self.ty(id, *written);
                }
                if let Some(name) = name {
                    let variable = self.at(id, "VariableId", name);
                    self.variable_flags(variable, self.text(name), false, false, "local", false);
                }
            }
        }
    }

    fn arguments(&mut self, parent: u32, node: Node<'t>) -> usize {
        let id = self.at(parent, "ArgumentList", node);
        for kid in kids(node) {
            self.expr(id, kid);
        }
        self.sized(id);
        self.nodes[id as usize].children.len()
    }

    fn access(&self, node: Node) -> &'static str {
        let mut inner = node;
        let mut holder = crate::engine::source::parent(node);
        while let Some(outer) = holder.filter(|outer| outer.kind() == "parenthesized_expression") {
            inner = outer;
            holder = crate::engine::source::parent(outer);
        }
        match holder {
            Some(outer) if outer.kind() == "update_expression" => "WRITE",
            Some(outer) if outer.kind() == "assignment_expression" && outer.field("left") == Some(inner) => "WRITE",
            _ => "READ",
        }
    }

    fn type_expression(&mut self, parent: u32, node: Node<'t>) -> u32 {
        let id = self.at(parent, "TypeExpression", node);
        self.set(id, "CompileTimeConstant", flag(false));
        self.set(id, "Parenthesized", flag(false));
        if matches!(node.kind(), "identifier" | "field_access" | "scoped_identifier") {
            self.named_type(id, node);
        } else {
            self.ty(id, node);
        }
        id
    }

    /// What stands before the dot of a member access: a value, or a type when the name means a class.
    fn qualifier(&mut self, parent: u32, node: Node<'t>) -> u32 {
        match node.kind() {
            "identifier" | "field_access" | "scoped_identifier" => {
                let written: String = self.text(node).split_whitespace().collect();
                let first = written.split('.').next().unwrap_or_default();
                match self.resolver.receiver(node) {
                    Some(Receiver::Static(_)) => self.type_expression(parent, node),
                    Some(Receiver::Value(_)) => self.expr(parent, node),
                    None if self.resolver.is_variable(node, first) => self.expr(parent, node),
                    None if node.kind() == "identifier" && !written.starts_with(char::is_uppercase) => {
                        let id = self.at(parent, "AmbiguousName", node);
                        self.set(id, "Name", text(&written));
                        self.set(id, "Image", text(&written));
                        self.set(id, "CompileTimeConstant", flag(false));
                        self.set(id, "Parenthesized", flag(false));
                        id
                    }
                    None if written.rsplit('.').next().is_some_and(|last| last.starts_with(char::is_uppercase)) => self.type_expression(parent, node),
                    None => self.expr(parent, node),
                }
            }
            "generic_type" | "array_type" | "integral_type" | "floating_point_type" | "boolean_type" | "type_identifier"
            | "scoped_type_identifier" => self.type_expression(parent, node),
            _ => self.expr(parent, node),
        }
    }

    pub fn expr(&mut self, parent: u32, node: Node<'t>) -> u32 {
        let mut inner = node;
        let mut depth = 0;
        while inner.kind() == "parenthesized_expression" {
            let Some(next) = kids(inner).first().copied() else { break };
            inner = next;
            depth += 1;
        }
        let id = self.plain(parent, inner);
        if self.nodes[id as usize].name != "AmbiguousName" {
            self.set(id, "Parenthesized", flag(depth > 0));
            if depth > 0 {
                self.set(id, "ParenthesisDepth", Value::Whole(depth));
                self.nodes[id as usize].start = node.start_byte();
                self.nodes[id as usize].end = node.end_byte();
            }
            if self.get(id, "CompileTimeConstant").is_none() {
                let constant = self.constant(id);
                self.set(id, "CompileTimeConstant", flag(constant));
            }
        }
        id
    }

    /// Whether an operator expression is made of compile-time constants only.
    fn constant(&self, id: u32) -> bool {
        let node = &self.nodes[id as usize];
        let all = |from: usize| node.children[from..].iter().all(|child| self.is(*child, "CompileTimeConstant"));
        match node.name {
            "InfixExpression" => !matches!(self.get(id, "Operator"), Some(Value::Text(sign)) if &**sign == "instanceof") && all(0),
            "UnaryExpression" => !matches!(self.get(id, "Operator"), Some(Value::Text(sign)) if &**sign == "++" || &**sign == "--") && all(0),
            "ConditionalExpression" | "ArrayInitializer" => all(0),
            "CastExpression" => {
                let simple = node.children.first().is_some_and(|written| {
                    let written = &self.nodes[*written as usize];
                    written.name == "PrimitiveType" || written.attributes.iter().any(|(key, value)| *key == "SimpleName" && matches!(value, Value::Text(name) if &**name == "String"))
                });
                simple && all(1)
            }
            "VariableAccess" | "FieldAccess" => node.source.is_some_and(|source| self.resolver.constant_field(source)),
            _ => false,
        }
    }

    fn number(&mut self, id: u32, node: Node<'t>) {
        let image = self.text(node);
        let digits: String = image.chars().filter(|c| *c != '_').collect::<String>().to_lowercase();
        let whole = !node.kind().contains("floating");
        let long = whole && digits.ends_with('l');
        let body = digits.trim_end_matches('l');
        let (as_whole, as_real) = if whole {
            let parsed = if let Some(hex) = body.strip_prefix("0x") {
                u64::from_str_radix(hex, 16)
            } else if let Some(binary) = body.strip_prefix("0b") {
                u64::from_str_radix(binary, 2)
            } else if body.len() > 1 && body.starts_with('0') {
                u64::from_str_radix(&body[1..], 8)
            } else {
                body.parse::<u64>()
            }
            .unwrap_or(0);
            let value = if long { parsed as i64 } else { parsed as u32 as i32 as i64 };
            (value, if long { value as f64 } else { parsed as f64 })
        } else if let Some(hex) = body.strip_prefix("0x") {
            let (digits, power) = hex.trim_end_matches(['f', 'd']).split_once('p').unwrap_or((hex, "0"));
            let (whole, fraction) = digits.split_once('.').unwrap_or((digits, ""));
            let mantissa = u64::from_str_radix(&format!("{whole}{fraction}"), 16).unwrap_or(0) as f64;
            let real = mantissa * 2f64.powi(power.parse::<i32>().unwrap_or(0) - 4 * fraction.len() as i32);
            (real as i64 as i32 as i64, real)
        } else {
            let real = body.trim_end_matches(['f', 'd']).parse::<f64>().unwrap_or(0.0);
            (real as i64 as i32 as i64, real)
        };
        self.set(id, "Image", text(image));
        self.set(id, "IntLiteral", flag(whole && !long));
        self.set(id, "LongLiteral", flag(long));
        self.set(id, "FloatLiteral", flag(!whole && digits.ends_with('f')));
        self.set(id, "DoubleLiteral", flag(!whole && !digits.ends_with('f')));
        self.set(id, "ValueAsInt", Value::Whole(as_whole as i32 as i64));
        self.set(id, "ValueAsLong", Value::Whole(as_whole));
        self.set(id, "ValueAsDouble", Value::Real(as_real));
        self.set(id, "CompileTimeConstant", flag(true));
    }

    fn plain(&mut self, parent: u32, node: Node<'t>) -> u32 {
        match node.kind() {
            "decimal_integer_literal" | "hex_integer_literal" | "octal_integer_literal" | "binary_integer_literal"
            | "decimal_floating_point_literal" | "hex_floating_point_literal" => {
                let id = self.at(parent, "NumericLiteral", node);
                self.number(id, node);
                id
            }
            "string_literal" => {
                let id = self.at(parent, "StringLiteral", node);
                let image = self.text(node);
                let value = literal_text(self.file, node).unwrap_or_default();
                self.set(id, "Image", text(&unicode_unescaped(image)));
                self.set(id, "Length", Value::Whole(value.encode_utf16().count() as i64));
                self.set(id, "Empty", flag(value.is_empty()));
                self.set(id, "TextBlock", flag(image.starts_with("\"\"\"")));
                self.set(id, "ConstValue", text(&value));
                self.set(id, "CompileTimeConstant", flag(true));
                id
            }
            "character_literal" => {
                let id = self.at(parent, "CharLiteral", node);
                self.set(id, "Image", text(&unicode_unescaped(self.text(node))));
                self.set(id, "CompileTimeConstant", flag(true));
                id
            }
            "true" | "false" => {
                let id = self.at(parent, "BooleanLiteral", node);
                self.set(id, "True", flag(node.kind() == "true"));
                self.set(id, "CompileTimeConstant", flag(true));
                id
            }
            "null_literal" => self.at(parent, "NullLiteral", node),
            "identifier" => {
                let id = self.at(parent, "VariableAccess", node);
                self.set(id, "Name", text(self.text(node)));
                self.set(id, "Image", text(self.text(node)));
                self.set(id, "AccessType", text(self.access(node)));
                id
            }
            "this" => self.at(parent, "ThisExpression", node),
            "super" => self.at(parent, "SuperExpression", node),
            "field_access" | "scoped_identifier" => {
                let parts = kids(node);
                let (Some(object), Some(field)) = (parts.first().copied(), parts.last().copied()) else {
                    return self.at(parent, "FieldAccess", node);
                };
                if field.kind() == "this" {
                    let id = self.at(parent, "ThisExpression", node);
                    self.named_type(id, object);
                    return id;
                }
                let id = self.at(parent, "FieldAccess", node);
                if parts.iter().any(|part| part.kind() == "super") && object.kind() != "super" {
                    let end = parts.iter().find(|part| part.kind() == "super").map_or(object.end_byte(), |keyword| keyword.end_byte());
                    let qualified = self.open(id, "SuperExpression", None, object.start_byte(), end);
                    self.set(qualified, "CompileTimeConstant", flag(false));
                    self.set(qualified, "Parenthesized", flag(false));
                    self.named_type(qualified, object);
                } else {
                    self.qualifier(id, object);
                }
                self.set(id, "Name", text(self.text(field)));
                self.set(id, "Image", text(self.text(field)));
                self.set(id, "AccessType", text(self.access(node)));
                id
            }
            "method_invocation" => {
                let id = self.at(parent, "MethodCall", node);
                let name = node.field("name").map(|name| self.text(name)).unwrap_or_default();
                let lifted = children(node).into_iter().find(|part| part.kind() == "super");
                match (node.field("object"), lifted) {
                    (Some(object), Some(keyword)) if object != keyword => {
                        let qualified = self.open(id, "SuperExpression", None, object.start_byte(), keyword.end_byte());
                        self.set(qualified, "CompileTimeConstant", flag(false));
                        self.set(qualified, "Parenthesized", flag(false));
                        self.named_type(qualified, object);
                    }
                    (Some(object), _) => {
                        self.qualifier(id, object);
                    }
                    _ => {}
                }
                if let Some(arguments) = node.field("type_arguments") {
                    self.type_arguments(id, arguments);
                }
                if let Some(arguments) = node.field("arguments") {
                    self.arguments(id, arguments);
                }
                self.set(id, "MethodName", text(name));
                self.set(id, "Image", text(name));
                id
            }
            "object_creation_expression" => {
                let id = self.at(parent, "ConstructorCall", node);
                let parts = children(node);
                let keyword = parts.iter().position(|part| part.kind() == "new").unwrap_or(0);
                if let Some(object) = parts[..keyword].iter().find(|part| part.is_named() && !part.kind().ends_with("comment")) {
                    self.expr(id, *object);
                }
                if let Some(arguments) = node.field("type_arguments") {
                    self.type_arguments(id, arguments);
                }
                if let Some(written) = node.field("type") {
                    self.ty(id, written);
                }
                if let Some(arguments) = node.field("arguments") {
                    self.arguments(id, arguments);
                }
                let body = find(node, "class_body");
                if let Some(body) = body {
                    self.anonymous(id, body, false);
                }
                self.set(id, "MethodName", text("new"));
                self.set(id, "AnonymousClass", flag(body.is_some()));
                id
            }
            "array_creation_expression" => {
                let id = self.at(parent, "ArrayAllocation", node);
                let dims: Vec<Node> = kids(node).into_iter().filter(|kid| matches!(kid.kind(), "dimensions_expr" | "dimensions")).collect();
                let mut depth = 0;
                if let Some(element) = node.field("type") {
                    let end = dims.last().map_or(element.end_byte(), |last| last.end_byte());
                    let array = self.open(id, "ArrayType", None, element.start_byte(), end);
                    let written = self.ty(array, element);
                    let notes: Vec<Node<'t>> = kids(node).into_iter().filter(|part| matches!(part.kind(), "marker_annotation" | "annotation")).collect();
                    if let Some(first) = notes.first() {
                        self.nodes[array as usize].start = first.start_byte();
                    }
                    self.annotate(written, &notes);
                    if let (Some(first), Some(last)) = (dims.first(), dims.last()) {
                        let list = self.open(array, "ArrayDimensions", None, first.start_byte(), last.end_byte());
                        for dim in &dims {
                            if dim.kind() == "dimensions_expr" {
                                let sized = self.at(list, "ArrayDimExpr", *dim);
                                self.set(sized, "Varargs", flag(false));
                                kids(*dim).last().into_iter().for_each(|length| {
                                    self.expr(sized, *length);
                                });
                            } else {
                                let written = self.text(*dim);
                                for (offset, _) in written.match_indices('[') {
                                    let close = written[offset..].find(']').map_or(written.len(), |close| offset + close + 1);
                                    let plain = self.open(list, "ArrayTypeDim", None, dim.start_byte() + offset, dim.start_byte() + close);
                                    self.set(plain, "Varargs", flag(false));
                                }
                            }
                        }
                        self.sized(list);
                        depth = self.nodes[list as usize].children.len();
                    }
                    self.set(array, "ArrayDepth", Value::Whole(depth as i64));
                }
                if let Some(value) = node.field("value") {
                    self.expr(id, value);
                }
                self.set(id, "ArrayDepth", Value::Whole(depth as i64));
                id
            }
            "array_initializer" => {
                let id = self.at(parent, "ArrayInitializer", node);
                for kid in kids(node) {
                    self.expr(id, kid);
                }
                let length = self.nodes[id as usize].children.len() as i64;
                self.set(id, "Length", Value::Whole(length));
                id
            }
            "array_access" => {
                let id = self.at(parent, "ArrayAccess", node);
                for field in ["array", "index"] {
                    if let Some(part) = node.field(field) {
                        self.expr(id, part);
                    }
                }
                self.set(id, "AccessType", text(self.access(node)));
                id
            }
            "binary_expression" => {
                let id = self.at(parent, "InfixExpression", node);
                let operator = node.field("operator").map(|sign| self.text(sign)).unwrap_or_default();
                self.set(id, "Operator", text(operator));
                for field in ["left", "right"] {
                    if let Some(part) = node.field(field) {
                        self.expr(id, part);
                    }
                }
                id
            }
            "instanceof_expression" => {
                let id = self.at(parent, "InfixExpression", node);
                self.set(id, "Operator", text("instanceof"));
                if let Some(left) = node.field("left") {
                    self.expr(id, left);
                }
                let (written, name, pattern) = (node.field("right"), node.field("name"), node.field("pattern"));
                match (written, name, pattern) {
                    (Some(written), Some(name), _) => {
                        let start = children(node).iter().find(|part| part.kind() == "final").map_or(written.start_byte(), |part| part.start_byte());
                        let wrapper = self.open(id, "PatternExpression", None, start, name.end_byte());
                        self.set(wrapper, "CompileTimeConstant", flag(false));
                        self.set(wrapper, "Parenthesized", flag(false));
                        let typed = self.open(wrapper, "TypePattern", None, start, name.end_byte());
                        self.set(typed, "Visibility", text("package"));
                        let list = self.open(typed, "ModifierList", None, start, written.start_byte().min(start + 5));
                        let fixed = start != written.start_byte();
                        let listed = if fixed { vec!["final".to_string()] } else { Vec::new() };
                        self.set(list, "ExplicitModifiers", Value::List(listed.clone()));
                        self.set(list, "EffectiveModifiers", Value::List(listed));
                        self.ty(typed, written);
                        let variable = self.at(typed, "VariableId", name);
                        self.variable_flags(variable, self.text(name), false, false, "local", fixed);
                    }
                    (_, _, Some(pattern)) => {
                        let wrapper = self.at(id, "PatternExpression", pattern);
                        self.set(wrapper, "CompileTimeConstant", flag(false));
                        self.set(wrapper, "Parenthesized", flag(false));
                        self.pattern(wrapper, pattern);
                    }
                    (Some(written), None, None) => {
                        self.type_expression(id, written);
                    }
                    _ => {}
                }
                id
            }
            "unary_expression" | "update_expression" => {
                let id = self.at(parent, "UnaryExpression", node);
                let sign = children(node).into_iter().find(|part| !part.is_named()).map(|sign| self.text(sign)).unwrap_or_default();
                let operand = kids(node).first().copied();
                self.set(id, "Operator", text(sign));
                self.set(id, "Prefix", flag(operand.is_none_or(|operand| operand.start_byte() > node.start_byte())));
                if let Some(operand) = operand {
                    self.expr(id, operand);
                }
                id
            }
            "assignment_expression" => {
                let id = self.at(parent, "AssignmentExpression", node);
                let operator = node.field("operator").map(|sign| self.text(sign)).unwrap_or_default();
                self.set(id, "Operator", text(operator));
                self.set(id, "Compound", flag(operator != "="));
                for field in ["left", "right"] {
                    if let Some(part) = node.field(field) {
                        self.expr(id, part);
                    }
                }
                id
            }
            "ternary_expression" => {
                let id = self.at(parent, "ConditionalExpression", node);
                for field in ["condition", "consequence", "alternative"] {
                    if let Some(part) = node.field(field) {
                        self.expr(id, part);
                    }
                }
                id
            }
            "cast_expression" => {
                let id = self.at(parent, "CastExpression", node);
                let value = node.field("value");
                let types: Vec<Node> = kids(node).into_iter().filter(|kid| Some(*kid) != value).collect();
                if let [only] = types.as_slice() {
                    self.ty(id, *only);
                } else if let (Some(first), Some(last)) = (types.first(), types.last()) {
                    let both = self.open(id, "IntersectionType", None, first.start_byte(), last.end_byte());
                    for written in &types {
                        self.ty(both, *written);
                    }
                }
                if let Some(value) = value {
                    self.expr(id, value);
                }
                id
            }
            "lambda_expression" => {
                let id = self.at(parent, "LambdaExpression", node);
                let mut arity = 0;
                if let Some(parameters) = node.field("parameters") {
                    let list = self.at(id, "LambdaParameterList", parameters);
                    let listed = if parameters.kind() == "identifier" { vec![parameters] } else { kids(parameters) };
                    for parameter in listed {
                        let entry = self.at(list, "LambdaParameter", parameter);
                        if parameter.kind() == "identifier" {
                            let modifiers = self.open(entry, "ModifierList", None, parameter.start_byte(), parameter.start_byte());
                            self.set(modifiers, "ExplicitModifiers", Value::List(Vec::new()));
                            self.set(modifiers, "EffectiveModifiers", Value::List(Vec::new()));
                            let variable = self.at(entry, "VariableId", parameter);
                            self.variable_flags(variable, self.text(parameter), false, false, "package", false);
                            self.set(entry, "Visibility", text("package"));
                            self.set(entry, "Final", flag(false));
                        } else {
                            self.parameter_parts(entry, parameter, &[], "package", false);
                        }
                        arity += 1;
                    }
                    self.sized(list);
                }
                let body = node.field("body");
                match body {
                    Some(body) if body.kind() == "block" => {
                        self.block(id, body);
                    }
                    Some(body) => {
                        self.expr(id, body);
                    }
                    None => {}
                }
                self.set(id, "Arity", Value::Whole(arity));
                self.set(id, "BlockBody", flag(body.is_some_and(|body| body.kind() == "block")));
                self.set(id, "ExpressionBody", flag(body.is_some_and(|body| body.kind() != "block")));
                id
            }
            "method_reference" => {
                let id = self.at(parent, "MethodReference", node);
                let parts = children(node);
                if let Some(first) = parts.first().copied() {
                    self.qualifier(id, first);
                }
                if let Some(arguments) = find(node, "type_arguments") {
                    self.type_arguments(id, arguments);
                }
                let name = parts.last().map(|name| self.text(*name)).unwrap_or_default();
                self.set(id, "MethodName", text(name));
                self.set(id, "ConstructorReference", flag(name == "new"));
                id
            }
            "class_literal" => {
                let id = self.at(parent, "ClassLiteral", node);
                if let Some(written) = kids(node).first() {
                    self.ty(id, *written);
                }
                id
            }
            "switch_expression" => self.switch(parent, node, "SwitchExpression"),
            _ => self.at(parent, "UnknownExpression", node),
        }
    }
}

/// A double as Java prints it.
pub fn java_double(value: f64) -> String {
    if value.is_nan() {
        return "NaN".to_string();
    }
    if value.is_infinite() {
        return if value > 0.0 { "Infinity".to_string() } else { "-Infinity".to_string() };
    }
    let size = value.abs();
    if size == 0.0 || (1e-3..1e7).contains(&size) {
        return format!("{value:?}");
    }
    let written = format!("{value:e}");
    let (digits, exponent) = written.split_once('e').unwrap_or((&written, "0"));
    let digits = if digits.contains('.') { digits.to_string() } else { format!("{digits}.0") };
    format!("{digits}E{exponent}")
}
