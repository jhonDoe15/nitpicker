//! Calls from a constructor that reach a method a subclass can override.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::types::expr::Call;
use crate::java::pmd::coded::message::{TypePrinter, shown_parameters, written_type};
use crate::java::types::model::{Method, Type, flag};
use std::collections::HashMap;

const MESSAGE: &str = "Overridable method called during object construction: {0} ";
const MESSAGE_TRANSITIVE: &str =
    "This method may call an overridable method during object construction: {0} (call stack: [{1}])";

#[derive(Clone)]
struct Step {
    declaring: String,
    method: Method,
}

struct Walk<'c, 'm, 'a, 't> {
    ctx: &'c Ctx<'m, 'a, 't>,
    unsafe_methods: HashMap<u32, Vec<Step>>,
}

fn on_this(ctx: &Ctx, call: u32) -> bool {
    ctx.qualifier(call).is_none_or(|qualifier| ctx.is(qualifier, "ThisExpression") && ctx.kids(qualifier).is_empty())
}

fn overridable(method: &Method) -> bool {
    !method.is_private && !method.is_static && method.flags & flag::FINAL == 0
}

fn calls(ctx: &Ctx, body: Option<u32>) -> Vec<u32> {
    body.map(|body| ctx.descendants(body).into_iter().filter(|at| ctx.is(*at, "MethodCall")).collect())
        .unwrap_or_default()
}

fn declaration(ctx: &Ctx, step: &Step) -> Option<u32> {
    ctx.all("MethodDeclaration").iter().copied().find(|&method| {
        let owner = ctx.enclosing_type(method).and_then(|owner| ctx.class_name(owner)).unwrap_or_default();
        let parameters: Option<Vec<Type>> = ctx.kid(method, "FormalParameters").map(|list| {
            ctx.kids_named(list, "FormalParameter")
                .filter_map(|formal| ctx.kid(formal, "VariableId").and_then(|id| ctx.type_of(id)).map(|kind| kind.erased()))
                .collect()
        });
        owner == step.declaring && ctx.text(method, "Name") == step.method.name && parameters.as_ref() == Some(&step.method.parameters)
    })
}

impl Walk<'_, '_, '_, '_> {
    fn call_reason(&mut self, call: u32, guard: &[u32]) -> Vec<Step> {
        if !on_this(self.ctx, call) {
            return Vec::new();
        }
        let Some((Call { declaring, method, .. }, _)) = self.ctx.resolved(call) else { return Vec::new() };
        let step = Step { declaring, method };
        if overridable(&step.method) {
            return vec![step];
        }
        self.method_reason(&step, guard)
    }

    fn method_reason(&mut self, step: &Step, guard: &[u32]) -> Vec<Step> {
        if step.method.is_static {
            return Vec::new();
        }
        let Some(declaration) = declaration(self.ctx, step) else { return Vec::new() };
        if guard.contains(&declaration) {
            return Vec::new();
        }
        if let Some(known) = self.unsafe_methods.get(&declaration) {
            return known.clone();
        }
        let deeper: Vec<u32> = guard.iter().copied().chain([declaration]).collect();
        let body = self.ctx.kid(declaration, "Block");
        for call in calls(self.ctx, body).into_iter().filter(|call| on_this(self.ctx, *call)) {
            let reason = self.call_reason(call, &deeper);
            if !reason.is_empty() {
                let mut stack = vec![step.clone()];
                stack.extend(reason);
                self.unsafe_methods.entry(declaration).or_insert(stack);
                return self.unsafe_methods[&declaration].clone();
            }
        }
        Vec::new()
    }
}

/// The simple names of the annotations on each formal parameter of a method declaration, which PMD prints on the
/// parameter types.
fn parameter_annotations(ctx: &Ctx, method: u32) -> Vec<Vec<String>> {
    let Some(list) = ctx.kid(method, "FormalParameters") else { return Vec::new() };
    ctx.kids_named(list, "FormalParameter")
        .filter(|formal| !crate::java::pmd::coded::message::receiver(ctx, *formal))
        .map(|formal| {
            let on_type = |annotation: &u32| {
                let name = ctx.type_of(*annotation).map(|kind| kind.erased().name());
                let target = crate::java::types::model::target::bit("TYPE_USE");
                name.and_then(|name| ctx.machine.resolver.index.get(&name)).is_some_and(|info| info.targets.is_none_or(|targets| targets & target != 0))
            };
            let written = ctx.kids(formal).iter().copied().find(|kid| !matches!(ctx.name(*kid), "ModifierList" | "VariableId"));
            let qualified = written.is_some_and(|written| ctx.is(written, "ClassType") && ctx.kid(written, "ClassType").is_some());
            let modifiers = ctx.kid(formal, "ModifierList").filter(|_| !qualified);
            let mut annotations: Vec<u32> = modifiers.map(|modifiers| ctx.kids_named(modifiers, "Annotation").filter(on_type).collect()).unwrap_or_default();
            annotations.extend(written.filter(|written| ctx.is(*written, "ClassType")).map(|written| ctx.kids_named(written, "Annotation").collect::<Vec<_>>()).unwrap_or_default());
            annotations.into_iter().map(|annotation| ctx.text(annotation, "SimpleName")).collect()
        })
        .collect()
}

/// The type parameters a declaration writes, with their bounds as written; `None` for an `Object` bound.
fn written_parameters(ctx: &Ctx, owner: u32) -> Vec<(String, Option<String>)> {
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

fn source_bounds(ctx: &Ctx, declaring: &str) -> Option<Vec<(String, Option<String>)>> {
    let owner = super::super::ctx::TYPE_DECLARATIONS
        .iter()
        .flat_map(|name| ctx.all(name).iter().copied())
        .find(|owner| ctx.class_name(*owner).as_deref() == Some(declaring))?;
    Some(written_parameters(ctx, owner))
}

fn class_bounds(ctx: &Ctx, printer: &mut TypePrinter, declaring: &str) -> Vec<(String, Option<String>)> {
    source_bounds(ctx, declaring).unwrap_or_else(|| {
        let info = ctx.machine.resolver.index.get(declaring);
        let parameters = info.map(|info| info.type_parameters.clone()).unwrap_or_default();
        let written = info.map(|info| info.written_bounds.clone()).unwrap_or_default();
        parameters.iter().enumerate().map(|(at, (name, erased))| (name.clone(), printer.bound(written.get(at).unwrap_or(erased)))).collect()
    })
}

fn overload(ctx: &Ctx, step: &Step) -> String {
    let index = ctx.machine.resolver.index;
    let mut printer = TypePrinter::new(index, false);
    let mut chain = vec![step.declaring.clone()];
    while let Some(outer) = chain.last().and_then(|inner| printer.inner(inner)) {
        chain.push(outer);
    }
    let mut out = String::new();
    for class in chain.iter().rev() {
        let known = class_bounds(ctx, &mut printer, class);
        printer.known.extend(known);
    }
    if !printer.known.is_empty() {
        printer.bounds = Some(true);
    }
    printer.implicit = chain.clone();
    printer.declared(&step.declaring, &mut out);
    out.push('.');
    let method = &step.method;
    let declared = declaration(ctx, step);
    let written = declared.map(|declaration| written_parameters(ctx, declaration)).filter(|own| own.len() == method.type_parameters.len());
    let own: Vec<(String, Option<String>)> = written.unwrap_or_else(|| {
        method.type_parameters.iter().zip(&method.type_bounds).map(|(name, bound)| (name.clone(), printer.bound(bound))).collect()
    });
    printer.known.extend(own.iter().cloned());
    if !own.is_empty() {
        let saved = printer.bounds;
        printer.bounds = Some(true);
        let names: Vec<Type> = own.iter().map(|(name, _)| Type::Variable(name.clone())).collect();
        printer.list(&names, "<", "> ", false, &mut out);
        printer.bounds = saved;
    }
    out.push_str(&method.name);
    out.push('(');
    let variables: Vec<String> = printer.known.iter().map(|(name, _)| name.clone()).collect();
    let shown = shown_parameters(&method.shown, &variables).filter(|shown| shown.len() == method.generic_parameters.len());
    let parameters = shown.as_deref().unwrap_or(&method.generic_parameters);
    let marks = declared.map(|declaration| parameter_annotations(ctx, declaration)).filter(|marks| marks.len() == parameters.len());
    for (at, parameter) in parameters.iter().enumerate() {
        if at > 0 {
            out.push_str(", ");
        }
        for mark in marks.as_ref().map(|marks| marks[at].as_slice()).unwrap_or_default() {
            out.push('@');
            out.push_str(mark);
            out.push(' ');
        }
        printer.kind(parameter, method.varargs && at + 1 == parameters.len(), &mut out);
    }
    out.push(')');
    out
}

fn direct(ctx: &Ctx, call: u32, stack: &[Step]) -> bool {
    let [only] = stack else { return false };
    let generic_owner = ctx.machine.resolver.index.generic(&only.declaring);
    let own_class = ctx.enclosing_type(call).and_then(|owner| ctx.class_name(owner)).as_deref() == Some(&only.declaring);
    only.method.type_parameters.is_empty() && (!generic_owner || own_class)
}

pub fn constructor_calls_overridable_method(ctx: &Ctx, out: &mut Vec<Hit>) {
    let mut walk = Walk { ctx, unsafe_methods: HashMap::new() };
    for &constructor in ctx.all("ConstructorDeclaration") {
        let Some(owner) = ctx.enclosing_type(constructor) else { continue };
        if ctx.has_modifier(owner, "final") || ctx.annotation_present(owner, "lombok.Value") {
            continue;
        }
        for call in calls(ctx, ctx.kid(constructor, "Block")) {
            let stack = walk.call_reason(call, &[]);
            let Some(last) = stack.last() else { continue };
            let pattern = if direct(ctx, call, &stack) { MESSAGE } else { MESSAGE_TRANSITIVE };
            let shown: Vec<String> = stack.iter().map(|step| overload(ctx, step)).collect();
            out.push(Hit {
                node: call,
                args: vec![overload(ctx, last), shown.join(", ")],
                message: Some(pattern.to_string()),
            });
        }
    }
}
