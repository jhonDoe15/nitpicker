//! Calls from a constructor that reach a method a subclass can override.
use crate::java::pmd::coded::ctx::{Ctx, Hit};
use crate::java::types::expr::Call;
use crate::java::pmd::coded::message::{TypePrinter, written_type};
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

impl Walk<'_, '_, '_, '_> {
    fn declaration(&self, step: &Step) -> Option<u32> {
        let ctx = self.ctx;
        ctx.all("MethodDeclaration").iter().copied().find(|&method| {
            let owner = ctx.enclosing_type(method).and_then(|owner| ctx.class_name(owner)).unwrap_or_default();
            let parameters: Option<Vec<Type>> = ctx.kid(method, "FormalParameters").map(|list| {
                ctx.kids_named(list, "FormalParameter")
                    .filter_map(|formal| ctx.kid(formal, "VariableId").and_then(|id| ctx.type_of(id)).map(|kind| kind.erased()))
                    .collect()
            });
            owner == step.declaring
                && ctx.text(method, "Name") == step.method.name
                && parameters.as_ref() == Some(&step.method.parameters)
        })
    }

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
        let Some(declaration) = self.declaration(step) else { return Vec::new() };
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

fn source_bounds(ctx: &Ctx, declaring: &str) -> Option<Vec<(String, Option<String>)>> {
    let owner = super::super::ctx::TYPE_DECLARATIONS
        .iter()
        .flat_map(|name| ctx.all(name).iter().copied())
        .find(|owner| ctx.class_name(*owner).as_deref() == Some(declaring))?;
    let Some(parameters) = ctx.kid(owner, "TypeParameters") else { return Some(Vec::new()) };
    Some(
        ctx.kids_named(parameters, "TypeParameter")
            .map(|parameter| {
                let bound = ctx.kids(parameter).iter().copied().find(|kid| ctx.name(*kid) != "Annotation").map(|kind| {
                    let mut text = String::new();
                    written_type(ctx, kind, &mut text);
                    text
                });
                (ctx.text(parameter, "Name"), bound.filter(|text| text != "Object"))
            })
            .collect(),
    )
}

fn overload(ctx: &Ctx, step: &Step) -> String {
    let index = ctx.machine.resolver.index;
    let mut printer = TypePrinter { index, qualify: false, bounds: None, known: Vec::new() };
    let info = index.get(&step.declaring);
    let class_parameters = source_bounds(ctx, &step.declaring).unwrap_or_else(|| {
        let parameters = info.map(|info| info.type_parameters.clone()).unwrap_or_default();
        let written = info.map(|info| info.written_bounds.clone()).unwrap_or_default();
        parameters
            .iter()
            .enumerate()
            .map(|(at, (name, erased))| (name.clone(), printer.bound(written.get(at).unwrap_or(erased))))
            .collect()
    });
    let mut out = String::new();
    printer.known = class_parameters.clone();
    let variables: Vec<Type> = class_parameters.iter().map(|(name, _)| Type::Variable(name.clone())).collect();
    if !variables.is_empty() {
        printer.bounds = Some(true);
    }
    printer.class(&step.declaring, &variables, &mut out);
    out.push('.');
    let method = &step.method;
    let own: Vec<(String, Option<String>)> = method
        .type_parameters
        .iter()
        .zip(&method.type_bounds)
        .map(|(name, bound)| (name.clone(), printer.bound(bound)))
        .collect();
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
    printer.list(&method.generic_parameters, "", "", method.varargs, &mut out);
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
