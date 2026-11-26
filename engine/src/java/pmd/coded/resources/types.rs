//! What CloseResource asks of types and variables: whether a node has a resource type, PMD's runtime type of a
//! variable, and the type name its message prints.
use crate::java::pmd::coded::ctx::Ctx;
use crate::java::pmd::coded::message::written_type;
use crate::java::types::model::Type;

pub struct Settings {
    pub types: Vec<String>,
    pub simple_types: Vec<String>,
    pub close_targets: Vec<String>,
    pub allowed: Vec<String>,
    pub close_not_in_finally: bool,
}

impl Settings {
    pub fn of(ctx: &Ctx) -> Settings {
        let mut close_targets = ctx.property_list("closeTargets", &[]);
        if ctx.property_flag("closeAsDefaultTarget", true) {
            close_targets.push("close".to_string());
        }
        let types = ctx.property_list(
            "types",
            &["java.lang.AutoCloseable", "java.sql.Connection", "java.sql.Statement", "java.sql.ResultSet"],
        );
        let simple_types = types.iter().map(|name| simple(name).to_string()).collect();
        let allowed = ctx.property_list(
            "allowedResourceTypes",
            &[
                "java.io.ByteArrayOutputStream",
                "java.io.ByteArrayInputStream",
                "java.io.StringWriter",
                "java.io.CharArrayWriter",
                "java.util.stream.Stream",
                "java.util.stream.IntStream",
                "java.util.stream.LongStream",
                "java.util.stream.DoubleStream",
            ],
        );
        Settings {
            types,
            simple_types,
            close_targets,
            allowed,
            close_not_in_finally: ctx.property_flag("closeNotInFinally", false),
        }
    }
}

fn simple(name: &str) -> &str {
    name.rsplit('.').next().unwrap_or(name)
}

/// The symbol of a node's type as PMD sees it: none, resolved, or unresolved with its simple name.
pub enum Symbol {
    Resolved(Type),
    Unresolved(String),
}

pub fn symbol(ctx: &Ctx, id: u32) -> Option<Symbol> {
    let kind = ctx.type_of(id)?;
    match &kind {
        Type::Null | Type::Wildcard | Type::Bounded(..) => None,
        Type::Class(name, _) if ctx.machine.resolver.index.get(&kind.erased().name()).is_none() => {
            Some(Symbol::Unresolved(name.rsplit(['.', '$']).next().unwrap_or(name).to_string()))
        }
        _ => Some(Symbol::Resolved(kind)),
    }
}

fn resolved(ctx: &Ctx, id: u32) -> bool {
    matches!(symbol(ctx, id), Some(Symbol::Resolved(_)))
}

/// PMD `isNodeInstanceOfResourceType`.
pub fn instance_of_resource(ctx: &Ctx, settings: &Settings, id: Option<u32>) -> bool {
    id.is_some_and(|id| settings.types.iter().any(|kind| ctx.type_is(id, kind)))
}

/// PMD `isResourceTypeOrSubtype`.
pub fn resource_or_subtype(ctx: &Ctx, settings: &Settings, id: u32) -> bool {
    match symbol(ctx, id) {
        Some(Symbol::Resolved(_)) => instance_of_resource(ctx, settings, Some(id)),
        Some(Symbol::Unresolved(name)) => settings.types.contains(&name) || settings.simple_types.contains(&name),
        None => false,
    }
}

/// PMD `isAllowedResourceType`: an exact match only.
pub fn allowed(ctx: &Ctx, settings: &Settings, id: Option<u32>) -> bool {
    id.is_some_and(|id| settings.allowed.iter().any(|kind| ctx.type_is_exactly(id, kind)))
}

/// The value a `VariableId` is declared with.
pub fn initializer(ctx: &Ctx, variable: u32) -> Option<u32> {
    let declarator = ctx.parent(variable).filter(|parent| ctx.is(*parent, "VariableDeclarator"))?;
    ctx.nth(declarator, 1)
}

/// The declaration that holds the modifiers and the written type of a `VariableId`.
pub fn declaration(ctx: &Ctx, variable: u32) -> Option<u32> {
    let parent = ctx.parent(variable)?;
    if ctx.is(parent, "VariableDeclarator") { ctx.parent(parent) } else { Some(parent) }
}

/// PMD `VariableId.getTypeNode()`.
pub fn type_node(ctx: &Ctx, variable: u32) -> Option<u32> {
    let holder = declaration(ctx, variable)?;
    ctx.kids(holder).iter().copied().find(|kid| ctx.type_node(*kid))
}

/// PMD `getTypeOfVariable`: the value when the type is inferred or the value has a known class, else the written type.
pub fn type_of_variable(ctx: &Ctx, variable: u32) -> Option<u32> {
    let value = initializer(ctx, variable);
    let runtime = value.filter(|value| {
        type_node(ctx, variable).is_none()
            || (!ctx.is(*value, "MethodCall") && !ctx.is(*value, "NullLiteral") && resolved(ctx, *value))
    });
    runtime.or_else(|| type_node(ctx, variable))
}

/// PMD `getResourceTypeName`; nothing where PMD fails on a missing type.
pub fn type_name(ctx: &Ctx, variable: u32, kind: Option<u32>) -> Option<String> {
    let kind = kind?;
    let mut out = String::new();
    if ctx.type_node(kind) {
        written_type(ctx, kind, &mut out);
        return Some(out);
    }
    match symbol(ctx, kind) {
        Some(Symbol::Resolved(found)) => Some(simple_name(&found)),
        Some(Symbol::Unresolved(name)) => Some(name),
        None => {
            let local = ctx.enclosing(variable, &["LocalVariableDeclaration"]);
            match local.and_then(|local| ctx.kids(local).iter().copied().find(|kid| ctx.type_node(*kid))) {
                Some(written) => {
                    written_type(ctx, written, &mut out);
                    Some(out)
                }
                None => Some(ctx.text(variable, "Name")),
            }
        }
    }
}

fn simple_name(kind: &Type) -> String {
    match kind {
        Type::Array(element) => format!("{}[]", simple_name(element)),
        Type::Class(name, _) => {
            let erased = name.split('&').next().unwrap_or(name);
            erased.rsplit(['.', '$']).next().unwrap_or(erased).to_string()
        }
        other => other.name(),
    }
}
