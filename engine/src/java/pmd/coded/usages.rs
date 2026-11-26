//! Which declaration each variable name of a file stands for, as PMD's usage resolution finds it: every
//! `VariableAccess`, and every `FieldAccess` on a plain `this`, tied to the `VariableId` it reads or writes.
use super::ctx::Ctx;
use std::collections::HashMap;

#[derive(Default)]
pub struct Usages {
    of: HashMap<u32, Vec<u32>>,
    declared: HashMap<u32, u32>,
}

impl Usages {
    pub fn of(ctx: &Ctx) -> Usages {
        let mut walk = Walk {
            ctx,
            names: Vec::new(),
            fields: Vec::new(),
            found: Usages::default(),
        };
        for root in 0..ctx.tree.nodes.len() as u32 {
            if ctx.parent(root).is_none() {
                walk.node(root);
            }
        }
        walk.found
    }

    /// The accesses of a variable in its file, in document order.
    pub fn of_variable(&self, variable: u32) -> &[u32] {
        self.of.get(&variable).map(Vec::as_slice).unwrap_or_default()
    }

    /// The `VariableId` an access stands for, when it is declared in this file.
    pub fn declaration(&self, access: u32) -> Option<u32> {
        self.declared.get(&access).copied()
    }
}

struct Walk<'c, 'm, 'a, 't> {
    ctx: &'c Ctx<'m, 'a, 't>,
    names: Vec<(String, u32)>,
    fields: Vec<Vec<(String, u32)>>,
    found: Usages,
}

impl Walk<'_, '_, '_, '_> {
    fn declare(&mut self, variable: u32) {
        let name = self.ctx.text(variable, "Name");
        self.names.push((name, variable));
    }

    fn bind(&mut self, access: u32, variable: u32) {
        self.found.of.entry(variable).or_default().push(access);
        self.found.declared.insert(access, variable);
    }

    fn type_fields(&self, body: u32) -> Vec<(String, u32)> {
        let ctx = self.ctx;
        let mut fields = Vec::new();
        let mut add = |variable: u32| fields.push((ctx.text(variable, "Name"), variable));
        if let Some(components) = ctx.parent(body).and_then(|owner| ctx.kid(owner, "RecordComponentList")) {
            for component in ctx.kids_named(components, "RecordComponent") {
                ctx.kid(component, "VariableId").into_iter().for_each(&mut add);
            }
        }
        for member in ctx.kids(body).iter().copied() {
            match ctx.name(member) {
                "FieldDeclaration" => {
                    for declarator in ctx.kids_named(member, "VariableDeclarator") {
                        ctx.kid(declarator, "VariableId").into_iter().for_each(&mut add);
                    }
                }
                "EnumConstant" => ctx.kid(member, "VariableId").into_iter().for_each(&mut add),
                _ => {}
            }
        }
        fields
    }

    fn scoped(&mut self, run: impl FnOnce(&mut Self)) {
        let mark = self.names.len();
        run(self);
        self.names.truncate(mark);
    }

    fn kids(&mut self, id: u32) {
        for kid in self.ctx.kids(id).to_vec() {
            self.node(kid);
        }
    }

    fn node(&mut self, id: u32) {
        let ctx = self.ctx;
        match ctx.name(id) {
            "ClassBody" | "EnumBody" | "RecordBody" | "AnnotationTypeBody" => {
                let fields = self.type_fields(id);
                self.fields.push(fields.clone());
                self.scoped(|walk| {
                    walk.names.extend(fields);
                    walk.kids(id);
                });
                self.fields.pop();
            }
            "Block"
            | "MethodDeclaration"
            | "ConstructorDeclaration"
            | "LambdaExpression"
            | "CatchClause"
            | "ForStatement"
            | "ForeachStatement"
            | "TryStatement"
            | "SwitchStatement"
            | "SwitchArrowBranch"
            | "CompactConstructorDeclaration"
            | "Initializer" => {
                self.scoped(|walk| walk.kids(id));
            }
            "VariableDeclarator" => {
                if let Some(variable) = ctx.kid(id, "VariableId") {
                    self.declare(variable);
                }
                self.kids(id);
            }
            "VariableId" => {
                if !ctx
                    .parent(id)
                    .is_some_and(|parent| ctx.is(parent, "VariableDeclarator"))
                    && self.declared_here(id)
                {
                    self.declare(id);
                }
                self.kids(id);
            }
            "VariableAccess" => {
                let name = ctx.text(id, "Name");
                if let Some((_, variable)) = self.names.iter().rev().find(|(known, _)| *known == name) {
                    self.bind(id, *variable);
                }
                self.kids(id);
            }
            "FieldAccess" => {
                let on_this = ctx
                    .nth(id, 0)
                    .is_some_and(|first| ctx.is(first, "ThisExpression") && ctx.kids(first).is_empty());
                if on_this {
                    let name = ctx.text(id, "Name");
                    let field = self
                        .fields
                        .last()
                        .and_then(|fields| fields.iter().find(|(known, _)| *known == name));
                    if let Some((_, variable)) = field {
                        self.bind(id, *variable);
                    }
                }
                self.kids(id);
            }
            _ => self.kids(id),
        }
    }

    /// Whether a `VariableId` outside a declarator names a variable here: parameters, catch and resource variables,
    /// loop variables and pattern variables; fields of a type are named when its body is entered.
    fn declared_here(&self, variable: u32) -> bool {
        let ctx = self.ctx;
        ctx.parent(variable)
            .is_some_and(|parent| !matches!(ctx.name(parent), "EnumConstant" | "RecordComponent"))
    }
}
