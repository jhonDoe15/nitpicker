//! How the run's code uses a few fields, for Error Prone checks that ask whether a change to the field still compiles:
//! the uses that need the field to stay static, and the writes a final field would not allow.
use super::expr::{Binding, Receiver};
use super::index::TypeIndex;
use super::scope::{FileScope, Resolver, TYPE_DECLARATIONS};
use crate::engine::encoding::Charset;
use crate::engine::source::{SourceFile, parent, walk};
use crate::java::helpers::{declarators, has_modifier};
use rayon::prelude::*;
use std::collections::{HashMap, HashSet};
use tree_sitter::Node;

/// A use that stops compiling once the field is an instance field.
pub const STATIC_USE: u8 = 1;
/// A write outside the constructors and instance initializers of the field's class, or not to the object being built.
pub const OUTSIDE_WRITE: u8 = 2;
/// A use the engine cannot tie to a field: a write through `super`, or a qualifier whose type it cannot work out.
pub const UNKNOWN: u8 = 4;

/// A field: the class that declares it and its name.
pub type Key = (String, String);

/// What the walk up from a use to the class of the field met on the way.
#[derive(Default)]
struct Path<'t> {
    reached: bool,
    static_context: bool,
    crossed_class: bool,
    crossed_lambda: bool,
    /// Inside the arguments of `this(...)` or `super(...)` of a constructor not yet left by the walk.
    explicit: bool,
    member: Option<Node<'t>>,
}

fn static_class(declaration: Node) -> bool {
    declaration.kind() != "class_declaration"
        || has_modifier(declaration, "static")
        || parent(declaration).is_some_and(|body| matches!(body.kind(), "interface_body" | "annotation_type_body"))
}

fn static_field(declaration: Node) -> bool {
    declaration.kind() == "constant_declaration"
        || has_modifier(declaration, "static")
        || parent(declaration).is_some_and(|body| matches!(body.kind(), "interface_body" | "annotation_type_body"))
}

fn walk_up<'t>(scope: &FileScope, from: Node<'t>, owner: &str, private: bool) -> Path<'t> {
    let mut path = Path::default();
    let mut previous = from;
    let mut before = from;
    let mut current = parent(from);
    while let Some(at) = current {
        let named = scope.names.get(&at.id()).is_some_and(|name| name == owner);
        if named && (TYPE_DECLARATIONS.contains(&at.kind()) || previous.kind() == "class_body") {
            path.reached = true;
            path.static_context |= path.explicit;
            path.member = Some(before);
            return path;
        }
        match at.kind() {
            "method_declaration" if has_modifier(at, "static") => path.static_context = true,
            "static_initializer" => path.static_context = true,
            "explicit_constructor_invocation" => path.explicit = true,
            "field_declaration" | "constant_declaration" if static_field(at) => path.static_context = true,
            "lambda_expression" => path.crossed_lambda = true,
            "enum_constant" if previous.kind() == "class_body" => {
                path.static_context |= private;
                path.crossed_class = true;
            }
            "enum_constant" => path.static_context = true,
            "object_creation_expression" if previous.kind() == "class_body" => path.crossed_class = true,
            kind if TYPE_DECLARATIONS.contains(&kind) => {
                path.explicit = false;
                path.static_context |= static_class(at);
                path.crossed_class = true;
            }
            _ => {}
        }
        before = previous;
        previous = at;
        current = parent(at);
    }
    path
}

/// The node a use stands in when it is written to: the identifier, or `this.name`.
fn written(target: Node) -> bool {
    parent(target).is_some_and(|up| match up.kind() {
        "assignment_expression" => up.child_by_field_name("left").is_some_and(|left| left.id() == target.id()),
        "update_expression" => true,
        _ => false,
    })
}

fn plain_assignment(target: Node, file: &SourceFile) -> bool {
    parent(target).is_some_and(|up| {
        up.kind() == "assignment_expression"
            && up.child_by_field_name("left").is_some_and(|left| left.id() == target.id())
            && up.child_by_field_name("operator").is_some_and(|operator| file.text_of(operator) == "=")
    })
}

fn not_a_name_use(identifier: Node, up: Node) -> bool {
    let same = |field: &str| up.child_by_field_name(field).is_some_and(|part| part.id() == identifier.id());
    same("name")
        || same("key")
        || same("parameters")
        || matches!(
            up.kind(),
            "scoped_identifier" | "inferred_parameters" | "labeled_statement" | "break_statement" | "continue_statement"
        )
        || (up.kind() == "method_reference" && up.named_child(0).is_none_or(|first| first.id() != identifier.id()))
}

struct Facts<'a> {
    file: &'a SourceFile,
    scope: &'a FileScope,
    resolver: Resolver<'a>,
    index: &'a TypeIndex,
    targets: &'a HashSet<Key>,
    /// Where the targets declared in this file start.
    declared: HashMap<Key, usize>,
    found: Vec<(Key, u8)>,
}

impl Facts<'_> {
    fn qualified(&mut self, access: Node, name: &str) {
        let Some(object) = access.child_by_field_name("object") else { return };
        let receiver = if matches!(object.kind(), "this" | "super") { None } else { self.resolver.receiver(object) };
        let class = match &receiver {
            Some(Receiver::Static(class)) => class.clone(),
            Some(Receiver::Value(kind)) => kind.name(),
            None if object.kind() == "this" => {
                let Some(owner) = super::scope::enclosing_types(self.scope, access).into_iter().next() else { return };
                let Some((declaring, field)) = self.index.field(&owner, name) else { return };
                let (key, private) = ((declaring.name.clone(), field.name.clone()), field.is_private);
                if self.targets.contains(&key) {
                    self.simple(access, &owner, key, private, true);
                }
                return;
            }
            None if object.kind() == "super" => {
                let owner = super::scope::enclosing_types(self.scope, access).into_iter().next();
                match owner.and_then(|owner| self.index.get(&owner).and_then(|info| info.superclass.clone())) {
                    Some(parent) => parent,
                    None => return self.every(name, UNKNOWN),
                }
            }
            None => return self.every(name, UNKNOWN),
        };
        let Some((declaring, _)) = self.index.field(&class, name) else { return };
        let key = (declaring.name.clone(), name.to_string());
        if !self.targets.contains(&key) {
            return;
        }
        let mut flags = 0;
        if matches!(receiver, Some(Receiver::Static(_))) {
            flags |= STATIC_USE;
        }
        if written(access) {
            flags |= OUTSIDE_WRITE;
        }
        self.found.push((key, flags));
    }

    /// Flags for every target field with the name.
    fn every(&mut self, name: &str, flags: u8) {
        let keys: Vec<Key> = self.targets.iter().filter(|(_, field)| field == name).cloned().collect();
        self.found.extend(keys.into_iter().map(|key| (key, flags)));
    }

    fn simple(&mut self, target: Node, owner: &str, key: Key, private: bool, through_this: bool) {
        let path = walk_up(self.scope, target, owner, private);
        let mut flags = 0;
        if !path.reached || path.static_context {
            flags |= STATIC_USE;
        }
        let member = path.member.filter(|_| path.reached && !path.crossed_class);
        if let (Some(member), Some(start), false) = (member, self.declared.get(&key), through_this) {
            let initializer = member.kind() == "block"
                || (member.kind() == "field_declaration" && !static_field(member) && declarators(member).iter().any(|declarator| declarator.child_by_field_name("value").is_some_and(|value| value.byte_range().contains(&target.start_byte()))));
            if initializer && member.start_byte() < *start && !plain_assignment(target, self.file) {
                flags |= STATIC_USE;
            }
        }
        if written(target) {
            let building = owner == key.0 && member.is_some_and(|member| matches!(member.kind(), "constructor_declaration" | "block")) && !path.crossed_lambda;
            if !building {
                flags |= OUTSIDE_WRITE;
            }
        }
        self.found.push((key, flags));
    }

    fn identifier(&mut self, identifier: Node, name: &str) {
        let Some(up) = parent(identifier) else { return };
        if up.kind() == "field_access" && up.child_by_field_name("field").is_some_and(|field| field.id() == identifier.id()) {
            return self.qualified(up, name);
        }
        if not_a_name_use(identifier, up) {
            return;
        }
        let Some(Binding::Field(owner, declaring, field)) = self.resolver.binding(identifier, name) else { return };
        let key = (declaring.name.clone(), field.name.clone());
        if self.targets.contains(&key) {
            let private = field.is_private;
            self.simple(identifier, &owner.name(), key, private, false);
        }
    }
}

fn file_uses(file: &SourceFile, scope: &FileScope, index: &TypeIndex, targets: &HashSet<Key>, names: &HashSet<&str>) -> Vec<(Key, u8)> {
    let mut facts = Facts { file, scope, resolver: Resolver::new(index, file, scope), index, targets, declared: HashMap::new(), found: Vec::new() };
    walk(file.tree.root_node(), |node| {
        if node.kind() != "field_declaration" && node.kind() != "constant_declaration" {
            return;
        }
        let Some(class) = super::scope::enclosing_types(scope, node).into_iter().next() else { return };
        for declarator in declarators(node) {
            let Some(name) = declarator.child_by_field_name("name") else { continue };
            let key = (class.clone(), file.text_of(name).to_string());
            if targets.contains(&key) {
                facts.declared.insert(key, node.start_byte());
            }
        }
    });
    for (name, owners) in &scope.static_single {
        for owner in owners {
            let declaring = index.field(owner, name).map_or_else(|| owner.clone(), |(declaring, _)| declaring.name.clone());
            let key = (declaring, name.clone());
            if targets.contains(&key) {
                facts.found.push((key, STATIC_USE));
            }
        }
    }
    let mut identifiers = Vec::new();
    walk(file.tree.root_node(), |node| {
        if node.kind() == "identifier" && names.contains(file.text_of(node)) {
            identifiers.push(node);
        }
    });
    for identifier in identifiers {
        facts.identifier(identifier, file.text_of(identifier));
    }
    facts.found
}

/// The uses of each target field in all the files, as flags. The outlines lack the bodies, so the files that spell a
/// target's name are read whole again.
pub fn field_uses(paths: &[&str], encoding: Option<Charset>, index: &TypeIndex, targets: &HashSet<Key>) -> HashMap<Key, u8> {
    let mut uses: HashMap<Key, u8> = targets.iter().map(|key| (key.clone(), 0)).collect();
    if targets.is_empty() {
        return uses;
    }
    let names: HashSet<&str> = targets.iter().map(|(_, name)| name.as_str()).collect();
    let found: Vec<(Key, u8)> = paths
        .par_iter()
        .flat_map_iter(|path| {
            let path = std::path::PathBuf::from(path);
            let text = crate::engine::source::read_text_in(&path, encoding).filter(|text| names.iter().any(|name| text.contains(name)));
            let file = text.and_then(|_| crate::engine::runner::parse_in(&path, &crate::java::Java, encoding));
            file.map(|file| {
                let scope = FileScope::of(&file);
                file_uses(&file, &scope, index, targets, &names)
            })
            .unwrap_or_default()
        })
        .collect();
    for (key, flags) in found {
        *uses.entry(key).or_default() |= flags;
    }
    uses
}
