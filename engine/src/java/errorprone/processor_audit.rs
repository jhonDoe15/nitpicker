//! Whether an annotation processor changed a hand-written class: the members javac wrote into the build's class file
//! against the members the source declares and the ones the language itself adds (default constructors, enum and record
//! members; synthetic and bridge members). A processor that only writes new files leaves every class as its source
//! says; one that rewrites trees (Lombok and the like) adds members Error Prone's checks see and the engine does not.
//! Fields are compared by name and `static`, methods by name, parameter count and `static`; member types, annotations,
//! code and local or anonymous classes are not.
use crate::engine::source::{SourceFile, children, named_children};
use crate::java::helpers::has_modifier;
use crate::java::types::compiled::{ACC_STATIC, CompiledClass, shown_parameters};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use tree_sitter::Node;

const ACC_BRIDGE: u16 = 0x0040;
const ACC_SYNTHETIC: u16 = 0x1000;
const TYPE_KINDS: &[&str] =
    &["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];

/// The members of one class, by kind: field names, method names, how many constructors, member classes by binary name.
#[derive(Default, PartialEq, Debug)]
struct Members {
    fields: BTreeMap<String, usize>,
    methods: BTreeMap<String, usize>,
    constructors: usize,
    classes: BTreeMap<String, usize>,
}

impl Members {
    fn add(map: &mut BTreeMap<String, usize>, name: &str) {
        *map.entry(name.to_string()).or_default() += 1;
    }
    /// The first member one side has more of than the other, as `kind name`.
    fn first_difference(&self, other: &Members) -> Option<String> {
        let kinds = [("field", &self.fields, &other.fields), ("method", &self.methods, &other.methods), ("class", &self.classes, &other.classes)];
        for (kind, left, right) in kinds {
            let names = left.keys().chain(right.keys());
            if let Some(name) = names.into_iter().find(|name| left.get(*name) != right.get(*name)) {
                return Some(format!("{kind} {name}"));
            }
        }
        (self.constructors != other.constructors).then(|| "constructor".to_string())
    }
}

/// A class the build's class file shows changed, as the line of its name and what differs.
pub struct Rewritten {
    pub line: usize,
    pub column: usize,
    pub message: String,
}

/// Every top-level and member class of the file whose class file differs from its source, or has none.
pub fn rewritten(file: &SourceFile, package: &str, directories: &[PathBuf]) -> Vec<Rewritten> {
    let mut found = Vec::new();
    let prefix = if package.is_empty() { String::new() } else { format!("{package}.") };
    for declaration in children(file.tree.root_node()).into_iter().filter(|node| TYPE_KINDS.contains(&node.kind())) {
        audit(file, declaration, &prefix, directories, &mut found);
    }
    found
}

fn audit(file: &SourceFile, declaration: Node, outer: &str, directories: &[PathBuf], found: &mut Vec<Rewritten>) {
    let Some(name) = declaration.child_by_field_name("name") else { return };
    let binary = format!("{outer}{}", file.text_of(name));
    let place = name.start_position();
    let compiled = class_file(&binary, directories);
    let message = match &compiled {
        None => Some(format!("{binary}: no class file")),
        Some(class) => written(file, declaration, &binary).first_difference(&compiled_members(class)).map(|what| format!("{binary}: {what}")),
    };
    if let Some(message) = message {
        found.push(Rewritten { line: place.row + 1, column: place.column + 1, message });
    }
    for member in body_members(declaration).into_iter().filter(|node| TYPE_KINDS.contains(&node.kind())) {
        audit(file, member, &format!("{binary}$"), directories, found);
    }
}

fn class_file(binary: &str, directories: &[PathBuf]) -> Option<CompiledClass> {
    let relative = format!("{}.class", binary.replace('.', "/"));
    directories.iter().map(|directory| directory.join(Path::new(&relative))).find_map(|path| {
        let data = std::fs::read(path).ok()?;
        crate::java::types::compiled::parse(&data).map(|(_, class)| class)
    })
}

/// The declarations of a class body; for an enum, those after its constants.
fn body_members(declaration: Node) -> Vec<Node> {
    let Some(body) = declaration.child_by_field_name("body") else { return Vec::new() };
    let mut members = Vec::new();
    for part in named_children(body) {
        if part.kind() == "enum_body_declarations" {
            members.extend(named_children(part));
        } else {
            members.push(part);
        }
    }
    members
}

fn written(file: &SourceFile, declaration: Node, binary: &str) -> Members {
    let mut members = Members::default();
    let kind = declaration.kind();
    let mut canonical = false;
    let in_interface = matches!(kind, "interface_declaration" | "annotation_type_declaration");
    let components = record_components(file, declaration);
    for (name, _) in &components {
        Members::add(&mut members.fields, &field_key(name, false));
    }
    if let Some(body) = declaration.child_by_field_name("body") {
        for constant in named_children(body).into_iter().filter(|part| part.kind() == "enum_constant") {
            if let Some(name) = constant.child_by_field_name("name") {
                Members::add(&mut members.fields, &field_key(file.text_of(name), true));
            }
        }
    }
    for member in body_members(declaration) {
        match member.kind() {
            "field_declaration" | "constant_declaration" => {
                let fixed = member.kind() == "constant_declaration" || has_modifier(member, "static") || in_interface;
                let mut cursor = member.walk();
                for declarator in member.children_by_field_name("declarator", &mut cursor) {
                    if let Some(name) = declarator.child_by_field_name("name") {
                        Members::add(&mut members.fields, &field_key(file.text_of(name), fixed));
                    }
                }
            }
            "method_declaration" | "annotation_type_element_declaration" => {
                if let Some(name) = member.child_by_field_name("name") {
                    let count = parameter_types(file, member).len();
                    Members::add(&mut members.methods, &method_key(file.text_of(name), count, has_modifier(member, "static")));
                }
            }
            "constructor_declaration" => {
                members.constructors += 1;
                canonical |= !components.is_empty() && parameter_types(file, member) == components.iter().map(|(_, kind)| kind.clone()).collect::<Vec<_>>();
            }
            "compact_constructor_declaration" => {
                members.constructors += 1;
                canonical = true;
            }
            other if TYPE_KINDS.contains(&other) => {
                if let Some(name) = member.child_by_field_name("name") {
                    Members::add(&mut members.classes, &format!("{binary}${}", file.text_of(name)));
                }
            }
            _ => {}
        }
    }
    match kind {
        "class_declaration" | "enum_declaration" if members.constructors == 0 => members.constructors = 1,
        "enum_declaration" => {}
        "record_declaration" => {
            if !canonical {
                members.constructors += 1;
            }
            let implicit = components.iter().map(|(name, _)| (name.as_str(), 0)).chain([("toString", 0), ("hashCode", 0), ("equals", 1)]);
            for (name, parameters) in implicit {
                if !declares(file, declaration, name, parameters) {
                    Members::add(&mut members.methods, &method_key(name, parameters, false));
                }
            }
        }
        _ => {}
    }
    if kind == "enum_declaration" {
        Members::add(&mut members.methods, &method_key("values", 0, true));
        Members::add(&mut members.methods, &method_key("valueOf", 1, true));
    }
    members
}

/// Whether the record declares a method of that name and parameter count, which javac then does not add.
fn declares(file: &SourceFile, declaration: Node, name: &str, parameters: usize) -> bool {
    body_members(declaration).into_iter().any(|member| {
        member.kind() == "method_declaration"
            && member.child_by_field_name("name").is_some_and(|found| file.text_of(found) == name)
            && parameter_types(file, member).len() == parameters
    })
}

/// A record's components: name and type as written, without spaces or annotations.
fn record_components(file: &SourceFile, declaration: Node) -> Vec<(String, String)> {
    if declaration.kind() != "record_declaration" {
        return Vec::new();
    }
    let Some(parameters) = declaration.child_by_field_name("parameters") else { return Vec::new() };
    named_children(parameters)
        .into_iter()
        .filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"))
        .filter_map(|part| Some((file.text_of(parameter_name(part)?).to_string(), parameter_type(file, part))))
        .collect()
}

/// A receiver parameter (`Outer this`, `Outer.this`) the grammar reads as a plain one; javac counts it in no descriptor.
fn is_receiver(name: &str) -> bool {
    name == "this" || name.ends_with(".this")
}

/// A parameter's name; a varargs one keeps it in its declarator.
fn parameter_name(parameter: Node) -> Option<Node> {
    parameter.child_by_field_name("name").or_else(|| {
        let declarator = named_children(parameter).into_iter().find(|part| part.kind() == "variable_declarator")?;
        declarator.child_by_field_name("name")
    })
}

fn parameter_types(file: &SourceFile, method: Node) -> Vec<String> {
    let Some(parameters) = method.child_by_field_name("parameters") else { return Vec::new() };
    named_children(parameters)
        .into_iter()
        .filter(|part| matches!(part.kind(), "formal_parameter" | "spread_parameter"))
        .filter(|part| parameter_name(*part).is_none_or(|name| !is_receiver(file.text_of(name))))
        .map(|part| parameter_type(file, part))
        .collect()
}

fn parameter_type(file: &SourceFile, parameter: Node) -> String {
    let kind = parameter.child_by_field_name("type").or_else(|| named_children(parameter).into_iter().find(|part| part.kind().ends_with("_type") || part.kind() == "type_identifier"));
    let text = kind.map_or("", |node| file.text_of(node));
    let spread = if parameter.kind() == "spread_parameter" { "..." } else { "" };
    format!("{}{spread}", text.split_whitespace().collect::<String>())
}

/// A field as the audit compares it: its name, and `static` when it is.
fn field_key(name: &str, fixed: bool) -> String {
    if fixed { format!("static {name}") } else { name.to_string() }
}

/// A method as the audit compares it: its name, its parameter count, and `static` when it is.
fn method_key(name: &str, parameters: usize, fixed: bool) -> String {
    if fixed { format!("static {name}/{parameters}") } else { format!("{name}/{parameters}") }
}

fn compiled_members(class: &CompiledClass) -> Members {
    let mut members = Members::default();
    for field in class.fields.iter().filter(|field| field.access & ACC_SYNTHETIC == 0) {
        Members::add(&mut members.fields, &field_key(&field.name, field.access & ACC_STATIC != 0));
    }
    for method in class.methods.iter().filter(|method| method.access & (ACC_SYNTHETIC | ACC_BRIDGE) == 0) {
        match method.name.as_str() {
            "<clinit>" => {}
            "<init>" => members.constructors += 1,
            name => Members::add(&mut members.methods, &method_key(name, shown_parameters(&method.descriptor).len(), method.access & ACC_STATIC != 0)),
        }
    }
    for member in &class.members {
        Members::add(&mut members.classes, member);
    }
    members
}
