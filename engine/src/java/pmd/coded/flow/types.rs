//! PMD's `ReachingDefsVisitor` for type declarations, initializers, constructors and the expressions that assign,
//! read or let `this` escape.
use super::span::{Pass, SpanId};
use super::{Special, Sym};
use crate::java::pmd::coded::ctx::TYPE_DECLARATIONS;
use std::rc::Rc;

const BODY_DECLARATIONS: &[&str] = &[
    "MethodDeclaration",
    "ConstructorDeclaration",
    "CompactConstructorDeclaration",
    "FieldDeclaration",
    "Initializer",
    "EnumConstant",
    "ExplicitConstructorInvocation",
];

impl Pass<'_, '_, '_, '_> {
    fn body_declarations(&self, class: u32) -> Vec<u32> {
        let ctx = self.ctx;
        let body = ctx.kids(class).iter().copied().find(|kid| ctx.name(*kid).ends_with("Body"));
        body.map(|body| ctx.kids(body).to_vec()).unwrap_or_default()
    }

    /// The fields a class declares, each with whether it is static.
    pub fn declared_fields(&mut self, class: u32) -> Rc<Vec<(u32, bool)>> {
        if let Some(known) = self.fields.get(&class) {
            return known.clone();
        }
        let ctx = self.ctx;
        let mut fields = Vec::new();
        if let Some(components) = ctx.kid(class, "RecordComponentList") {
            for component in ctx.kids_named(components, "RecordComponent") {
                fields.extend(ctx.kid(component, "VariableId"));
            }
        }
        for member in self.body_declarations(class) {
            match ctx.name(member) {
                "FieldDeclaration" => fields.extend(
                    ctx.kids_named(member, "VariableDeclarator").filter_map(|at| ctx.kid(at, "VariableId")),
                ),
                "EnumConstant" => fields.extend(ctx.kid(member, "VariableId")),
                _ => {}
            }
        }
        let fields: Rc<Vec<(u32, bool)>> =
            Rc::new(fields.into_iter().map(|field| (field, super::field_static(ctx, super::plain(field)))).collect());
        self.fields.insert(class, fields.clone());
        fields
    }

    pub fn type_declaration(&mut self, node: u32, data: SpanId) -> SpanId {
        let ctx = self.ctx;
        let saved = (self.class, self.in_static);
        self.class = node;
        self.initializers(node, data);
        for declaration in self.body_declarations(node) {
            if ctx.is(declaration, "MethodDeclaration") && ctx.kid(declaration, "Block").is_some() {
                let span = self.fork_capturing_non_local(data);
                let in_static = ctx.has_modifier(declaration, "static");
                self.declare_special(span, node, in_static);
                self.in_static = in_static;
                let end = self.visit(declaration, span);
                self.use_all_self_fields(end, in_static, node);
            } else if TYPE_DECLARATIONS.contains(&ctx.name(declaration)) {
                let span = self.fork_empty_non_local(data);
                self.type_declaration(declaration, span);
            }
        }
        (self.class, self.in_static) = saved;
        data
    }

    fn initializers(&mut self, class: u32, before: SpanId) {
        let ctx = self.ctx;
        let mut static_init = self.fork_empty_non_local(before);
        let (mut constructors, mut headers) = (Vec::new(), Vec::new());
        for declaration in self.body_declarations(class) {
            let fixed = match ctx.name(declaration) {
                "EnumConstant" => true,
                "FieldDeclaration" => ctx.has_modifier(declaration, "static"),
                "Initializer" => ctx.flag(declaration, "Static"),
                "ConstructorDeclaration" | "CompactConstructorDeclaration" => {
                    constructors.push(declaration);
                    continue;
                }
                _ => continue,
            };
            if fixed {
                self.in_static = true;
                static_init = self.visit(declaration, static_init);
            } else {
                headers.push(declaration);
            }
        }
        self.use_all_self_fields(static_init, true, class);
        let capture = self.fork_capturing_non_local(before);
        let mut header = self.absorb(capture, Some(static_init));
        self.declare_special(header, class, true);
        self.in_static = false;
        for declaration in headers {
            header = self.visit(declaration, header);
        }
        let mut end = constructors.is_empty().then_some(header);
        for constructor in constructors {
            let body = self.fork_capturing_non_local(header);
            self.declare_special(body, class, true);
            self.in_static = false;
            let state = self.visit(constructor, body);
            end = Some(match end {
                None => state,
                Some(end) => self.absorb(end, Some(state)),
            });
        }
        if let Some(end) = end {
            self.use_all_self_fields(end, false, class);
        }
    }

    pub fn use_all_self_fields(&mut self, state: SpanId, in_static: bool, class: u32) {
        for &(field, fixed) in self.declared_fields(class).iter() {
            let sym = super::plain(field);
            if !in_static || fixed {
                self.assign_out_of_scope(state, sym, class, Special::InitialField);
            }
        }
    }

    fn declare_special(&mut self, span: SpanId, class: u32, only_static: bool) {
        for &(field, fixed) in self.declared_fields(class).iter() {
            let sym = super::plain(field);
            if !only_static || fixed {
                self.assign(span, sym, field, Some(Special::InitialField));
            }
        }
    }

    fn assign_out_of_scope(&mut self, state: SpanId, var: Sym, escaping: u32, kind: Special) {
        if !self.spans[state].table.contains_key(&var) {
            return;
        }
        self.use_var(state, var, None);
        self.assign(state, var, escaping, Some(kind));
    }

    fn record_this_leak(&mut self, state: SpanId, escaping: u32) {
        for &(field, fixed) in self.declared_fields(self.class).iter() {
            let sym = super::plain(field);
            if !fixed {
                self.assign_out_of_scope(state, sym, escaping, Special::UnknownCall);
            }
        }
    }

    /// PMD's `JavaAstUtils.isInStaticCtx`.
    pub fn in_static_context(&self, node: u32) -> bool {
        let ctx = self.ctx;
        let found = std::iter::once(node)
            .chain(ctx.ancestors(node))
            .find(|at| BODY_DECLARATIONS.contains(&ctx.name(*at)) || TYPE_DECLARATIONS.contains(&ctx.name(*at)));
        found.is_some_and(|at| match ctx.name(at) {
            "MethodDeclaration" | "FieldDeclaration" => ctx.has_modifier(at, "static"),
            "Initializer" => ctx.flag(at, "Static"),
            "EnumConstant" | "ExplicitConstructorInvocation" => true,
            _ => false,
        })
    }

    pub fn expression(&mut self, node: u32, data: SpanId) -> SpanId {
        let ctx = self.ctx;
        match ctx.name(node) {
            "FormalParameter" | "CatchParameter" => {
                if let Some(variable) = ctx.kid(node, "VariableId") {
                    self.declare_blank(data, variable);
                }
                data
            }
            "VariableDeclarator" => {
                let Some(variable) = ctx.kid(node, "VariableId") else { return data };
                if let Some(rhs) = super::initializer(ctx, variable) {
                    self.visit(rhs, data);
                    self.assign(data, super::plain(variable), rhs, None);
                } else if !super::is_local_variable(ctx, variable) || super::is_foreach_variable(ctx, variable) {
                    self.declare_blank(data, variable);
                }
                data
            }
            "CompactConstructorDeclaration" => {
                let record = ctx.enclosing(node, &["RecordDeclaration"]);
                let components: Vec<u32> = record
                    .and_then(|record| ctx.kid(record, "RecordComponentList"))
                    .map(|list| ctx.kids_named(list, "RecordComponent").filter_map(|at| ctx.kid(at, "VariableId")).collect())
                    .unwrap_or_default();
                for component in &components {
                    self.assign(data, super::formal(*component), *component, None);
                }
                let data = self.children(node, data);
                for component in components {
                    self.use_var(data, super::formal(component), None);
                }
                data
            }
            "UnaryExpression" => {
                let operand = ctx.nth(node, 0);
                let data = self.visit_opt(operand, data);
                if super::pure(ctx, node) {
                    return data;
                }
                self.assignment(operand, node, true, data)
            }
            "AssignmentExpression" => {
                let (lhs, rhs) = (ctx.nth(node, 0), ctx.nth(node, 1));
                let data = self.visit_opt(rhs, data);
                let data = self.visit_opt(lhs, data);
                let compound = ctx.text(node, "Operator") != "=";
                match rhs {
                    Some(rhs) => self.assignment(lhs, rhs, compound, data),
                    None => data,
                }
            }
            "VariableAccess" => {
                self.read(node, data);
                data
            }
            "FieldAccess" => {
                let data = self.visit_opt(ctx.nth(node, 0), data);
                self.read(node, data);
                data
            }
            "ThisExpression" => {
                let allowed = ctx.parent(node).is_some_and(|parent| {
                    matches!(ctx.name(parent), "FieldAccess" | "SynchronizedStatement")
                });
                if !self.in_static && !allowed {
                    self.record_this_leak(data, node);
                }
                data
            }
            "MethodCall" => {
                if !self.in_static && self.call_on_this(node) {
                    self.record_this_leak(data, node);
                }
                self.invocation(node, data)
            }
            "ConstructorCall" => {
                let data = self.invocation(node, data);
                self.visit_opt(ctx.kid(node, "AnonymousClassDeclaration"), data);
                data
            }
            "ArrayAllocation" => {
                let data = self.visit_opt(ctx.kid(node, "ArrayInitializer"), data);
                let dimensions = ctx.kid(node, "ArrayType").and_then(|kind| ctx.kid(kind, "ArrayDimensions"));
                let data = self.visit_opt(dimensions, data);
                self.abrupt_by_throw(data, true);
                data
            }
            _ => self.children(node, data),
        }
    }

    fn read(&mut self, access: u32, data: SpanId) {
        if self.ctx.text(access, "AccessType") != "READ" {
            return;
        }
        if let Some(sym) = super::sym_of(self.ctx, access) {
            self.use_var(data, sym, Some(access));
        }
    }

    fn invocation(&mut self, call: u32, data: SpanId) -> SpanId {
        let ctx = self.ctx;
        let qualifier = ctx.nth(call, 0).filter(|first| ctx.is_expression(*first));
        let data = self.visit_opt(qualifier, data);
        let data = self.visit_opt(ctx.kid(call, "ArgumentList"), data);
        self.abrupt_by_throw(data, true);
        data
    }

    /// PMD's `isCallOnThisInstance` is not NO.
    fn call_on_this(&self, call: u32) -> bool {
        let ctx = self.ctx;
        if let Some(qualifier) = ctx.qualifier(call) {
            return matches!(ctx.name(qualifier), "ThisExpression" | "SuperExpression") && ctx.kids(qualifier).is_empty();
        }
        let Some((resolved, _)) = ctx.resolved(call) else { return true };
        let own = ctx.enclosing_type(call).and_then(|owner| ctx.class_name(owner)).unwrap_or_default();
        !resolved.method.is_static && resolved.declaring.replace('$', ".") == own.replace('$', ".")
    }

    fn assignment(&mut self, lhs: Option<u32>, rhs: u32, use_before: bool, result: SpanId) -> SpanId {
        let ctx = self.ctx;
        let Some(lhs) = lhs.filter(|lhs| matches!(ctx.name(*lhs), "VariableAccess" | "FieldAccess")) else {
            return result;
        };
        let Some(var) = super::sym_of(ctx, lhs) else { return result };
        if super::is_field(ctx, var) && !self.relevant_field(lhs, var) {
            return result;
        }
        if use_before {
            self.use_var(result, var, Some(lhs));
        }
        let old = self.assign(result, var, rhs, None);
        self.update_reaching(lhs, var, old.as_ref());
        result
    }

    fn relevant_field(&self, lhs: u32, var: Sym) -> bool {
        let ctx = self.ctx;
        let declaring = ctx.enclosing_type(var.node());
        let fixed = super::field_static(ctx, var);
        let this_access = !fixed
            && declaring == ctx.enclosing_type(lhs)
            && (ctx.is(lhs, "VariableAccess")
                || ctx.nth(lhs, 0).is_some_and(|on| ctx.is(on, "ThisExpression") && ctx.kids(on).is_empty()));
        (!self.in_static && this_access) || (fixed && declaring == Some(self.class))
    }
}
