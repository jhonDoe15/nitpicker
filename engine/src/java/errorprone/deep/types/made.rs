//! The types javac makes up for `var`, lambda parameters and an anonymous class's constructor, whose depth the
//! engine takes from the types it works out, within a span.
use super::super::tree::{Build, Typed, parts};
use crate::java::types::expr::Binding;
use crate::java::types::model::Type;
use tree_sitter::Node;

/// The depth spans of a made-up constructor's parameter types and of its thrown types.
pub type Spans = (Vec<(usize, usize)>, Vec<(usize, usize)>);

/// The depth of a made-up type the engine cannot work out: taken to be at most this deep.
pub const UNKNOWN: (usize, usize) = (1, 64);

/// The depth of javac's tree for a type: a qualified name is a member select per dot, type arguments sit beside the
/// name under a parameterized type, and a type argument may be a wildcard the engine's type leaves out.
pub fn span_of(kind: &Type) -> (usize, usize) {
    span(kind).unwrap_or(UNKNOWN)
}

fn span(kind: &Type) -> Option<(usize, usize)> {
    match kind {
        Type::Primitive(_) | Type::Variable(_) => Some((1, 1)),
        Type::Array(element) => span(element).map(|(low, high)| (low + 1, high + 1)),
        Type::Class(name, arguments) if !name.contains('&') && !name.is_empty() => {
            let segments = name.split(['.', '$']).count();
            let (mut low, mut high) = (segments, segments);
            for argument in arguments {
                let (one, other) = match argument {
                    Type::Wildcard => (2, 2),
                    Type::Bounded(_, bound) => span(bound).map(|(one, other)| (one + 1, other + 1))?,
                    _ => span(argument).map(|(one, other)| (one, other + 1))?,
                };
                low = low.max(one);
                high = high.max(other);
            }
            let parameterized = usize::from(!arguments.is_empty());
            Some((low + parameterized, high + parameterized))
        }
        _ => None,
    }
}

/// javac writes a type variable, a captured type or an anonymous class as a bare name, where the engine's type may
/// stand for its bound: a made-up type is from one level deep.
pub fn spanned(kind: Option<&Type>) -> (usize, usize) {
    kind.map_or(UNKNOWN, |kind| (1, span_of(kind).1))
}

impl<'c, 't> Build<'c, 't> {
    pub fn local_type(&self, declarator: Node<'t>) -> Typed<'t> {
        let value = declarator.child_by_field_name("value");
        if value.is_some_and(|value| value.kind() == "object_creation_expression" && parts(value).iter().any(|part| part.kind() == "class_body")) {
            return Typed::Made(None, (1, 1));
        }
        let kind = value.and_then(|value| self.context.resolver.type_of(value));
        Typed::Made(None, spanned(kind.as_ref()))
    }

    pub fn bound_after(&self, holder: Node<'t>, usage: Option<Node<'t>>) -> Typed<'t> {
        let name = holder.child_by_field_name("name").map_or("", |name| self.text(name));
        let kind = usage.and_then(|usage| self.context.resolver.binding(usage, name)).and_then(|found| match found {
            Binding::Local(kind) => kind,
            Binding::Field(..) => None,
        });
        Typed::Made(None, spanned(kind.as_ref()))
    }

    pub fn loop_type(&self, loop_statement: Node<'t>) -> Typed<'t> {
        self.bound_after(loop_statement, loop_statement.child_by_field_name("body"))
    }

    pub fn resource_type(&self, resource: Node<'t>) -> Typed<'t> {
        let statement = crate::engine::source::parent(resource).and_then(crate::engine::source::parent);
        self.bound_after(resource, statement.and_then(|found| found.child_by_field_name("body")))
    }

    /// A lambda parameter declared `var`, or written without a type.
    pub fn lambda_type(&self, parameter: Node<'t>) -> Typed<'t> {
        let list = crate::engine::source::parent(parameter);
        let lambda = list.and_then(crate::engine::source::parent).filter(|found| found.kind() == "lambda_expression");
        let position = list.map(parts).unwrap_or_default().iter().position(|part| *part == parameter);
        match (lambda, position) {
            (Some(lambda), Some(position)) => self.implicit_type(lambda, position),
            _ => Typed::Made(None, UNKNOWN),
        }
    }

    pub fn implicit_type(&self, lambda: Node<'t>, position: usize) -> Typed<'t> {
        Typed::Made(None, spanned(self.context.resolver.inferred_parameter(lambda, position).as_ref()))
    }

    /// The parameter and thrown types of the constructor javac writes for an anonymous class: those of the
    /// constructor it calls. javac writes a thrown type as a simple or a qualified name, at the start of the file.
    pub fn anonymous_parameters(&self, creation: Node<'t>) -> Option<Spans> {
        let resolver = self.context.resolver;
        let arguments = creation.child_by_field_name("arguments").map(parts).unwrap_or_default();
        let found = match creation.kind() {
            "enum_constant" => resolver.call_formals(creation).map(|(call, _)| call),
            _ => resolver.resolve_constructor(creation),
        };
        let Some(call) = found else { return arguments.is_empty().then(|| (Vec::new(), Vec::new())) };
        let index = &resolver.index;
        let throws = &call.method.throws;
        let kept = throws.iter().enumerate().filter(|(at, kind)| {
            !throws.iter().enumerate().any(|(other, wider)| other != *at && index.is_subtype(&kind.name(), &wider.name()) && (kind.name() != wider.name() || other < *at))
        });
        let thrown = kept.map(|(_, kind)| spanned(Some(kind))).collect();
        if call.raw {
            return Some((call.method.parameters.iter().map(|kind| spanned(Some(kind))).collect(), thrown));
        }
        let map = resolver.call_map(&call, creation, true);
        Some((call.method.generic_parameters.iter().map(|generic| spanned(Some(&generic.substitute(&map)))).collect(), thrown))
    }
}
