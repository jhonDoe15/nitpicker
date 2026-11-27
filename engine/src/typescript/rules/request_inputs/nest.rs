//! `nest-handlers.mts`: NestJS handler parameters bound to the query string, path, headers or a multipart form.
use super::bindings::{decorator_call, decorators_of, import_of, is_from_package, parameters};
use super::fields::dto::class_problems;
use super::fields::{leaf_problem, schema_problems, Finding, Kind, Problem};
use super::tree::{is_boolean, is_number, key_name, lookup, name_of, string_like, Tree, T};
use super::Located;
use crate::typescript::rules::support::view::Node;

const NEST: [&str; 1] = ["@nestjs/common"];
const SOURCES: [(&str, &str); 3] = [("Query", "query string"), ("Param", "path"), ("Headers", "headers")];
const MULTIPART: &str = "multipart form";
const FILE_INTERCEPTORS: [&str; 4] = ["FileInterceptor", "FilesInterceptor", "AnyFilesInterceptor", "FileFieldsInterceptor"];
const FILE_PARAMETERS: [&str; 2] = ["UploadedFile", "UploadedFiles"];
const PASSIVE_PIPES: [&str; 2] = ["DefaultValuePipe", "ParseUUIDPipe"];

pub struct Transport<'v> {
    pub source: String,
    pub arguments: Vec<T<'v>>,
}

fn array_pipe(kind: &Kind) -> Option<&'static str> {
    match kind {
        Kind::Number => Some("new ParseArrayPipe({ items: Number })"),
        Kind::Bigint => Some("a pipe that splits the text and calls BigInt on each item"),
        Kind::Date => Some("a pipe that splits the text and builds a Date from each item"),
        Kind::Boolean => Some("a pipe that splits the text and compares each item with 'true'"),
        _ => None,
    }
}

fn optional_pipe(kind: &Kind) -> Option<&'static str> {
    match kind {
        Kind::Number => Some("new ParseIntPipe({ optional: true }) or new ParseFloatPipe({ optional: true })"),
        Kind::Bigint => Some("a pipe that calls BigInt when the value is present"),
        Kind::Date => Some("new ParseDatePipe({ optional: true })"),
        Kind::Boolean => Some("new ParseBoolPipe({ optional: true })"),
        _ => None,
    }
}

fn called_name(tree: &Tree, node: T) -> Option<String> {
    let callee = match node.bare() {
        Some(call) if call.is("CallExpression") || call.is("NewExpression") => tree.field(call, "callee")?,
        _ => node,
    };
    let identifier = callee.bare().filter(|callee| callee.is("Identifier"))?;
    import_of(tree, identifier).and_then(|binding| binding.imported).or_else(|| identifier.name().map(|name| name.into_owned()))
}

fn is_file_interceptor(tree: &Tree, argument: T) -> bool {
    argument.is("CallExpression") && called_name(tree, argument).is_some_and(|name| FILE_INTERCEPTORS.contains(&name.as_str()))
}

fn is_multipart(tree: &Tree, method: Node) -> bool {
    let intercepted = decorators_of(method).into_iter().any(|decorator| {
        let call = decorator_call(tree, decorator);
        call.name.as_deref() == Some("UseInterceptors") && call.arguments.iter().any(|argument| is_file_interceptor(tree, *argument))
    });
    intercepted || parameters(method).into_iter().any(|parameter| decorators_of(parameter).into_iter().any(|decorator| decorator_call(tree, decorator).name.is_some_and(|name| FILE_PARAMETERS.contains(&name.as_str()))))
}

pub fn transport_of<'v>(tree: &Tree<'v>, parameter: Node<'v>, multipart: bool) -> Option<Transport<'v>> {
    for decorator in decorators_of(parameter) {
        let call = decorator_call(tree, decorator);
        let from_nest = call.base.is_some() && is_from_package(tree, call.base, &NEST);
        let source = call.name.as_deref().and_then(|name| lookup(&SOURCES, name)).or_else(|| (call.name.as_deref() == Some("Body") && multipart).then(|| MULTIPART.to_string()));
        if let Some(source) = source.filter(|_| from_nest) {
            return Some(Transport { source, arguments: call.arguments });
        }
    }
    None
}

/// The type a parameter declares, as the compiler holds it.
pub fn parameter_type<'v>(tree: &Tree<'v>, parameter: Node<'v>) -> Option<T<'v>> {
    let annotated = match parameter.kind() {
        "TSParameterProperty" => return parameter.node("parameter").and_then(|inner| parameter_type(tree, inner)),
        "AssignmentPattern" => parameter.node("left")?,
        _ => parameter,
    };
    tree.slot(annotated.node("typeAnnotation")?.node("typeAnnotation"))
}

fn is_optional(parameter: Node) -> bool {
    match parameter.kind() {
        "TSParameterProperty" => parameter.node("parameter").is_some_and(is_optional),
        "AssignmentPattern" => parameter.node("left").is_some_and(is_optional),
        _ => parameter.flag("optional"),
    }
}

fn is_nullish(tree: &Tree, part: T) -> bool {
    match part.bare().map(|node| node.kind()) {
        Some("TSUndefinedKeyword" | "TSNullKeyword") => true,
        Some("TSLiteralType") => tree.field(part.node, "literal").and_then(T::bare).is_some_and(|literal| literal.is("Literal") && literal.text("raw").as_deref() == Some("null")),
        _ => false,
    }
}

fn literal_kind(tree: &Tree, part: Node) -> Option<Kind> {
    let literal = tree.field(part, "literal")?.bare()?;
    if (is_number(literal) && !literal.has("regex")) || literal.is("UnaryExpression") {
        return Some(Kind::Number);
    }
    is_boolean(literal).then_some(Kind::Boolean)
}

enum Part<'v> {
    Kind(Option<Kind>),
    Inner(Vec<T<'v>>),
}

fn part_kind<'v>(tree: &Tree<'v>, part: T<'v>) -> Part<'v> {
    let node = part.node;
    match node.kind() {
        "TSNumberKeyword" => Part::Kind(Some(Kind::Number)),
        "TSBigIntKeyword" => Part::Kind(Some(Kind::Bigint)),
        "TSBooleanKeyword" => Part::Kind(Some(Kind::Boolean)),
        "TSArrayType" => Part::Inner(tree.field(node, "elementType").into_iter().collect()),
        "TSParenthesizedType" => Part::Inner(tree.field(node, "typeAnnotation").into_iter().collect()),
        "TSUnionType" => Part::Inner(tree.fields(node, "types").into_iter().flatten().filter(|part| !is_nullish(tree, *part)).collect()),
        "TSLiteralType" => Part::Kind(literal_kind(tree, node)),
        "TSTypeReference" => Part::Kind((name_of(tree.field(node, "typeName")).as_deref() == Some("Date")).then_some(Kind::Date)),
        _ => Part::Kind(None),
    }
}

fn type_kind<'v>(tree: &Tree<'v>, start: Option<T<'v>>) -> Option<Kind> {
    let mut pending: Vec<T> = start.into_iter().collect();
    let mut kinds: Vec<Option<Kind>> = Vec::new();
    let mut index = 0;
    while index < pending.len() {
        match part_kind(tree, pending[index]) {
            Part::Kind(kind) => {
                if !kinds.contains(&kind) {
                    kinds.push(kind);
                }
            }
            Part::Inner(inner) => pending.extend(inner),
        }
        index += 1;
    }
    if kinds.len() == 1 { kinds.pop().flatten() } else { None }
}

fn type_problem(tree: &Tree, start: Option<T>) -> Option<Problem> {
    let kind = type_kind(tree, start)?;
    Some(Problem { kind, cast: false, form: format!("the type {}", tree.text(start?)), library: "type", fix: None })
}

fn literal_members<'v>(tree: &Tree<'v>, literal: Node<'v>) -> Vec<Finding<'v>> {
    literal.nodes("members").into_iter().filter(|member| member.is("TSPropertySignature")).filter_map(|member| {
        let field = key_name(tree, member)?;
        let problem = type_problem(tree, tree.slot(member.node("typeAnnotation").and_then(|annotation| annotation.node("typeAnnotation"))))?;
        Some(Finding { field, node: T { node: member, level: 0 }, problem })
    }).collect()
}

fn type_parts<'v>(tree: &Tree<'v>, start: Option<T<'v>>) -> Vec<T<'v>> {
    let mut pending: Vec<T> = start.into_iter().collect();
    let mut index = 0;
    while index < pending.len() {
        let current = pending[index];
        if current.is("TSUnionType") {
            pending.extend(tree.fields(current.node, "types").into_iter().flatten());
        }
        if current.is("TSParenthesizedType") {
            pending.extend(tree.field(current.node, "typeAnnotation"));
        }
        index += 1;
    }
    pending
}

fn pipe_fix(tree: &Tree, kind: &Kind, parameter: Node) -> Option<String> {
    let parts = type_parts(tree, parameter_type(tree, parameter));
    if parts.iter().any(|part| part.is("TSArrayType")) {
        return array_pipe(kind).map(str::to_string);
    }
    let optional = is_optional(parameter) || parts.iter().any(|part| part.is("TSUndefinedKeyword"));
    if optional { optional_pipe(kind).map(str::to_string) } else { None }
}

fn first_argument<'v>(tree: &Tree<'v>, pipe: T<'v>) -> Option<T<'v>> {
    let call = pipe.bare().filter(|call| call.is("CallExpression") || call.is("NewExpression"))?;
    tree.fields(call, "arguments").first().copied().flatten()
}

fn is_zod_pipe(tree: &Tree, pipe: T) -> bool {
    called_name(tree, pipe).as_deref() == Some("ZodValidationPipe")
}

fn single_problems<'v>(tree: &Tree<'v>, name: String, pipes: &[T<'v>], parameter: Node<'v>) -> Vec<Finding<'v>> {
    if let Some(zod_pipe) = pipes.iter().find(|pipe| is_zod_pipe(tree, **pipe)) {
        return leaf_problem(tree, first_argument(tree, *zod_pipe)).map(|problem| Finding { field: name, node: *zod_pipe, problem }).into_iter().collect();
    }
    if pipes.iter().any(|pipe| !called_name(tree, *pipe).is_some_and(|name| PASSIVE_PIPES.contains(&name.as_str()))) {
        return Vec::new();
    }
    let Some(problem) = type_problem(tree, parameter_type(tree, parameter)) else { return Vec::new() };
    let fix = pipe_fix(tree, &problem.kind, parameter);
    vec![Finding { field: name, node: T { node: parameter, level: 0 }, problem: Problem { library: "param", fix, ..problem } }]
}

fn object_problems<'v>(tree: &Tree<'v>, pipes: &[T<'v>], parameter: Node<'v>) -> Vec<Finding<'v>> {
    if let Some(zod_pipe) = pipes.iter().find(|pipe| is_zod_pipe(tree, **pipe)) {
        return schema_problems(tree, first_argument(tree, *zod_pipe)).unwrap_or_default();
    }
    let Some(declared) = parameter_type(tree, parameter).and_then(T::bare) else { return Vec::new() };
    if declared.is("TSTypeLiteral") {
        return literal_members(tree, declared);
    }
    if !declared.is("TSTypeReference") {
        return Vec::new();
    }
    declared.node("typeName").and_then(|name| class_problems(tree, name)).unwrap_or_default()
}

fn parameter_problems<'v>(tree: &Tree<'v>, parameter: Node<'v>, multipart: bool) -> Vec<Located<'v>> {
    let Some(transport) = transport_of(tree, parameter, multipart) else { return Vec::new() };
    let first = transport.arguments.first().copied();
    let found = match string_like(first) {
        Some(name) => single_problems(tree, name, &transport.arguments[1..], parameter),
        None => object_problems(tree, &transport.arguments, parameter),
    };
    found.into_iter().map(|finding| Located { finding, source: transport.source.clone() }).collect()
}

pub fn handler_problems<'v>(tree: &Tree<'v>, method: Node<'v>) -> Vec<Located<'v>> {
    let multipart = is_multipart(tree, method);
    parameters(method).into_iter().flat_map(|parameter| parameter_problems(tree, parameter, multipart)).collect()
}

/// Whether a view node is a parameter: the compiler's `ParameterDeclaration`.
pub fn is_parameter(node: Node) -> bool {
    let Some(parent) = node.parent() else { return false };
    let holds = |key: &str| parent.nodes(key).contains(&node);
    let function = matches!(
        parent.kind(),
        "FunctionDeclaration" | "FunctionExpression" | "ArrowFunctionExpression" | "TSDeclareFunction" | "TSEmptyBodyFunctionExpression" | "TSMethodSignature" | "TSCallSignatureDeclaration" | "TSConstructSignatureDeclaration" | "TSFunctionType" | "TSConstructorType"
    );
    (function && holds("params")) || (parent.is("TSIndexSignature") && holds("parameters"))
}
