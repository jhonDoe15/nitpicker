//! PMD's `DataflowPass`: reaching definitions over a file, as UnusedAssignment, ImplicitSwitchFallThrough and
//! InvalidLogMessageFormat read them. Ported step by step so that every quirk of PMD's walk carries over.
mod loops;
mod rules;
mod span;
mod types;
mod visit;

use super::ctx::Ctx;
use super::Port;
use std::collections::HashMap;
use std::rc::Rc;

pub fn port(class: &str) -> Option<Port> {
    Some(match class {
        "UnusedAssignmentRule" => rules::unused_assignment,
        "ImplicitSwitchFallThroughRule" => rules::implicit_switch_fall_through,
        _ => return None,
    })
}

/// A variable: the `VariableId` that declares it, or, with `FORMAL` set, the constructor parameter a record
/// component stands for inside a compact constructor.
#[derive(Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord, Debug)]
pub struct Sym(u32);

const FORMAL: u32 = 1 << 31;

impl Sym {
    pub fn node(self) -> u32 {
        self.0 & !FORMAL
    }

    fn formal(self) -> bool {
        self.0 & FORMAL != 0
    }
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Special {
    UnknownCall,
    InitialField,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Tri {
    No,
    Yes,
    Unknown,
}

pub struct Entry {
    pub var: Sym,
    pub node: u32,
    pub rhs: u32,
    pub unbound: Option<Special>,
}

pub type Defs = Rc<Vec<u32>>;

/// PMD's `ReachingDefinitionSet`.
#[derive(Clone)]
pub struct Reaching {
    pub set: Vec<u32>,
    pub not_fully_known: bool,
}

#[derive(Default)]
pub struct Flow {
    pub entries: Vec<Entry>,
    pub unused: Vec<u32>,
    pub killers: HashMap<u32, Vec<u32>>,
    pub falls: HashMap<u32, Tri>,
    pub reaching: HashMap<u32, Reaching>,
}

impl Flow {
    pub fn of(ctx: &Ctx) -> Flow {
        span::Pass::run(ctx)
    }

    /// PMD's `getReachingDefinitions`: the right-hand sides of the assignments that reach an access, nothing when
    /// the set is not fully known.
    pub fn reaching_definitions(&self, ctx: &Ctx, access: u32) -> Option<Vec<u32>> {
        if let Some(found) = self.reaching.get(&access) {
            let known = found.set.iter().map(|entry| self.entries[*entry as usize].rhs);
            return (!found.not_fully_known).then(|| known.collect());
        }
        let sym = sym_of(ctx, access)?;
        let node = sym.node();
        if !is_field(ctx, sym) {
            return is_local_variable(ctx, node).then(Vec::new);
        }
        if !field_final(ctx, sym) {
            return None;
        }
        let mut rhs: Vec<u32> = Vec::new();
        for &usage in ctx.usages().of_variable(node) {
            if ctx.text(usage, "AccessType") != "WRITE" {
                continue;
            }
            let Some(parent) = ctx.parent(usage) else { continue };
            let found = if ctx.is(parent, "UnaryExpression") && !pure(ctx, parent) {
                Some(parent)
            } else if ctx.is(parent, "AssignmentExpression") && ctx.nth(parent, 0) == Some(usage) {
                ctx.nth(parent, 1)
            } else {
                None
            };
            if let Some(found) = found.filter(|found| !rhs.contains(found)) {
                rhs.push(found);
            }
        }
        if let Some(init) = initializer(ctx, node).filter(|init| !rhs.contains(init)) {
            rhs.push(init);
        }
        Some(rhs)
    }
}

pub fn pure(ctx: &Ctx, unary: u32) -> bool {
    !matches!(ctx.text(unary, "Operator").as_str(), "++" | "--")
}

/// The variable a `VariableAccess` or `FieldAccess` names, when it is declared in this file.
pub fn sym_of(ctx: &Ctx, access: u32) -> Option<Sym> {
    let variable = ctx.usages().declaration(access)?;
    let component = ctx.parent(variable).filter(|parent| ctx.is(*parent, "RecordComponent"));
    if let Some(component) = component.filter(|_| ctx.is(access, "VariableAccess")) {
        let record = ctx.enclosing(component, &["RecordDeclaration"]);
        let compact = ctx.ancestors(access).find(|at| ctx.is(*at, "CompactConstructorDeclaration"));
        if compact.is_some_and(|compact| ctx.enclosing(compact, &["RecordDeclaration"]) == record) {
            return Some(Sym(variable | FORMAL));
        }
    }
    Some(Sym(variable))
}

pub fn formal(variable: u32) -> Sym {
    Sym(variable | FORMAL)
}

pub fn plain(variable: u32) -> Sym {
    Sym(variable)
}

fn grandparent(ctx: &Ctx, id: u32, up: usize) -> Option<u32> {
    ctx.ancestors(id).nth(up)
}

pub fn is_field(ctx: &Ctx, sym: Sym) -> bool {
    let node = sym.node();
    !sym.formal()
        && (ctx.parent(node).is_some_and(|parent| matches!(ctx.name(parent), "EnumConstant" | "RecordComponent"))
            || grandparent(ctx, node, 1).is_some_and(|at| ctx.is(at, "FieldDeclaration")))
}

fn field_modifier(ctx: &Ctx, sym: Sym, modifier: &str) -> bool {
    let node = sym.node();
    match ctx.parent(node).map(|parent| ctx.name(parent)) {
        Some("EnumConstant") => true,
        Some("RecordComponent") => modifier == "final",
        _ => grandparent(ctx, node, 1).is_some_and(|field| ctx.has_modifier(field, modifier)),
    }
}

pub fn field_static(ctx: &Ctx, sym: Sym) -> bool {
    field_modifier(ctx, sym, "static")
}

pub fn field_final(ctx: &Ctx, sym: Sym) -> bool {
    field_modifier(ctx, sym, "final")
}

pub fn is_local_variable(ctx: &Ctx, variable: u32) -> bool {
    grandparent(ctx, variable, 1).is_some_and(|at| ctx.is(at, "LocalVariableDeclaration"))
        && !is_resource(ctx, variable)
        && !is_foreach_variable(ctx, variable)
}

pub fn is_resource(ctx: &Ctx, variable: u32) -> bool {
    grandparent(ctx, variable, 2).is_some_and(|at| ctx.is(at, "Resource"))
}

pub fn is_foreach_variable(ctx: &Ctx, variable: u32) -> bool {
    grandparent(ctx, variable, 2).is_some_and(|at| ctx.is(at, "ForeachStatement"))
}

pub fn initializer(ctx: &Ctx, variable: u32) -> Option<u32> {
    let declarator = ctx.parent(variable).filter(|parent| ctx.is(*parent, "VariableDeclarator"))?;
    ctx.kids(declarator).iter().copied().find(|kid| *kid != variable && ctx.is_expression(*kid))
}
