//! InconsistentHashCode: `hashCode` reads fields that `equals` does not.
use super::equals_methods::{equals_declaration, hash_code_declaration};
use super::junit_init::members;
use super::lookup::field_of;
use super::time_with::names_variable;
use super::Context;
use crate::engine::source::children;
use crate::java::types::model::{flag, Type};
use tree_sitter::Node;

const MESSAGE: &str = "hashCode includes the fields {}, which equals does not. Two instances of this class could compare equal, but have different hashCodes, which violates the hashCode contract.";

/// Which calls the scan lets through besides static methods and the methods it already knows.
#[derive(Clone, Copy, PartialEq)]
enum Acceptable {
    Nothing,
    HashCode,
    EqualsOrGetClass,
}

struct Known {
    name: String,
    parameters: Vec<Type>,
    fields: Vec<String>,
}

struct Scan<'a, 'c> {
    context: &'a Context<'c>,
    class: &'a str,
    known: &'a [Known],
    acceptable: Acceptable,
    failed: bool,
    fields: Vec<String>,
}

impl Scan<'_, '_> {
    fn add(&mut self, field: &str) {
        if !self.fields.iter().any(|known| known == field) {
            self.fields.push(field.to_string());
        }
    }

    fn handle_field(&mut self, node: Node) {
        if let Some((declaring, field)) = field_of(self.context, node) {
            if declaring.name == self.class && field.flags & flag::STATIC == 0 {
                self.add(&field.name);
            }
        }
    }

    fn call(&mut self, node: Node) {
        let Some(resolved) = self.context.resolver.resolve_call(node) else {
            self.failed = true;
            return;
        };
        let method = &resolved.method;
        if let Some(known) = self.known.iter().find(|known| resolved.declaring == self.class && known.name == method.name && known.parameters == method.parameters) {
            for field in known.fields.clone() {
                self.add(&field);
            }
            return;
        }
        let accepted = match self.acceptable {
            Acceptable::Nothing => false,
            Acceptable::HashCode => method.name == "hashCode" && method.parameters.is_empty(),
            Acceptable::EqualsOrGetClass => method.name == "getClass" || (method.name == "equals" && method.parameters == [Type::class(crate::java::types::model::OBJECT)] && method.returns == Type::Primitive("boolean")),
        };
        if !method.is_static && !accepted {
            self.failed = true;
        }
    }

    fn visit(&mut self, node: Node) {
        match node.kind() {
            "method_invocation" => self.call(node),
            "explicit_constructor_invocation" => self.failed = true,
            "field_access" if node.child_by_field_name("object").is_some_and(|object| object.kind() == "this") => self.handle_field(node),
            "identifier" if names_variable(node) => self.handle_field(node),
            _ => {}
        }
        for part in children(node) {
            self.visit(part);
        }
    }
}

fn scan(context: &Context, class: &str, method: Node, known: &[Known], acceptable: Acceptable) -> (bool, Vec<String>) {
    let mut scan = Scan { context, class, known, acceptable, failed: false, fields: Vec::new() };
    scan.visit(method);
    (scan.failed, scan.fields)
}

pub fn inconsistent_hash_code(context: &Context, class: Node) {
    if !matches!(class.kind(), "class_declaration" | "enum_declaration" | "record_declaration") {
        return;
    }
    let Some(name) = context.resolver.scope.names.get(&class.id()).cloned() else { return };
    let members: Vec<Node> = members(class);
    let (mut equals, mut hash_code) = (None, None);
    for member in &members {
        if hash_code_declaration(context, *member) {
            hash_code = Some(*member);
        } else if equals_declaration(context, *member) {
            equals = Some(*member);
        }
    }
    let (Some(equals), Some(hash_code)) = (equals, hash_code) else { return };
    let mut known: Vec<Known> = Vec::new();
    for member in &members {
        if !matches!(member.kind(), "method_declaration" | "constructor_declaration" | "compact_constructor_declaration") || member.id() == equals.id() || member.id() == hash_code.id() {
            continue;
        }
        let (failed, fields) = scan(context, &name, *member, &[], Acceptable::Nothing);
        let Some(called) = member.child_by_field_name("name").filter(|_| member.kind() == "method_declaration") else { continue };
        if !failed {
            let (parameters, _, _) = context.resolver.parameters(member.child_by_field_name("parameters"));
            known.push(Known { name: context.text(called).to_string(), parameters, fields });
        }
    }
    let (equals_failed, in_equals) = scan(context, &name, equals, &known, Acceptable::HashCode);
    let (hash_failed, in_hash_code) = scan(context, &name, hash_code, &known, Acceptable::EqualsOrGetClass);
    if equals_failed || hash_failed || in_equals.is_empty() {
        return;
    }
    let difference: Vec<&String> = in_hash_code.iter().filter(|field| !in_equals.contains(field) && !field.to_ascii_lowercase().contains("hash")).collect();
    if difference.is_empty() {
        return;
    }
    let listed = format!("[{}]", difference.iter().map(|field| field.as_str()).collect::<Vec<_>>().join(", "));
    let at = hash_code.child_by_field_name("name").map_or(hash_code.start_byte(), |part| part.start_byte());
    context.report_fixed("InconsistentHashCode", class, at, &MESSAGE.replacen("{}", &listed, 1), &[]);
}
