//! A finding's message as PMD writes it for a rule written in Java: `java.text.MessageFormat` with the arguments the
//! rule gives, then `${name}` replaced by the variable the finding is about or by a rule property.
use super::ctx::Ctx;
use crate::java::types::model::Type;

pub(super) const EXPRESSIONS: &[&str] = &[
    "AmbiguousName",
    "ArrayAccess",
    "ArrayAllocation",
    "ArrayInitializer",
    "AssignmentExpression",
    "BooleanLiteral",
    "CastExpression",
    "CharLiteral",
    "ClassLiteral",
    "ConditionalExpression",
    "ConstructorCall",
    "FieldAccess",
    "InfixExpression",
    "LambdaExpression",
    "MethodCall",
    "MethodReference",
    "NullLiteral",
    "NumericLiteral",
    "PatternExpression",
    "StringLiteral",
    "SuperExpression",
    "SwitchExpression",
    "ThisExpression",
    "TypeExpression",
    "UnaryExpression",
    "VariableAccess",
];

pub fn formatted(pattern: &str, args: &[String]) -> String {
    let mut out = String::with_capacity(pattern.len());
    let mut literal = false;
    let escaped = pattern.replace("${", "$'{'");
    let mut at = escaped.as_str();
    while let Some(next) = at.chars().next() {
        if let Some(after) = at.strip_prefix("''") {
            out.push('\'');
            at = after;
        } else if next == '\'' {
            literal = !literal;
            at = &at[1..];
        } else if next == '{' && !literal {
            let Some(end) = at.find('}') else { break };
            let index = at[1..end].trim();
            match index.parse::<usize>().ok().and_then(|index| args.get(index)) {
                Some(arg) => out.push_str(arg),
                None => out.push_str(&format!("{{{index}}}")),
            }
            at = &at[end + 1..];
        } else {
            out.push(next);
            at = &at[next.len_utf8()..];
        }
    }
    out
}

pub fn expanded(ctx: &Ctx, message: String, node: u32) -> String {
    if !message.contains("${") {
        return message;
    }
    let mut out = message;
    let mut from = 0;
    while let Some(start) = out[from..].find("${").map(|at| at + from) {
        let Some(end) = out[start..].find('}').map(|at| at + start) else {
            break;
        };
        let name = out[start + 2..end].to_string();
        let value = if name == "variableName" {
            variable_name(ctx, node)
        } else {
            ctx.property(&name).map(str::to_string)
        };
        match value {
            Some(value) => {
                out.replace_range(start..=end, &value);
                from = start + value.len();
            }
            None => from = start + 1,
        }
    }
    out
}

fn variable_name(ctx: &Ctx, node: u32) -> Option<String> {
    let names = |owner: u32| {
        let ids = ctx
            .kids_named(owner, "VariableDeclarator")
            .filter_map(|declarator| ctx.kid(declarator, "VariableId"));
        ids.map(|id| ctx.text(id, "Name")).collect::<Vec<_>>().join(", ")
    };
    match ctx.name(node) {
        "FieldDeclaration" | "LocalVariableDeclaration" => Some(names(node)),
        "VariableDeclarator" | "FormalParameter" => ctx.kid(node, "VariableId").map(|id| ctx.text(id, "Name")),
        "VariableId" => Some(ctx.text(node, "Name")),
        name if EXPRESSIONS.contains(&name) => variable_name(ctx, ctx.parent(node)?),
        _ => None,
    }
}

/// A receiver parameter (`Foo this`) that the grammar reads as a formal parameter.
pub fn receiver(ctx: &Ctx, formal: u32) -> bool {
    ctx.kid(formal, "VariableId").is_some_and(|id| ctx.text(id, "Name") == "this")
}

/// A method as PMD names it in messages: its name and the written types of its parameters.
pub fn signature(ctx: &Ctx, method: u32) -> String {
    let mut out = ctx.text(method, "Name");
    out.push('(');
    let parameters = ctx
        .kid(method, "FormalParameters")
        .map(|list| ctx.kids_named(list, "FormalParameter").filter(|formal| !receiver(ctx, *formal)).collect::<Vec<_>>());
    for (at, parameter) in parameters.unwrap_or_default().into_iter().enumerate() {
        if at > 0 {
            out.push_str(", ");
        }
        if let Some(kind) = ctx
            .kids(parameter)
            .iter()
            .copied()
            .find(|kid| !matches!(ctx.name(*kid), "ModifierList" | "VariableId"))
        {
            written_type(ctx, kind, &mut out);
        }
        let extra = ctx
            .kid(parameter, "VariableId")
            .and_then(|id| ctx.kid(id, "ArrayDimensions"));
        out.push_str(&"[]".repeat(extra.map(|dims| ctx.kids(dims).len()).unwrap_or(0)));
    }
    out.push(')');
    out
}

pub fn written_type(ctx: &Ctx, kind: u32, out: &mut String) {
    let join = |out: &mut String, items: Vec<u32>, between: &str| {
        for (at, item) in items.into_iter().enumerate() {
            if at > 0 {
                out.push_str(between);
            }
            written_type(ctx, item, out);
        }
    };
    match ctx.name(kind) {
        "PrimitiveType" => out.push_str(&ctx.text(kind, "Kind")),
        "ClassType" => {
            out.push_str(&ctx.text(kind, "SimpleName"));
            if let Some(arguments) = ctx.kid(kind, "TypeArguments") {
                out.push('<');
                join(out, ctx.kids(arguments).to_vec(), ", ");
                out.push('>');
            }
        }
        "ArrayType" => {
            if let Some(element) = ctx.nth(kind, 0) {
                written_type(ctx, element, out);
            }
            out.push_str(&"[]".repeat(ctx.whole(kind, "ArrayDepth").unwrap_or(0) as usize));
        }
        "VoidType" => out.push_str("void"),
        "WildcardType" => {
            out.push('?');
            if let Some(bound) = ctx.nth(kind, 0).filter(|bound| !ctx.is(*bound, "Annotation")) {
                out.push_str(if ctx.flag(kind, "LowerBound") {
                    " super "
                } else {
                    " extends "
                });
                written_type(ctx, bound, out);
            }
        }
        "UnionType" => join(out, ctx.kids(kind).to_vec(), " | "),
        "IntersectionType" => join(out, ctx.kids(kind).to_vec(), " & "),
        "AmbiguousName" => out.push_str(&ctx.text(kind, "Name")),
        _ => {}
    }
}

/// How PMD's `TypePrettyPrint` writes a type: simple or binary class names, `Outer#Inner` for inner classes, and the
/// bounds of type variables once a generic declaration was written.
pub struct TypePrinter<'i> {
    pub index: &'i crate::java::types::index::TypeIndex,
    pub qualify: bool,
    pub bounds: Option<bool>,
    /// Type variables in scope and their bound as PMD writes it; `None` for an `Object` bound.
    pub known: Vec<(String, Option<String>)>,
}

impl TypePrinter<'_> {
    fn outer(&self, name: &str) -> Option<String> {
        if let Some((outer, _)) = name.rsplit_once('$') {
            return Some(outer.to_string());
        }
        let (outer, _) = name.rsplit_once('.')?;
        self.index.get(outer).is_some().then(|| outer.to_string())
    }

    fn inner(&self, name: &str) -> Option<String> {
        use crate::java::types::model::flag;
        let outer = self.outer(name)?;
        let info = self.index.get(name)?;
        let in_interface = self.index.get(&outer).is_some_and(|outer| outer.is_interface);
        let implicit = in_interface || info.is_interface || info.flags & (flag::STATIC | flag::ENUM | flag::RECORD) != 0;
        (!implicit).then_some(outer)
    }

    fn simple(name: &str) -> &str {
        let tail = name.rsplit('.').next().unwrap_or(name);
        tail.rsplit('$').next().unwrap_or(tail)
    }

    pub fn class(&mut self, name: &str, arguments: &[Type], out: &mut String) {
        if let Some(outer) = self.inner(name) {
            self.class(&outer, &[], out);
            out.push('#');
            out.push_str(Self::simple(name));
        } else if self.qualify {
            match self.outer(name) {
                Some(outer) => {
                    self.class(&outer, &[], out);
                    out.push('$');
                    out.push_str(Self::simple(name));
                }
                None => out.push_str(name),
            }
        } else {
            out.push_str(Self::simple(name));
        }
        self.list(arguments, "<", ">", false, out);
    }

    pub fn list(&mut self, items: &[Type], open: &str, close: &str, varargs: bool, out: &mut String) {
        if items.is_empty() {
            return;
        }
        out.push_str(open);
        for (at, item) in items.iter().enumerate() {
            if at > 0 {
                out.push_str(", ");
            }
            self.kind(item, varargs && at + 1 == items.len(), out);
        }
        out.push_str(close);
    }

    pub fn variable(&mut self, name: &str, out: &mut String) {
        out.push_str(name);
        let bound = self.known.iter().rev().find(|(known, _)| known == name).and_then(|(_, bound)| bound.clone());
        if self.bounds == Some(true)
            && let Some(bound) = bound
        {
            out.push_str(" extends ");
            out.push_str(&bound);
        }
    }

    /// A bound as PMD writes it: type variables inside it without their own bounds.
    pub fn bound(&mut self, bound: &Type) -> Option<String> {
        if bound.name() == crate::java::types::model::OBJECT {
            return None;
        }
        let saved = self.bounds.replace(false);
        let mut out = String::new();
        self.kind(bound, false, &mut out);
        self.bounds = saved;
        Some(out)
    }

    pub fn kind(&mut self, kind: &Type, varargs: bool, out: &mut String) {
        match kind {
            Type::Class(name, arguments) => self.class(name, arguments, out),
            Type::Array(element) => {
                self.kind(element, false, out);
                out.push_str(if varargs { "..." } else { "[]" });
            }
            Type::Wildcard => out.push('?'),
            Type::Bounded(lower, bound) => {
                out.push_str(if *lower { "? super " } else { "? extends " });
                self.kind(bound, false, out);
            }
            Type::Variable(name) => self.variable(name, out),
            other => out.push_str(&other.name()),
        }
    }
}
