//! Fields of serializable classes whose type cannot be serialized.
use crate::java::pmd::coded::constants::{Const, const_value};
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::pmd::coded::hit_with;
use crate::java::pmd::coded::message::TypePrinter;
use crate::java::types::model::{Type, flag};
use std::collections::{HashMap, HashSet};

const PERSISTENT_NAME: &str = "serialPersistentFields";
const PERSISTENT_TYPE: &str = "java.io.ObjectStreamField[]";
const OWNERS: &[&str] = &["ClassDeclaration", "EnumDeclaration", "RecordDeclaration"];
const TYPE_DECLARATIONS: &[&str] =
    &["ClassDeclaration", "EnumDeclaration", "RecordDeclaration", "AnnotationTypeDeclaration", "AnonymousClassDeclaration"];

fn fields(ctx: &Ctx, declaration: u32) -> Vec<u32> {
    ctx.descendants(declaration).into_iter().filter(|at| ctx.is(*at, "FieldDeclaration")).collect()
}

fn variables(ctx: &Ctx, field: u32) -> Vec<u32> {
    ctx.kids_named(field, "VariableDeclarator").filter_map(|declarator| ctx.kid(declarator, "VariableId")).collect()
}

fn private_static_final(ctx: &Ctx, field: u32) -> bool {
    ctx.text(field, "Visibility") == "private" && ctx.has_modifier(field, "static") && ctx.has_modifier(field, "final")
}

fn check_persistent_fields(ctx: &Ctx, declaration: u32, out: &mut Vec<Hit>) {
    for field in fields(ctx, declaration) {
        for variable in variables(ctx, field) {
            let name = ctx.text(variable, "Name");
            if name == PERSISTENT_NAME && (!ctx.type_is(variable, PERSISTENT_TYPE) || !private_static_final(ctx, field)) {
                out.push(Hit {
                    node: variable,
                    args: vec![name, PERSISTENT_TYPE.to_string()],
                    message: Some("The field ''{0}'' should be private static final with type ''{1}''.".to_string()),
                });
            }
        }
    }
}

fn manual_serialization(ctx: &Ctx, declaration: u32) -> bool {
    let (mut write_object, mut read_object, mut write_replace, mut read_resolve) = (false, false, false, false);
    for method in ctx.declarations(declaration, "MethodDeclaration") {
        let name = ctx.text(method, "Name");
        let formals: Vec<u32> =
            ctx.kid(method, "FormalParameters").map(|list| ctx.kids_named(list, "FormalParameter").collect()).unwrap_or_default();
        let first = formals.first().copied();
        let void = ctx.kid(method, "VoidType").is_some();
        let result = ctx.kids(method).iter().copied().find(|kid| {
            !matches!(ctx.name(*kid), "ModifierList" | "TypeParameters" | "FormalParameters" | "ThrowsList" | "Block")
        });
        let returns_object = result.is_some_and(|result| ctx.type_is_exactly(result, "java.lang.Object"));
        let streams = |kind: &str| formals.len() == 1 && first.is_some_and(|first| ctx.type_is(first, kind)) && void;
        write_object |= name == "writeObject" && streams("java.io.ObjectOutputStream");
        read_object |= name == "readObject" && streams("java.io.ObjectInputStream");
        write_replace |= name == "writeReplace" && formals.is_empty() && returns_object;
        read_resolve |= name == "readResolve" && formals.is_empty() && returns_object;
    }
    write_object && read_object || write_replace && read_resolve
}

fn literals(ctx: &Ctx, owner: u32) -> HashSet<String> {
    ctx.descendants(owner)
        .into_iter()
        .filter(|at| ctx.is(*at, "StringLiteral"))
        .filter_map(|literal| match const_value(ctx, literal) {
            Ok(Some(Const::Text(text))) => Some(text),
            _ => None,
        })
        .collect()
}

fn persistent_fields(ctx: &Ctx, declaration: u32) -> Option<HashSet<String>> {
    let mut found = None;
    for field in fields(ctx, declaration) {
        if !private_static_final(ctx, field) {
            continue;
        }
        for variable in variables(ctx, field) {
            if ctx.type_is(variable, PERSISTENT_TYPE) && ctx.text(variable, "Name") == PERSISTENT_NAME {
                found = ctx.parent(variable);
            }
        }
    }
    let declarator = found?;
    let mut names = literals(ctx, declarator);
    if names.is_empty()
        && let Some(access) = ctx.nth(declarator, 1).filter(|value| ctx.is(*value, "VariableAccess"))
        && let Some(owner) = ctx.usages().declaration(access).and_then(|variable| ctx.parent(variable))
    {
        names = literals(ctx, owner);
    }
    Some(names)
}

fn not_serializable(ctx: &Ctx, field: u32, variable: u32, check_abstract: bool) -> bool {
    let written = ctx.kids(field).iter().copied().find(|kid| !matches!(ctx.name(*kid), "ModifierList" | "VariableDeclarator"));
    if written.and_then(|written| ctx.symbolic_type(written)).is_some_and(|kind| matches!(kind, Type::Variable(_))) {
        return check_abstract && !ctx.type_is(variable, "java.io.Serializable");
    }
    let Some(kind) = ctx.type_of(variable) else { return false };
    match &kind {
        Type::Primitive(_) | Type::Null => false,
        Type::Variable(_) => check_abstract && !ctx.type_is(variable, "java.io.Serializable"),
        Type::Class(name, _) => {
            let Some(info) = ctx.machine.resolver.index.get(name) else { return false };
            let abstract_kind = name == crate::java::types::model::OBJECT
                || info.is_interface
                || info.flags & flag::ABSTRACT != 0;
            !ctx.type_is(variable, "java.io.Serializable") && (check_abstract || !abstract_kind)
        }
        _ => !ctx.type_is(variable, "java.io.Serializable"),
    }
}

pub fn non_serializable_class(ctx: &Ctx, out: &mut Vec<Hit>) {
    let check_abstract = ctx.property_flag("checkAbstractTypes", false);
    let mut owners: Vec<u32> = OWNERS.iter().flat_map(|name| ctx.all(name).iter().copied()).collect();
    owners.sort_unstable();
    for &owner in &owners {
        check_persistent_fields(ctx, owner, out);
    }
    let mut persistent: HashMap<u32, Option<HashSet<String>>> = HashMap::new();
    for &variable in ctx.all("VariableId") {
        let Some(declaration) = ctx.enclosing(variable, TYPE_DECLARATIONS) else { continue };
        let field = ctx.parent(variable).and_then(|parent| ctx.parent(parent)).filter(|at| ctx.is(*at, "FieldDeclaration"));
        let Some(field) = field else { continue };
        if !ctx.type_is(declaration, "java.io.Serializable")
            || ctx.type_is(declaration, "java.io.Externalizable")
            || manual_serialization(ctx, declaration)
        {
            continue;
        }
        let names = persistent.entry(declaration).or_insert_with(|| persistent_fields(ctx, declaration));
        let name = ctx.text(variable, "Name");
        if names.as_ref().is_some_and(|names| !names.contains(&name)) {
            continue;
        }
        if ctx.has_modifier(field, "static") || ctx.has_modifier(field, "transient") {
            continue;
        }
        if not_serializable(ctx, field, variable, check_abstract) {
            let mut shown = String::new();
            let written = ctx.kids(field).iter().copied().find(|kid| !matches!(ctx.name(*kid), "ModifierList" | "VariableDeclarator"));
            if let Some(kind) = written.and_then(|written| ctx.symbolic_type(written)).or_else(|| ctx.type_of(variable)) {
                let mut printer = TypePrinter::new(ctx.machine.resolver.index, true);
                let qualifier = written.filter(|written| ctx.is(*written, "ClassType")).and_then(|written| ctx.kid(written, "ClassType"));
                if let Some(Type::Class(_, given)) = qualifier.and_then(|qualifier| ctx.symbolic_type(qualifier)) {
                    printer.outer = given;
                } else if qualifier.is_none() {
                    let mut around = Some(declaration);
                    while let Some(owner) = around {
                        printer.implicit.extend(ctx.class_name(owner));
                        around = ctx.enclosing(owner, TYPE_DECLARATIONS).filter(|outer| *outer != owner);
                    }
                }
                printer.kind(&kind, false, &mut shown);
            }
            let owner = ctx.binary_name(declaration).unwrap_or_default();
            out.push(hit_with(variable, &[&name, &owner, &shown]));
        }
    }
}
