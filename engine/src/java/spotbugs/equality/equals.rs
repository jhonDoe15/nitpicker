//! The equals patterns: EQ_DOESNT_OVERRIDE_EQUALS (a class adds fields but keeps the `equals(Object)` of its
//! superclass) and EQ_COMPARETO_USE_OBJECT_EQUALS (a class defines `compareTo` and no `equals(Object)` at all).
use super::super::{Context, names, place};
use super::super::classes::{Shape, lines};
use crate::java::helpers::has_modifier;
use crate::java::types::index::TypeIndex;
use crate::java::types::model::{ClassInfo, Method, OBJECT, Type, flag};
use tree_sitter::Node;

pub const PATTERNS: &[&str] = &["EQ_DOESNT_OVERRIDE_EQUALS", "EQ_COMPARETO_USE_OBJECT_EQUALS"];

/// The class's own non-static methods of that name, with their erased parameter types.
pub fn methods<'t>(context: &Context, shape: &Shape<'t>, name: &str) -> Vec<(Node<'t>, Vec<Type>)> {
    let named = |member: &Node| {
        let written = member.child_by_field_name("name");
        member.kind() == "method_declaration"
            && !has_modifier(*member, "static")
            && written.is_some_and(|written| context.text(written) == name)
    };
    let list = |member: Node<'t>| (member, context.resolver.parameters(member.child_by_field_name("parameters")).0);
    shape.members.iter().copied().filter(named).map(list).collect()
}

pub fn is(kind: &Type, name: &str) -> bool {
    kind.erased().name() == name
}

/// Whether a list of erased parameter types is exactly one of the named type.
pub fn takes(parameters: &[Type], name: &str) -> bool {
    matches!(parameters, [only] if is(only, name))
}

/// What the superclass chain of a class holds for `equals(Object)`.
enum Above<'i> {
    Object,
    Unknown,
    /// The class declares it, or javac writes a bridge for it into the class.
    Own,
    Declared(&'i ClassInfo, &'i Method),
}

fn above<'i>(index: &'i TypeIndex, own: &str) -> Above<'i> {
    let Some(start) = index.get(own) else { return Above::Unknown };
    let mut below = start;
    let mut next = start.superclass.clone();
    while let Some(name) = next.filter(|name| name != OBJECT) {
        let Some(info) = index.get(&name) else { return Above::Unknown };
        let equals = info.methods.iter().find(|method| method.name == "equals" && takes(&method.parameters, OBJECT));
        if let Some(method) = equals {
            let hidden = info.flags & flag::PUBLIC == 0 && below.flags & flag::PUBLIC != 0;
            let open = method.detail.access & 5 != 0 && hidden;
            return match (open, below.name == start.name) {
                (true, true) => Above::Own,
                (true, false) => Above::Declared(below, method),
                _ => Above::Declared(info, method),
            };
        }
        below = info;
        next = info.superclass.clone();
    }
    Above::Object
}

fn declares_equals(context: &Context, shape: &Shape) -> bool {
    methods(context, shape, "equals").iter().any(|(_, parameters)| takes(parameters, OBJECT))
}

fn plain(shape: &Shape) -> bool {
    matches!(shape.class.kind(), "class_declaration" | "object_creation_expression")
}

/// A class's name as a message shows it from `from`: without the package when both are in the same one.
fn shown(context: &Context, from: &str, class: &str) -> String {
    let (from, class) = (names::binary(context, from), names::binary(context, class));
    if names::package_of(&from) == names::package_of(&class) { names::short(&class).to_string() } else { class }
}

fn doesnt_override(context: &Context, shape: &Shape, binary: &str) {
    let instance = |member: &&Node| {
        let skipped = has_modifier(**member, "static") || has_modifier(**member, "transient");
        member.kind() == "field_declaration" && !skipped
    };
    if !plain(shape) || has_modifier(shape.class, "abstract") || !shape.members.iter().any(|member| instance(&member)) {
        return;
    }
    let typed = |(method, parameters): &(Node, Vec<Type>)| {
        has_modifier(*method, "public") && takes(parameters, &shape.own)
    };
    if declares_equals(context, shape) || methods(context, shape, "equals").iter().any(typed) {
        return;
    }
    let Above::Declared(info, method) = above(context.resolver.index, &shape.own) else { return };
    if info.flags & flag::ABSTRACT != 0 || method.is_abstract || method.detail.access & 0x10 != 0 {
        return;
    }
    let owner = names::binary(context, &info.name);
    let called = format!("{}.equals(Object)", shown(context, &shape.own, &info.name));
    let message = format!("{binary} doesn't override {called}");
    let place = place::function(&format!("{owner}.equals(Object)"));
    let arguments = vec![binary.to_string(), called];
    context.report_listed("EQ_DOESNT_OVERRIDE_EQUALS", shape.class, 1, message, place, 2, arguments);
}

/// Whether javac writes a bridge `compareTo(Object)`: the method overrides a generic one of a supertype.
fn bridged(context: &Context, own: &str) -> bool {
    let index = context.resolver.index;
    let generic = |method: &Method| {
        let open = method.generic_parameters.first().is_some_and(Type::open);
        let inherited = !method.is_static && !method.is_private;
        method.name == "compareTo" && inherited && open && takes(&method.parameters, OBJECT)
    };
    index.lineage(own).iter().skip(1).filter_map(|name| index.get(name)).any(|info| info.methods.iter().any(generic))
}

fn compare_to(context: &Context, shape: &Shape, binary: &str) {
    if !plain(shape) || has_modifier(shape.class, "abstract") || declares_equals(context, shape) {
        return;
    }
    let int = |method: Node| method.child_by_field_name("type").is_some_and(|written| context.text(written) == "int");
    let declared = methods(context, shape, "compareTo");
    let found = |wanted: &str| {
        let chosen = declared.iter().find(|(method, parameters)| int(*method) && takes(parameters, wanted));
        chosen.map(|(method, _)| (wanted.to_string(), lines::method_start(context, *method)))
    };
    let others = declared.iter().any(|(method, parameters)| int(*method) && parameters.len() == 1);
    let class_line = Some(context.line(shape.class));
    let bridge = (others && bridged(context, &shape.own)).then(|| (OBJECT.to_string(), class_line));
    let Some((wanted, Some(line))) = found(&shape.own).or_else(|| found(OBJECT)).or(bridge) else { return };
    if !matches!(above(context.resolver.index, &shape.own), Above::Object) {
        return;
    }
    let shown = if wanted == OBJECT { "Object" } else { names::short(binary) };
    let label = format!("compareTo({shown})");
    let message = format!("{binary} defines {label} and uses Object.equals()");
    let place = place::function(&format!("{binary}.{label}"));
    let arguments = vec![binary.to_string(), label];
    context.report_listed("EQ_COMPARETO_USE_OBJECT_EQUALS", shape.class, line, message, place, 2, arguments);
}

pub fn check(context: &Context, shape: &Shape) {
    let binary = names::binary(context, &shape.own);
    if context.wants(&PATTERNS[..1]) {
        doesnt_override(context, shape, &binary);
    }
    if context.wants(&PATTERNS[1..]) {
        compare_to(context, shape, &binary);
    }
}
