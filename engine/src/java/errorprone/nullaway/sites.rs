//! The places NullAway reports besides a dereference: an argument, a returned value, a value stored in a field.
use super::*;

/// Where javac puts a diagnostic for an expression: the operator of a binary expression or an assignment, the
/// parenthesis of a call, the dot of a field access, else the first token.
pub(super) fn position(node: Node) -> usize {
    let sign = |kind: &str| children(node).into_iter().rev().find(|part| part.kind() == kind).map(|part| part.start_byte());
    let found = match node.kind() {
        "binary_expression" | "assignment_expression" => node.child_by_field_name("operator").map(|operator| operator.start_byte()),
        "method_invocation" => node.child_by_field_name("arguments").map(|list| list.start_byte()),
        "field_access" | "class_literal" => sign("."),
        "ternary_expression" => sign("?"),
        "array_access" => sign("["),
        "instanceof_expression" => sign("instanceof"),
        "method_reference" => sign("::"),
        "object_creation_expression" | "array_creation_expression" => sign("new"),
        "update_expression" => children(node).into_iter().find(|part| matches!(part.kind(), "++" | "--")).map(|part| part.start_byte()),
        _ => None,
    };
    found.unwrap_or(node.start_byte())
}

impl<'t> Flow<'_, 't> {
    /// Which parameter positions of the called method must not be given null.
    fn required(&self, call: &Call) -> Vec<bool> {
        let resolver = self.context.resolver;
        let checked = annotated(&call.declaring);
        let mut required: Vec<bool> = (0..call.method.parameters.len())
            .map(|position| {
                let plain = call.method.parameters[position].name() != "java.lang.Void";
                checked && plain && (position >= 64 || call.method.nullable_parameters & (1 << position) == 0)
            })
            .collect();
        let exact = |table: &[models::Model]| -> Vec<usize> { table.iter().filter(|row| fits(resolver, row, call, false)).map(|row| row.3).collect() };
        for position in exact(models::NON_NULL_PARAMETERS) {
            if let Some(slot) = required.get_mut(position) {
                *slot = true;
            }
        }
        for position in exact(models::EXPLICITLY_NULLABLE_PARAMETERS) {
            if let Some(slot) = required.get_mut(position) {
                *slot = false;
            }
        }
        required
    }

    fn arguments_passed(&mut self, node: Node<'t>, reported: &mut std::collections::HashSet<usize>) {
        let resolver = self.context.resolver;
        let resolved = resolver.call_formals(node);
        if let Ok(wanted) = std::env::var("NP_DBG") {
            let line = self.context.file.text[..node.start_byte()].matches('\n').count() + 1;
            if wanted.split(',').any(|one| format!("{}:{line}", self.context.file.path).ends_with(one)) {
                eprintln!("DBG {line} {} -> {:?}", self.context.text(node).lines().next().unwrap_or(""), resolved.as_ref().map(|(call, _)| (&call.declaring, &call.method.name, &call.method.parameters, call.method.nullable_parameters, call.method.varargs)));
                for actual in Self::arguments(node) {
                    eprintln!("   arg {} may {} known {:?}", self.context.text(actual).lines().next().unwrap_or(""), self.may_be_null(actual), self.known(strip(actual)));
                }
            }
        }
        let Some((call, _)) = resolved else { return };
        let formals = call.method.parameters.len();
        if formals == 0 {
            return;
        }
        let required = self.required(&call);
        let actuals = Self::arguments(node);
        for (at, actual) in actuals.iter().enumerate() {
            let slot = at.min(formals - 1);
            let spread = call.method.varargs && at >= formals - 1;
            let whole = spread && actuals.len() == formals && {
                let kind = resolver.type_of(*actual);
                strip(*actual).kind() == "null_literal" || matches!(kind, Some(Type::Array(_)))
            };
            let needed = if whole { annotated(&call.declaring) } else { required[slot] };
            if !needed || !self.may_be_null(*actual) || !reported.insert(actual.id()) {
                continue;
            }
            let message = format!("passing @Nullable parameter '{}' where @NonNull is required", self.context.text(*actual));
            self.context.report("NullAway", *actual, position(*actual), &message);
        }
    }

    /// Whether a value returned from this method or lambda must not be null.
    fn returns_required(&self, unit: Node) -> bool {
        match unit.kind() {
            "method_declaration" => {
                let Some(kind) = unit.child_by_field_name("type") else { return false };
                let primitive = matches!(kind.kind(), "integral_type" | "floating_point_type" | "boolean_type" | "void_type");
                !primitive && self.context.text(kind) != "Void" && !crate::java::helpers::marked_nullable(self.context.file, unit)
            }
            "lambda_expression" => {
                let resolver = self.context.resolver;
                let Some(target) = resolver.lambda_target(unit) else { return false };
                let Some((declaring, method)) = resolver.index.functional_method(&target.name()) else { return false };
                let plain = !matches!(method.returns, Type::Primitive(_)) && method.returns.name() != "java.lang.Void";
                plain && annotated(&declaring.name) && method.flags & flag::NULLABLE == 0
            }
            _ => false,
        }
    }

    fn returned(&mut self, node: Node<'t>, unit: Node<'t>, reported: &mut std::collections::HashSet<usize>) {
        let value = named_children(node).into_iter().find(|part| !part.kind().ends_with("comment"));
        let Some(value) = value else { return };
        if self.returns_required(unit) && self.may_be_null(value) && reported.insert(node.id()) {
            self.context.report("NullAway", node, node.start_byte(), "returning @Nullable expression from method with @NonNull return type");
        }
    }

    /// The value of a lambda whose body is an expression.
    pub(super) fn lambda_value(&mut self, lambda: Node<'t>) {
        let Some(body) = lambda.child_by_field_name("body").filter(|body| body.kind() != "block") else { return };
        if self.returns_required(lambda) && self.may_be_null(body) {
            self.context.report("NullAway", lambda, lambda.start_byte(), "returning @Nullable expression from method with @NonNull return type");
        }
    }

    fn stored(&mut self, node: Node<'t>, reported: &mut std::collections::HashSet<usize>) {
        let resolver = self.context.resolver;
        if node.child_by_field_name("operator").is_none_or(|operator| operator.kind() != "=") {
            return;
        }
        let (Some(left), Some(right)) = (node.child_by_field_name("left"), node.child_by_field_name("right")) else { return };
        let target = match left.kind() {
            "identifier" => match resolver.binding(left, self.text(left)) {
                Some(Binding::Field(_, class, field)) => Some((class, field)),
                _ => None,
            },
            "field_access" => self.field(left).map(|(class, field, _)| (class, field)),
            _ => None,
        };
        let Some((class, field)) = target else { return };
        if !annotated(&class.name) || field.flags & flag::NULLABLE != 0 {
            return;
        }
        if self.may_be_null(right) && reported.insert(node.id()) {
            self.context.report("NullAway", node, position(node), "assigning @Nullable expression to @NonNull field");
        }
    }

    pub(super) fn sites(&mut self, node: Node<'t>, unit: Node<'t>, reported: &mut std::collections::HashSet<usize>) {
        match node.kind() {
            "method_invocation" | "object_creation_expression" | "explicit_constructor_invocation" | "enum_constant" => self.arguments_passed(node, reported),
            "return_statement" => self.returned(node, unit, reported),
            "assignment_expression" => self.stored(node, reported),
            _ => {}
        }
    }

    /// A field's own initializer.
    pub(super) fn initialized(&mut self, declarator: Node<'t>) {
        let (Some(name), Some(value), Some(declaration)) = (declarator.child_by_field_name("name"), declarator.child_by_field_name("value"), parent(declarator)) else { return };
        if crate::java::helpers::marked_nullable(self.context.file, declaration) {
            return;
        }
        if self.may_be_null(value) {
            self.context.report("NullAway", declarator, name.start_byte(), "assigning @Nullable expression to @NonNull field");
        }
    }
}
