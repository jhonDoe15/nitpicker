//! A type written in the source, as PMD's `TypesFromAst` builds it and `TypePrettyPrint` writes it: type annotations
//! where PMD attaches them, raw types, and the enclosing types of inner classes, written or implicit.
use super::ctx::{Ctx, TYPE_DECLARATIONS};
use super::message::{TypePrinter, written_type};
use crate::java::types::model::Type;

#[derive(Clone)]
enum Shown {
    Class { name: String, enclosing: Option<Box<Shown>>, arguments: Vec<Shown>, raw: bool, declared: bool, marks: Vec<Mark> },
    Variable(String, Vec<Mark>),
    Primitive(String, Vec<Mark>),
    Array(Box<Shown>, Vec<Mark>, bool),
    Wildcard(Option<(bool, Box<Shown>)>, Vec<Mark>),
    Unresolved(Option<Box<Shown>>, String, Vec<Shown>, Vec<Mark>),
}

/// A type annotation: PMD keeps them in a hash set keyed by the binary name, which iterates by ascending hash.
#[derive(Clone)]
struct Mark {
    hash: i32,
    binary: String,
    simple: String,
}

fn java_hash(text: &str) -> i32 {
    text.encode_utf16().fold(0i32, |hash, unit| hash.wrapping_mul(31).wrapping_add(unit as i32))
}

fn binary_name(ctx: &Ctx, name: &str) -> String {
    let parts: Vec<&str> = name.split('.').collect();
    let index = ctx.machine.resolver.index;
    let top = (1..=parts.len()).find(|at| index.get(&parts[..*at].join(".")).is_some());
    match top {
        Some(at) => [parts[..at].join(".")].into_iter().chain(parts[at..].iter().map(|part| part.to_string())).collect::<Vec<_>>().join("$"),
        None => name.to_string(),
    }
}

fn mark(ctx: &Ctx, annotation: u32) -> Mark {
    let written = || ctx.kid(annotation, "ClassType").map(|kind| {
        let mut text = String::new();
        written_type(ctx, kind, &mut text);
        text
    });
    let name = ctx.type_of(annotation).map(|kind| kind.erased().name()).or_else(written).unwrap_or_default();
    let binary = binary_name(ctx, &name);
    Mark { hash: java_hash(&binary), binary, simple: ctx.text(annotation, "SimpleName") }
}

/// Whether a declaration annotation also applies to the type: PMD `annotationAppliesTo(TYPE_USE)`.
pub fn on_type(ctx: &Ctx, annotation: u32) -> bool {
    let name = ctx.type_of(annotation).map(|kind| kind.erased().name());
    let target = crate::java::types::model::target::bit("TYPE_USE");
    name.and_then(|name| ctx.machine.resolver.index.get(&name)).is_some_and(|info| info.targets.is_none_or(|targets| targets & target != 0))
}

struct Build<'c, 'm, 'a, 't> {
    ctx: &'c Ctx<'m, 'a, 't>,
    printer: &'c TypePrinter<'c>,
    leftmost: u32,
    given: Vec<Mark>,
}

impl Build<'_, '_, '_, '_> {
    fn marks(&self, node: u32) -> Vec<Mark> {
        let mut marks: Vec<Mark> = self.ctx.kids_named(node, "Annotation").map(|annotation| mark(self.ctx, annotation)).collect();
        if node == self.leftmost {
            marks.extend(self.given.iter().cloned());
        }
        marks
    }

    fn node(&self, node: u32) -> Option<Shown> {
        let ctx = self.ctx;
        match ctx.name(node) {
            "ClassType" => self.class(node),
            "PrimitiveType" => Some(Shown::Primitive(ctx.text(node, "Kind"), self.marks(node))),
            "ArrayType" => {
                let element = self.node(ctx.nth(node, 0)?)?;
                let dims = ctx.kid(node, "ArrayDimensions").map(|dims| ctx.kids(dims).to_vec()).unwrap_or_default();
                Some(self.wrap(element, &dims, true))
            }
            "WildcardType" => {
                let bound = ctx.kids(node).iter().copied().find(|kid| !ctx.is(*kid, "Annotation"));
                let bound = match bound {
                    Some(bound) => Some((ctx.flag(node, "LowerBound"), Box::new(self.node(bound)?))),
                    None => None,
                };
                Some(Shown::Wildcard(bound, self.marks(node)))
            }
            _ => None,
        }
    }

    /// Array dimensions around a type: the last one written is the innermost.
    /// The written dimensions are outermost first, so the last one written is the innermost; `...` makes the
    /// outermost array a varargs one. Dimensions written after a parameter's name lose their annotations.
    fn wrap(&self, element: Shown, dims: &[u32], marked: bool) -> Shown {
        let varargs = dims.iter().any(|dim| self.ctx.flag(*dim, "Varargs"));
        let wrapped = dims.iter().rev().fold(element, |kind, dim| Shown::Array(Box::new(kind), if marked { self.marks(*dim) } else { Vec::new() }, false));
        match wrapped {
            Shown::Array(element, marks, _) if varargs => Shown::Array(element, marks, true),
            other => other,
        }
    }

    fn class(&self, node: u32) -> Option<Shown> {
        let ctx = self.ctx;
        let marks = self.marks(node);
        let name = match ctx.symbolic_type(node) {
            Some(Type::Variable(name)) => return Some(Shown::Variable(name, marks)),
            Some(Type::Class(name, _)) if !name.contains('&') && ctx.machine.resolver.index.get(&name).is_some() => name,
            Some(Type::Class(..)) | None => return self.unresolved(node, marks),
            _ => return None,
        };
        let enclosing = match (self.printer.inner(&name), ctx.kid(node, "ClassType")) {
            (Some(outer), Some(qualifier)) => {
                let written = self.node(qualifier)?;
                matches!(&written, Shown::Class { name, .. } if *name == outer).then_some(())?;
                Some(Box::new(written))
            }
            (Some(outer), None) => Some(Box::new(self.implicit(node, &outer)?)),
            (None, _) => None,
        };
        let mut arguments = Vec::new();
        if let Some(list) = ctx.kid(node, "TypeArguments").filter(|list| !ctx.flag(*list, "Diamond")) {
            for argument in ctx.kids(list) {
                arguments.push(self.node(*argument)?);
            }
        }
        let enclosed_raw = enclosing.as_deref().is_some_and(|outer| matches!(outer, Shown::Class { raw: true, .. }));
        let variables = self.variables(&name);
        let (raw, declared) = match () {
            _ if enclosed_raw => (true, false),
            _ if arguments.is_empty() && !variables.is_empty() => (enclosing.is_none(), enclosing.is_some()),
            _ => (false, false),
        };
        if declared {
            arguments = variables;
        }
        Some(Shown::Class { name, enclosing, arguments, raw, declared, marks })
    }

    /// A class neither the sources nor the class path hold: PMD's unresolved class, named as written and printed with
    /// a `*` in front.
    fn unresolved(&self, node: u32, marks: Vec<Mark>) -> Option<Shown> {
        let ctx = self.ctx;
        let written = ctx.source_text(node);
        let mut name = String::new();
        let mut depth = 0;
        for word in written.split_whitespace().filter(|word| !word.starts_with('@')) {
            for character in word.chars() {
                match character {
                    '<' => depth += 1,
                    '>' => depth -= 1,
                    _ if depth == 0 => name.push(character),
                    _ => {}
                }
            }
        }
        let plain = !name.is_empty() && name.split('.').all(|part| !part.is_empty() && part.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '$'));
        if !plain {
            return None;
        }
        let mut arguments = Vec::new();
        if let Some(list) = ctx.kid(node, "TypeArguments").filter(|list| !ctx.flag(*list, "Diamond")) {
            for argument in ctx.kids(list) {
                arguments.push(self.node(*argument)?);
            }
        }
        let enclosing = match ctx.kid(node, "ClassType").filter(|qualifier| !self.package_like(*qualifier)) {
            Some(qualifier) => Some(Box::new(self.node(qualifier)?)),
            None => None,
        };
        let name = if enclosing.is_some() { ctx.text(node, "SimpleName") } else { name };
        Some(Shown::Unresolved(enclosing, name, arguments, marks))
    }

    /// A qualifier PMD reads as a package: a simple name that is neither a known class nor imported by name.
    fn package_like(&self, qualifier: u32) -> bool {
        let ctx = self.ctx;
        if ctx.kid(qualifier, "ClassType").is_some() || matches!(ctx.symbolic_type(qualifier), Some(Type::Class(name, _)) if ctx.machine.resolver.index.get(&name).is_some()) {
            return false;
        }
        let simple = ctx.text(qualifier, "SimpleName");
        let suffix = format!(".{simple}");
        !ctx.all("ImportDeclaration").iter().any(|import| !ctx.flag(*import, "ImportOnDemand") && ctx.text(*import, "ImportedName").ends_with(&suffix))
    }

    fn variables(&self, name: &str) -> Vec<Shown> {
        let info = self.ctx.machine.resolver.index.get(name);
        info.map(|info| info.type_parameters.iter().map(|(name, _)| Shown::Variable(name.clone(), Vec::new())).collect()).unwrap_or_default()
    }

    /// The generic declaration of a class: its own type variables, inside that of its outer class.
    fn declaration(&self, name: &str) -> Shown {
        let variables = self.variables(name);
        let enclosing = self.printer.inner(name).map(|outer| Box::new(self.declaration(&outer)));
        Shown::Class { name: name.to_string(), enclosing, declared: !variables.is_empty(), arguments: variables, raw: false, marks: Vec::new() }
    }

    /// PMD's implicit enclosing type of an inner class written by its simple name: the class around the code, or the
    /// supertype of it that declares the inner class.
    fn implicit(&self, node: u32, outer: &str) -> Option<Shown> {
        let ctx = self.ctx;
        let index = ctx.machine.resolver.index;
        let mut around = ctx.enclosing(node, TYPE_DECLARATIONS);
        while let Some(owner) = around {
            let name = ctx.class_name(owner)?;
            if name == outer {
                return Some(self.declaration(outer));
            }
            if index.is_subtype(&name, outer) && self.printer.inner(outer).is_none() {
                let own = index.get(&name)?.type_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect();
                let arguments = index.arguments_as(&Type::Class(name, own), outer)?;
                return self.model(&Type::Class(outer.to_string(), arguments));
            }
            around = ctx.enclosing(owner, TYPE_DECLARATIONS).filter(|next| *next != owner);
        }
        None
    }

    fn model(&self, kind: &Type) -> Option<Shown> {
        let index = self.ctx.machine.resolver.index;
        Some(match kind {
            Type::Class(name, given) if self.printer.inner(name).is_none() && index.get(name).is_some() => {
                let arguments = given.iter().map(|given| self.model(given)).collect::<Option<Vec<_>>>()?;
                let raw = arguments.is_empty() && index.generic(name);
                Shown::Class { name: name.clone(), enclosing: None, arguments, raw, declared: false, marks: Vec::new() }
            }
            Type::Variable(name) => Shown::Variable(name.clone(), Vec::new()),
            Type::Primitive(name) => Shown::Primitive(name.to_string(), Vec::new()),
            Type::Array(element) => Shown::Array(Box::new(self.model(element)?), Vec::new(), false),
            Type::Wildcard => Shown::Wildcard(None, Vec::new()),
            Type::Bounded(lower, bound) => Shown::Wildcard(Some((*lower, Box::new(self.model(bound)?))), Vec::new()),
            _ => return None,
        })
    }
}

fn write_marks(marks: &[Mark], out: &mut String) {
    let mut marks: Vec<&Mark> = marks.iter().collect();
    marks.sort_by_key(|mark| mark.hash);
    marks.dedup_by(|one, other| one.binary == other.binary);
    for mark in marks {
        out.push('@');
        out.push_str(&mark.simple);
        out.push(' ');
    }
}

fn write(ctx: &Ctx, printer: &mut TypePrinter, shown: &Shown, out: &mut String) {
    match shown {
        Shown::Class { name, enclosing, arguments, raw, declared, marks } => {
            match enclosing {
                Some(outer) => {
                    write(ctx, printer, outer, out);
                    out.push('#');
                    write_marks(marks, out);
                    out.push_str(TypePrinter::simple(name));
                }
                None => {
                    write_marks(marks, out);
                    printer.class(name, &[], out);
                }
            }
            if *raw || arguments.is_empty() {
                return;
            }
            if *declared && printer.bounds != Some(false) {
                printer.bounds = Some(true);
                let bounds = class_bounds(ctx, printer, name);
                printer.known.extend(bounds);
            }
            out.push('<');
            for (at, argument) in arguments.iter().enumerate() {
                out.push_str(if at > 0 { ", " } else { "" });
                write(ctx, printer, argument, out);
            }
            out.push('>');
        }
        Shown::Unresolved(enclosing, name, arguments, marks) => {
            if let Some(outer) = enclosing {
                write(ctx, printer, outer, out);
                out.push('#');
            }
            write_marks(marks, out);
            out.push('*');
            out.push_str(if printer.qualify { name } else { name.rsplit('.').next().unwrap_or(name) });
            if !arguments.is_empty() {
                out.push('<');
                for (at, argument) in arguments.iter().enumerate() {
                    out.push_str(if at > 0 { ", " } else { "" });
                    write(ctx, printer, argument, out);
                }
                out.push('>');
            }
        }
        Shown::Variable(name, marks) => {
            write_marks(marks, out);
            printer.variable(name, out);
        }
        Shown::Primitive(name, marks) => {
            write_marks(marks, out);
            out.push_str(name);
        }
        Shown::Array(element, marks, varargs) => {
            write(ctx, printer, element, out);
            write_marks(marks, out);
            out.push_str(if *varargs { "..." } else { "[]" });
        }
        Shown::Wildcard(bound, marks) => {
            write_marks(marks, out);
            out.push('?');
            if let Some((lower, bound)) = bound {
                out.push_str(if *lower { " super " } else { " extends " });
                write(ctx, printer, bound, out);
            }
        }
    }
}

/// Writes the type of a declared variable (a field or a formal parameter) as PMD prints its type: the declaration's
/// own annotations that apply to types go on the leftmost part of the type, extra dimensions of the variable outside.
/// False, with nothing written, when a part of the type is not known.
pub fn write_declared(ctx: &Ctx, printer: &mut TypePrinter, holder: u32, kind: u32, variable: Option<u32>, out: &mut String) -> bool {
    let mut leftmost = kind;
    while let Some(inside) = match ctx.name(leftmost) {
        "ArrayType" => ctx.nth(leftmost, 0),
        "ClassType" => ctx.kid(leftmost, "ClassType"),
        _ => None,
    } {
        leftmost = inside;
    }
    let modifiers = ctx.kid(holder, "ModifierList");
    let given = modifiers.map(|list| ctx.kids_named(list, "Annotation").filter(|annotation| on_type(ctx, *annotation)).map(|annotation| mark(ctx, annotation)).collect()).unwrap_or_default();
    let shown = {
        let view = TypePrinter { index: printer.index, qualify: printer.qualify, bounds: None, known: Vec::new(), outer: Vec::new(), implicit: Vec::new() };
        let build = Build { ctx, printer: &view, leftmost, given };
        let extra = variable.and_then(|variable| ctx.kid(variable, "ArrayDimensions")).map(|dims| ctx.kids(dims).to_vec()).unwrap_or_default();
        let marked = !ctx.is(holder, "FormalParameter");
        build.node(kind).map(|shown| build.wrap(shown, &extra, marked))
    };
    let Some(shown) = shown else { return false };
    write(ctx, printer, &shown, out);
    true
}

/// The type parameters a declaration writes, with their bounds as written; `None` for an `Object` bound.
pub fn written_parameters(ctx: &Ctx, owner: u32) -> Vec<(String, Option<String>)> {
    let Some(parameters) = ctx.kid(owner, "TypeParameters") else { return Vec::new() };
    ctx.kids_named(parameters, "TypeParameter")
        .map(|parameter| {
            let bound = ctx.kids(parameter).iter().copied().find(|kid| ctx.name(*kid) != "Annotation").map(|kind| {
                let mut text = String::new();
                if ctx.is(kind, "IntersectionType") {
                    for (at, member) in narrowest(ctx, ctx.kids(kind)).into_iter().enumerate() {
                        text.push_str(if at > 0 { " & " } else { "" });
                        written_type(ctx, member, &mut text);
                    }
                } else {
                    written_type(ctx, kind, &mut text);
                }
                text
            });
            (ctx.text(parameter, "Name"), bound.filter(|text| text != "Object"))
        })
        .collect()
}

/// The members of an intersection that no other member is a subtype of, as PMD's greatest lower bound keeps them.
fn narrowest(ctx: &Ctx, members: &[u32]) -> Vec<u32> {
    let index = ctx.machine.resolver.index;
    let names: Vec<Option<String>> = members.iter().map(|member| ctx.type_of(*member).map(|kind| kind.erased().name())).collect();
    members
        .iter()
        .enumerate()
        .filter(|(at, _)| {
            let Some(name) = &names[*at] else { return true };
            !names.iter().enumerate().any(|(other, below)| other != *at && below.as_ref().is_some_and(|below| below != name && index.is_subtype(below, name)))
        })
        .map(|(_, member)| *member)
        .collect()
}

fn source_owner(ctx: &Ctx, declaring: &str) -> Option<u32> {
    TYPE_DECLARATIONS.iter().flat_map(|name| ctx.all(name).iter().copied()).find(|owner| ctx.class_name(*owner).as_deref() == Some(declaring))
}

/// Bounds of a declaration's type parameters from their types, with names as the printer writes them.
fn typed_parameters(ctx: &Ctx, printer: &mut TypePrinter, owner: u32) -> Option<Vec<(String, Option<String>)>> {
    let Some(parameters) = ctx.kid(owner, "TypeParameters") else { return Some(Vec::new()) };
    let mut out = Vec::new();
    for parameter in ctx.kids_named(parameters, "TypeParameter") {
        let bound = ctx.kids(parameter).iter().copied().find(|kid| ctx.name(*kid) != "Annotation");
        let members = match bound {
            Some(kind) if ctx.is(kind, "IntersectionType") => narrowest(ctx, ctx.kids(kind)),
            Some(kind) => vec![kind],
            None => Vec::new(),
        };
        let mut shown = Vec::new();
        for member in members {
            shown.extend(written_bound(ctx, printer, member)?);
        }
        out.push((ctx.text(parameter, "Name"), (!shown.is_empty()).then(|| shown.join(" & "))));
    }
    Some(out)
}

/// A bound written in the source as the printer writes it, wildcards kept; `None` for `Object`.
fn written_bound(ctx: &Ctx, printer: &mut TypePrinter, member: u32) -> Option<Option<String>> {
    let view = TypePrinter { index: printer.index, qualify: printer.qualify, bounds: None, known: Vec::new(), outer: Vec::new(), implicit: Vec::new() };
    let build = Build { ctx, printer: &view, leftmost: u32::MAX, given: Vec::new() };
    let Some(shown) = build.node(member) else { return Some(printer.bound(&ctx.symbolic_type(member)?)) };
    if matches!(&shown, Shown::Class { name, .. } if name == crate::java::types::model::OBJECT) {
        return Some(None);
    }
    let saved = printer.bounds.replace(false);
    let mut out = String::new();
    write(ctx, printer, &shown, &mut out);
    printer.bounds = saved;
    Some(Some(out))
}

/// The type parameters of a class with their bounds as PMD writes them: from the source when the file declares it.
pub fn class_bounds(ctx: &Ctx, printer: &mut TypePrinter, declaring: &str) -> Vec<(String, Option<String>)> {
    if let Some(owner) = source_owner(ctx, declaring) {
        let typed = if printer.qualify { typed_parameters(ctx, printer, owner) } else { None };
        return typed.unwrap_or_else(|| written_parameters(ctx, owner));
    }
    let info = ctx.machine.resolver.index.get(declaring);
    let parameters = info.map(|info| info.type_parameters.clone()).unwrap_or_default();
    let written = info.map(|info| info.written_bounds.clone()).unwrap_or_default();
    parameters.iter().enumerate().map(|(at, (name, erased))| (name.clone(), printer.bound(written.get(at).unwrap_or(erased)))).collect()
}
