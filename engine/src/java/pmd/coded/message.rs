//! A finding's message as PMD writes it for a rule written in Java: `java.text.MessageFormat` with the arguments the
//! rule gives, then `${name}` replaced by the variable the finding is about or by a rule property.
use super::ctx::Ctx;

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

/// A method as PMD names it in messages: its name and the written types of its parameters.
pub fn signature(ctx: &Ctx, method: u32) -> String {
    let mut out = ctx.text(method, "Name");
    out.push('(');
    let parameters = ctx
        .kid(method, "FormalParameters")
        .map(|list| ctx.kids_named(list, "FormalParameter").collect::<Vec<_>>());
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
