//! Which declaration each variable name of a file stands for, as PMD's usage resolution finds it: every
//! `VariableAccess` and `FieldAccess` tied to the `VariableId` of this file it reads or writes.
mod fields;
mod patterns;
mod reach;

use super::ctx::Ctx;
use std::collections::HashMap;

/// Nodes a search for the `break`s of a loop does not enter, as PMD's find boundaries.
const BOUNDARIES: &[&str] = &[
    "ClassDeclaration",
    "EnumDeclaration",
    "RecordDeclaration",
    "AnnotationTypeDeclaration",
    "AnonymousClassDeclaration",
    "LambdaExpression",
    "LocalClassStatement",
];

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
            types: HashMap::new(),
            found: Usages::default(),
            again: None,
        };
        walk.types = walk.types_in_file();
        for root in 0..ctx.tree.nodes.len() as u32 {
            if ctx.parent(root).is_none() {
                walk.node(root);
            }
        }
        walk.qualified();
        walk.found.of.values_mut().for_each(|accesses| accesses.sort_unstable());
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
    types: HashMap<String, Vec<(String, u32)>>,
    found: Usages,
    again: Option<u32>,
}

impl Walk<'_, '_, '_, '_> {
    fn declare(&mut self, variable: u32) {
        let name = self.ctx.text(variable, "Name");
        self.names.push((name, variable));
    }

    fn bind(&mut self, access: u32, variable: u32) {
        if let Some(earlier) = self.found.declared.insert(access, variable) {
            self.found.of.entry(earlier).or_default().retain(|known| *known != access);
        }
        self.found.of.entry(variable).or_default().push(access);
    }

    fn scoped(&mut self, run: impl FnOnce(&mut Self)) {
        let mark = self.names.len();
        run(self);
        self.names.truncate(mark);
    }

    fn kids_of(&mut self, id: u32) {
        for kid in self.ctx.kids(id).to_vec() {
            self.node(kid);
        }
    }

    /// PMD's `SymbolTableResolver` visitor for every node that is not taken as a statement of a block.
    fn node(&mut self, id: u32) {
        let ctx = self.ctx;
        let kids = ctx.kids(id).to_vec();
        match ctx.name(id) {
            "ClassBody" | "EnumBody" | "RecordBody" | "AnnotationTypeBody" => {
                let fields = self.type_fields(id);
                self.fields.push(fields.clone());
                self.scoped(|walk| {
                    walk.names.extend(fields);
                    walk.kids_of(id);
                });
                self.fields.pop();
            }
            "MethodDeclaration"
            | "ConstructorDeclaration"
            | "LambdaExpression"
            | "CatchClause"
            | "CompactConstructorDeclaration"
            | "Initializer" => self.scoped(|walk| walk.kids_of(id)),
            "Block" => self.scoped(|walk| walk.block_like(&kids)),
            "SwitchStatement" | "SwitchExpression" => self.switch(id),
            "ForeachStatement" => self.scoped(|walk| {
                kids.get(1).into_iter().for_each(|iterable| walk.node(*iterable));
                let variable = kids.first().and_then(|declaration| ctx.kid(*declaration, "VariableDeclarator"));
                variable.and_then(|declarator| ctx.kid(declarator, "VariableId")).into_iter().for_each(|at| walk.declare(at));
                kids.iter().skip(2).for_each(|body| walk.node(*body));
            }),
            "TryStatement" => {
                let resources = ctx.kid(id, "ResourceList");
                self.scoped(|walk| {
                    for resource in resources.map(|list| ctx.kids(list).to_vec()).unwrap_or_default() {
                        match ctx.nth(resource, 0) {
                            Some(declaration) if ctx.is(declaration, "LocalVariableDeclaration") => walk.declaration_statement(declaration),
                            Some(concise) => walk.node(concise),
                            None => {}
                        }
                    }
                    ctx.kid(id, "Block").into_iter().for_each(|body| walk.node(body));
                });
                let rest = kids.iter().filter(|kid| !matches!(ctx.name(**kid), "ResourceList" | "Block"));
                rest.for_each(|kid| self.node(*kid));
            }
            "InfixExpression" => {
                let operator = ctx.text(id, "Operator");
                kids.first().into_iter().for_each(|left| self.node(*left));
                let left = kids.first().map(|left| self.binders(*left)).unwrap_or_default();
                let bound = match operator.as_str() {
                    "&&" => left.when_true,
                    "||" => left.when_false,
                    _ => Vec::new(),
                };
                self.scoped(|walk| {
                    walk.declare_all(&bound);
                    kids.iter().skip(1).for_each(|right| walk.node(*right));
                });
            }
            "ConditionalExpression" => {
                kids.first().into_iter().for_each(|condition| self.node(*condition));
                let bindings = kids.first().map(|condition| self.binders(*condition)).unwrap_or_default();
                for (branch, bound) in kids.iter().skip(1).zip([bindings.when_true, bindings.when_false]) {
                    self.scoped(|walk| {
                        walk.declare_all(&bound);
                        walk.node(*branch);
                    });
                }
            }
            "VariableId" => {
                let parameter = ctx
                    .parent(id)
                    .is_some_and(|parent| matches!(ctx.name(parent), "FormalParameter" | "LambdaParameter" | "CatchParameter"));
                if parameter {
                    self.declare(id);
                }
                self.kids_of(id);
            }
            "AnonymousClassDeclaration" if self.again.is_some() => {}
            "VariableAccess" if self.again.is_some_and(|declaration| !self.restamped(id, declaration)) => self.kids_of(id),
            "VariableAccess" => {
                let name = ctx.text(id, "Name");
                let found = self.names.iter().rev().find(|(known, _)| *known == name).map(|(_, at)| *at);
                match self.inherited(id, found, &name) {
                    Some(inherited) => inherited.into_iter().for_each(|variable| self.bind(id, variable)),
                    None => found.or_else(|| self.imported(&name)).into_iter().for_each(|variable| self.bind(id, variable)),
                }
                self.kids_of(id);
            }
            "FieldAccess" => {
                let on_this = kids.first().is_some_and(|first| ctx.is(*first, "ThisExpression") && ctx.kids(*first).is_empty());
                if on_this {
                    let name = ctx.text(id, "Name");
                    let field = self.fields.last().and_then(|fields| fields.iter().find(|(known, _)| *known == name));
                    if let Some(&(_, variable)) = field {
                        self.bind(id, variable);
                    }
                }
                self.kids_of(id);
            }
            _ => self.kids_of(id),
        }
    }
}
