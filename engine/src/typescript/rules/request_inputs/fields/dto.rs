//! `dto-fields.mts`: class-validator DTO fields, through `extends`, the Nest mapped types and `createZodDto`.
use super::super::bindings::{decorator_call, decorators_of, declaration_of, import_of, is_from_package, resolved_expression, DecoratorCall};
use super::super::tree::{inherited, key_name, name_of, Tree, T};
use super::{schema_problems, Finding, Kind, Problem};
use crate::typescript::rules::support::view::Node;

const MAX_CLASSES: usize = 8;
const VALIDATOR_PACKAGE: &str = "class-validator";
const PICK_TYPE: &str = "PickType";
const NEUTRAL_PACKAGES: [&str; 4] = ["@nestjs/swagger", "@nestjs/graphql", VALIDATOR_PACKAGE, "class-transformer"];
const VALIDATOR_KINDS: [(&str, Kind); 11] = [
    ("IsInt", Kind::Number),
    ("IsNumber", Kind::Number),
    ("IsPositive", Kind::Number),
    ("IsNegative", Kind::Number),
    ("Min", Kind::Number),
    ("Max", Kind::Number),
    ("IsDivisibleBy", Kind::Number),
    ("IsBoolean", Kind::Boolean),
    ("IsDate", Kind::Date),
    ("MinDate", Kind::Date),
    ("MaxDate", Kind::Date),
];
const KIND_ORDER: [Kind; 3] = [Kind::Boolean, Kind::Date, Kind::Number];
const MAPPED_TYPES: [&str; 4] = ["PartialType", PICK_TYPE, "OmitType", "IntersectionType"];

struct Role {
    kind: Option<Kind>,
    form: Option<String>,
    coerces: bool,
    casts_boolean: bool,
}

const COERCING: Role = Role { kind: None, form: None, coerces: true, casts_boolean: false };
const INERT: Role = Role { kind: None, form: None, coerces: false, casts_boolean: false };

#[derive(Clone)]
enum Keep {
    All,
    Names(Vec<Option<String>>, bool),
    Both(Box<Keep>, Box<Keep>),
}

impl Keep {
    fn keeps(&self, field: &str) -> bool {
        match self {
            Keep::All => true,
            Keep::Names(names, pick) => names.iter().any(|name| name.as_deref() == Some(field)) == *pick,
            Keep::Both(first, second) => first.keeps(field) && second.keeps(field),
        }
    }
}

#[derive(Clone)]
struct Hidden {
    hidden: Vec<Option<String>>,
    keep: Keep,
}

impl Hidden {
    fn visible(&self, field: &str) -> bool {
        !self.hidden.iter().any(|name| name.as_deref() == Some(field)) && self.keep.keeps(field)
    }
}

fn returns_boolean(tree: &Tree, argument: Option<&T>) -> bool {
    let Some(arrow) = argument.and_then(|argument| argument.bare()).filter(|arrow| arrow.is("ArrowFunctionExpression")) else { return false };
    tree.field(arrow, "body").and_then(T::bare).is_some_and(|body| body.is("Identifier") && body.name().as_deref() == Some("Boolean"))
}

fn transformer_role(tree: &Tree, call: &DecoratorCall) -> Role {
    match call.name.as_deref() {
        Some("Transform") => COERCING,
        Some("Type") => {
            let casts_boolean = returns_boolean(tree, call.arguments.first());
            Role { kind: None, form: None, casts_boolean, coerces: !casts_boolean }
        }
        _ => INERT,
    }
}

fn validator_kind(name: &str) -> Option<Kind> {
    VALIDATOR_KINDS.iter().find(|(key, _)| *key == name).map(|(_, kind)| kind.clone()).or_else(|| inherited(name).map(Kind::Other))
}

fn decorator_role(tree: &Tree, decorator: Node) -> Role {
    let call = decorator_call(tree, decorator);
    if call.base.is_none() {
        return COERCING;
    }
    if is_from_package(tree, call.base, &[VALIDATOR_PACKAGE]) {
        let kind = call.name.as_deref().and_then(validator_kind);
        return Role { kind, form: Some(format!("@{}()", call.name.as_deref().unwrap_or_default())), coerces: false, casts_boolean: false };
    }
    if is_from_package(tree, call.base, &["class-transformer"]) {
        return transformer_role(tree, &call);
    }
    if is_from_package(tree, call.base, &NEUTRAL_PACKAGES) { INERT } else { COERCING }
}

fn property_problem(tree: &Tree, property: Node) -> Option<Problem> {
    let roles: Vec<Role> = decorators_of(property).into_iter().map(|decorator| decorator_role(tree, decorator)).collect();
    let kind = KIND_ORDER.iter().find(|name| roles.iter().any(|role| role.kind.as_ref() == Some(*name)))?.clone();
    if roles.iter().any(|role| role.coerces) {
        return None;
    }
    let form = roles.iter().find(|role| role.kind.as_ref() == Some(&kind)).and_then(|role| role.form.clone()).unwrap_or_default();
    if kind == Kind::Boolean && roles.iter().any(|role| role.casts_boolean) {
        return Some(Problem { kind, cast: true, form: "@Type(() => Boolean)".to_string(), library: VALIDATOR_PACKAGE, fix: None });
    }
    Some(Problem { kind, cast: false, form, library: VALIDATOR_PACKAGE, fix: None })
}

fn key_filter(tree: &Tree, name: Option<&str>, argument: Option<T>) -> Keep {
    let keys = resolved_expression(tree, argument).and_then(T::bare).filter(|keys| keys.is("ArrayExpression"));
    let picker = name == Some(PICK_TYPE) || name == Some("OmitType");
    match keys {
        Some(keys) if picker => Keep::Names(tree.fields(keys, "elements").into_iter().map(name_of).collect(), name == Some(PICK_TYPE)),
        _ => Keep::All,
    }
}

fn heritage_base<'v>(tree: &Tree<'v>, declaration: Node<'v>) -> Option<T<'v>> {
    tree.field(declaration, "superClass")
}

struct Mapped<'v> {
    name: Option<String>,
    schema: Option<T<'v>>,
    sources: Vec<Node<'v>>,
}

fn mapped_sources<'v>(tree: &Tree<'v>, base: T<'v>) -> Mapped<'v> {
    let none = Mapped { name: None, schema: None, sources: Vec::new() };
    let Some(call) = base.bare().filter(|call| call.is("CallExpression")) else { return none };
    let Some(callee) = tree.field(call, "callee").and_then(T::bare).filter(|callee| callee.is("Identifier")) else { return none };
    let name = import_of(tree, callee).and_then(|binding| binding.imported).or_else(|| callee.name().map(|name| name.into_owned()));
    let arguments: Vec<Option<T>> = tree.fields(call, "arguments");
    if name.as_deref() == Some("createZodDto") {
        return Mapped { name, schema: arguments.first().copied().flatten(), sources: Vec::new() };
    }
    if !name.as_deref().is_some_and(|name| MAPPED_TYPES.contains(&name)) {
        return Mapped { name, schema: None, sources: Vec::new() };
    }
    let taken = if name.as_deref() == Some("IntersectionType") { arguments.len() } else { arguments.len().min(1) };
    let sources = arguments[..taken].iter().flatten().filter_map(|argument| argument.bare().filter(|node| node.is("Identifier"))).collect();
    Mapped { name, schema: None, sources }
}

fn own_properties<'v>(tree: &Tree<'v>, declaration: Node<'v>) -> Vec<Node<'v>> {
    let body = declaration.node("body").map(|body| body.nodes("body")).unwrap_or_default();
    body.into_iter().filter(|member| is_property_declaration(*member) && key_name(tree, *member).is_some()).collect()
}

fn is_property_declaration(member: Node) -> bool {
    matches!(member.kind(), "PropertyDefinition" | "TSAbstractPropertyDefinition" | "AccessorProperty" | "TSAbstractAccessorProperty")
}

fn own_problems<'v>(tree: &Tree<'v>, declaration: Node<'v>, entry: &Hidden) -> Vec<Finding<'v>> {
    own_properties(tree, declaration).into_iter().filter_map(|member| {
        let field = key_name(tree, member)?;
        let problem = if entry.visible(&field) { property_problem(tree, member)? } else { return None };
        Some(Finding { field, node: T { node: member, level: 0 }, problem })
    }).collect()
}

struct ClassEntry<'v> {
    identifier: Node<'v>,
    hidden: Hidden,
}

fn class_declaration<'v>(tree: &Tree<'v>, name: Node<'v>) -> Option<Node<'v>> {
    let mut pending = vec![name];
    let mut index = 0;
    while index < pending.len() {
        let current = pending[index];
        index += 1;
        let declaration = if current.is("Identifier") { declaration_of(tree, current) } else { None };
        if let Some(declaration) = declaration.filter(|declaration| declaration.is("ClassDeclaration")) {
            return Some(declaration);
        }
        let target = declaration.filter(|declaration| declaration.is("TSTypeAliasDeclaration")).and_then(|alias| alias.node("typeAnnotation")).filter(|alias| alias.is("TSTypeReference")).and_then(|alias| alias.node("typeName"));
        if let Some(target) = target.filter(|_| pending.len() < MAX_CLASSES) {
            pending.push(target);
        }
    }
    None
}

pub fn class_problems<'v>(tree: &Tree<'v>, name: Node<'v>) -> Option<Vec<Finding<'v>>> {
    class_declaration(tree, name)?;
    let mut pending = vec![ClassEntry { identifier: name, hidden: Hidden { hidden: Vec::new(), keep: Keep::All } }];
    let mut problems = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        let Some(declaration) = class_declaration(tree, pending[index].identifier) else {
            index += 1;
            continue;
        };
        let entry = pending[index].hidden.clone();
        index += 1;
        let mut hidden = entry.hidden.clone();
        hidden.extend(own_properties(tree, declaration).into_iter().map(|member| key_name(tree, member)));
        problems.extend(own_problems(tree, declaration, &entry));
        let Some(base) = heritage_base(tree, declaration) else { continue };
        if base.is("Identifier") {
            if pending.len() < MAX_CLASSES {
                pending.push(ClassEntry { identifier: base.node, hidden: Hidden { hidden, keep: entry.keep } });
            }
            continue;
        }
        let mapped = mapped_sources(tree, base);
        let keys = base.bare().filter(|call| call.is("CallExpression")).and_then(|call| tree.fields(call, "arguments").get(1).copied().flatten());
        let keep = Keep::Both(Box::new(entry.keep), Box::new(key_filter(tree, mapped.name.as_deref(), keys)));
        let schema_entry = Hidden { hidden: hidden.clone(), keep: keep.clone() };
        if let Some(schema) = mapped.schema {
            problems.extend(schema_problems(tree, Some(schema)).unwrap_or_default().into_iter().filter(|finding| schema_entry.visible(&finding.field)));
        }
        let room = MAX_CLASSES.saturating_sub(pending.len());
        for identifier in mapped.sources.into_iter().take(room) {
            pending.push(ClassEntry { identifier, hidden: Hidden { hidden: hidden.clone(), keep: keep.clone() } });
        }
    }
    Some(problems)
}
