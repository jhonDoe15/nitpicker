//! ConstantPatternCompile: a `Pattern.compile` of constants inside a method could be a constant.
use super::Context;
use super::fix_helpers::qualify_type;
use super::fixes::Fix;
use super::naming::effectively_private;
use super::renames::{Use, rename_usages, variable_uses};
use super::shape::{arguments, preferred, stripped};
use super::vars::{Named, named};
use crate::engine::source::{ancestor, children, parent};
use crate::java::helpers::has_modifier;
use crate::java::types::expr::Binding;
use crate::java::types::model::flag;
use std::collections::HashMap;
use tree_sitter::Node;

const NAME: &str = "ConstantPatternCompile";
const SUMMARY: &str = "Variables initialized with Pattern#compile calls on constants can be constants";
const PATTERN: &str = "java.util.regex.Pattern";
const CLASSES: [&str; 5] = ["class_declaration", "interface_declaration", "enum_declaration", "record_declaration", "annotation_type_declaration"];
const METHODS: [&str; 3] = ["method_declaration", "constructor_declaration", "compact_constructor_declaration"];

fn is_nested_class(node: Node) -> bool {
    CLASSES.contains(&node.kind()) || (node.kind() == "class_body" && parent(node).is_some_and(|holder| matches!(holder.kind(), "object_creation_expression" | "enum_constant")))
}

/// LOWER_CAMEL to UPPER_UNDERSCORE the way Guava's `CaseFormat` does it.
fn upper_underscore(name: &str) -> String {
    let mut out = String::new();
    for (at, character) in name.chars().enumerate() {
        if at > 0 && character.is_ascii_uppercase() {
            out.push('_');
        }
        out.push(character.to_ascii_uppercase());
    }
    out
}

fn constant_name(variable: &str) -> String {
    let root = if variable == variable.to_ascii_uppercase() { variable.to_string() } else { upper_underscore(variable) };
    format!("{root}_PATTERN")
}

/// A compile-time constant: literals, constant fields and operators over them.
fn constant_value(context: &Context, node: Node) -> bool {
    match node.kind() {
        "string_literal" | "text_block" | "character_literal" | "true" | "false" => true,
        kind if kind.ends_with("_integer_literal") || kind.ends_with("_floating_point_literal") => true,
        "parenthesized_expression" => constant_value(context, stripped(node)),
        "binary_expression" => ["left", "right"].iter().all(|side| node.child_by_field_name(side).is_some_and(|part| constant_value(context, part))),
        "unary_expression" => node.child_by_field_name("operand").is_some_and(|part| constant_value(context, part)),
        "ternary_expression" => ["condition", "consequence", "alternative"].iter().all(|side| node.child_by_field_name(side).is_some_and(|part| constant_value(context, part))),
        "cast_expression" => {
            let primitive = node.child_by_field_name("type").is_some_and(|kind| matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type") || context.text(kind) == "String");
            primitive && node.child_by_field_name("value").is_some_and(|part| constant_value(context, part))
        }
        "identifier" | "field_access" | "scoped_identifier" => context.resolver.constant_field_as(node, true),
        _ => false,
    }
}

/// A variable on the way up is a `static final` field, or an assignment to one.
fn in_static_initializer(context: &Context, node: Node) -> bool {
    let mut current = parent(node);
    while let Some(at) = current {
        match at.kind() {
            "variable_declarator" => {
                let declaration = parent(at);
                let owner = declaration.and_then(|declaration| ancestor(declaration, &CLASSES));
                match declaration.map(|declaration| declaration.kind()) {
                    Some("constant_declaration") => return true,
                    Some("field_declaration") => {
                        let declaration = declaration.unwrap_or(at);
                        let enumerated = owner.is_some_and(|owner| owner.kind() == "enum_declaration");
                        if has_modifier(declaration, "final") && (has_modifier(declaration, "static") || enumerated) {
                            return true;
                        }
                    }
                    _ => {}
                }
            }
            "enum_constant" => return true,
            "assignment_expression" => {
                if let Some(target) = at.child_by_field_name("left").filter(|target| target.kind() == "identifier") {
                    if let Some(Binding::Field(_, info, field)) = context.resolver.binding(target, context.text(target)) {
                        let enumerated = info.flags & flag::ENUM != 0;
                        if field.flags & flag::FINAL != 0 && (field.flags & flag::STATIC != 0 || enumerated) {
                            return true;
                        }
                    }
                }
            }
            _ => {}
        }
        current = parent(at);
    }
    false
}

struct Scan<'c, 'a, 't> {
    context: &'c Context<'a>,
    class: Node<'t>,
    names: HashMap<String, usize>,
    fix: Fix,
    first: Option<Node<'t>>,
}

impl<'t> Scan<'_, '_, 't> {
    fn visit(&mut self, node: Node<'t>) {
        if node.kind() == "method_invocation" {
            if let Some(fix) = self.try_fix(node) {
                self.fix = std::mem::take(&mut self.fix).merged(fix);
                self.first.get_or_insert(node);
            }
        }
        for child in children(node) {
            if !is_nested_class(child) {
                self.visit(child);
            }
        }
    }

    fn try_fix(&mut self, call: Node<'t>) -> Option<Fix> {
        let context = self.context;
        if call.child_by_field_name("name").is_none_or(|name| context.text(name) != "compile") {
            return None;
        }
        context.resolver.resolve_call(call).filter(|resolved| resolved.method.is_static && resolved.declaring == PATTERN)?;
        if !arguments(call).iter().all(|arg| constant_value(context, *arg)) || in_static_initializer(context, call) || context.suppressed(NAME, call) {
            return None;
        }
        match parent(call).filter(|holder| holder.kind() == "variable_declarator") {
            Some(declarator) => self.variable(declarator),
            None => Some(self.inline(call)),
        }
    }

    fn variable(&mut self, declarator: Node<'t>) -> Option<Fix> {
        let method = ancestor(declarator, &METHODS)?;
        let declaration = parent(declarator).filter(|declaration| declaration.kind() == "local_variable_declaration")?;
        Some(self.local(declarator, declaration, method))
    }

    fn inline(&mut self, call: Node<'t>) -> Fix {
        let context = self.context;
        let suggested = self.matcher_name_of_call(call).unwrap_or_else(|| "PATTERN".to_string());
        let used = self.names.entry(suggested.clone()).or_insert(0);
        *used += 1;
        let name = if *used == 1 { suggested } else { format!("{suggested}{used}") };
        let mut imports = Fix::new();
        let class = qualify_type(context, call, PATTERN, &mut imports);
        let member = format!("private static final {class} {name} = {};", context.text(call));
        let at = self.class.end_byte() - 1;
        imports.and(call.start_byte(), call.end_byte(), name).merged(Fix::replace(at, at, format!("\n\n{member}\n")))
    }

    fn matcher_name_of_call(&self, call: Node<'t>) -> Option<String> {
        let holder = parent(call).filter(|holder| holder.kind() == "method_invocation" && holder.child_by_field_name("object").is_some_and(|object| object.id() == call.id()))?;
        self.matcher_argument(holder)
    }

    fn matcher_argument(&self, call: Node<'t>) -> Option<String> {
        let context = self.context;
        if call.child_by_field_name("name").is_none_or(|name| context.text(name) != "matcher") {
            return None;
        }
        let resolved = context.resolver.resolve_call(call)?;
        if resolved.method.is_static || resolved.receiver.name() != PATTERN {
            return None;
        }
        let first = *arguments(call).first()?;
        match first.kind() {
            "identifier" => Some(constant_name(context.text(first))),
            "method_invocation" => first.child_by_field_name("name").map(|name| constant_name(context.text(name))),
            _ => None,
        }
    }

    fn local(&mut self, declarator: Node<'t>, declaration: Node<'t>, method: Node<'t>) -> Fix {
        let context = self.context;
        let program = ancestor(declaration, &["program"]).unwrap_or(declaration);
        let Some(variable) = declarator.child_by_field_name("name") else { return Fix::new() };
        let regex = self.regex_constant(declarator, declaration, program, variable);
        if !regex.is_empty() {
            return regex;
        }
        let Some(name) = self.infer_name(declarator, program, variable) else { return Fix::new() };
        let class = ancestor(method, &CLASSES);
        let top_level = class.is_some_and(|class| parent(class).is_some_and(|holder| holder.kind() == "program"));
        let can_use_static = top_level || has_modifier(method, "static");
        let kind = declaration.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
        let value = declarator.child_by_field_name("value").map(|value| context.text(value)).unwrap_or_default();
        let replacement = format!("private {}final {kind} {name} = {value};", if can_use_static { "static " } else { "" });
        rename_usages(context, program, declarator, variable, &name).insert(method.end_byte(), replacement).merged(delete_declaration(declaration, declarator))
    }

    fn infer_name(&self, declarator: Node<'t>, program: Node<'t>, variable: Node<'t>) -> Option<String> {
        let context = self.context;
        let own = upper_underscore(context.text(variable));
        if own.len() > 1 && own != "PATTERN" {
            return Some(own);
        }
        let regex = first_argument(declarator);
        if let Some(regex) = regex.filter(|regex| regex.kind() == "identifier") {
            let name = context.text(regex);
            let name = name.strip_suffix("_REGEX").unwrap_or(name);
            if !name.ends_with("_PATTERN") {
                return Some(format!("{name}_PATTERN"));
            }
        }
        let uses = variable_uses(context, program, declarator, variable);
        let [Use::Name(usage)] = uses.as_slice() else { return None };
        let holder = parent(*usage).filter(|holder| holder.child_by_field_name("object").is_some_and(|object| object.id() == usage.id()))?;
        self.matcher_argument(holder)
    }

    /// The pattern goes into the `String` constant the regex was read from, when nothing else reads that constant.
    fn regex_constant(&self, declarator: Node<'t>, declaration: Node<'t>, program: Node<'t>, variable: Node<'t>) -> Fix {
        let context = self.context;
        let Some(regex) = first_argument(declarator).filter(|regex| regex.kind() == "identifier") else { return Fix::new() };
        let Some(Named::Variable(field)) = named(context, regex) else { return Fix::new() };
        let Some(holder) = parent(field).filter(|holder| matches!(holder.kind(), "field_declaration" | "constant_declaration")) else { return Fix::new() };
        let constant = holder.kind() == "constant_declaration";
        if !((has_modifier(holder, "static") && has_modifier(holder, "final")) || constant) || !effectively_private(holder) {
            return Fix::new();
        }
        let Some(name) = field.child_by_field_name("name") else { return Fix::new() };
        let uses = variable_uses(context, program, field, name);
        let count = uses.len();
        if count != 1 {
            return Fix::new();
        }
        let (Some(kind), Some(value), Some(init)) = (holder.child_by_field_name("type"), field.child_by_field_name("value"), declarator.child_by_field_name("value")) else { return Fix::new() };
        let written = declaration.child_by_field_name("type").map(|kind| context.text(kind)).unwrap_or_default();
        let before = &context.file.text[init.start_byte()..regex.start_byte()];
        let renamed = rename_usages(context, program, declarator, variable, context.text(name));
        Fix::replace(kind.start_byte(), kind.end_byte(), written)
            .insert(value.start_byte(), before)
            .insert(value.end_byte(), ")")
            .merged(renamed)
            .merged(delete_declaration(declaration, declarator))
    }
}

fn first_argument(declarator: Node) -> Option<Node> {
    let init = declarator.child_by_field_name("value")?;
    arguments(init).first().copied()
}

fn delete_declaration(declaration: Node, declarator: Node) -> Fix {
    let end = if parent(declaration).is_some_and(|holder| holder.kind() == "for_statement") { declarator.end_byte() } else { declaration.end_byte() };
    Fix::new().delete(declaration.start_byte(), end)
}

fn scan(context: &Context, class: Node, body: Node) {
    let mut scanning = Scan { context, class, names: HashMap::new(), fix: Fix::new(), first: None };
    let mut members = Vec::new();
    for member in children(body) {
        if member.kind() == "enum_body_declarations" {
            members.extend(children(member));
        } else {
            members.push(member);
        }
    }
    for member in members.into_iter().filter(|member| !is_nested_class(*member)) {
        scanning.visit(member);
    }
    if let Some(first) = scanning.first {
        context.report_fixed(NAME, first, preferred(first), SUMMARY, &[scanning.fix]);
    }
}

pub fn constant_pattern_compile(context: &Context, node: Node) {
    if CLASSES.contains(&node.kind()) {
        if let Some(body) = node.child_by_field_name("body") {
            scan(context, node, body);
        }
    } else if node.kind() == "class_body" && is_nested_class(node) {
        scan(context, node, node);
    }
}
