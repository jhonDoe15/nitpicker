//! Two of NullAway's finer points about lambdas. Its stream handler: what a `filter` lambda proves about its
//! parameter also holds for the parameter of the lambda that takes the stream's elements next. And a lambda
//! parameter whose type is an anonymous class given in the same call: the methods that class declares decide.
use super::*;

const STREAM: &str = "java.util.stream.Stream";
const FILTERS: &[&str] = &["filter", "takeWhile"];
const TAKERS: &[&str] = &["map", "mapToInt", "mapToLong", "mapToDouble", "forEach", "forEachOrdered", "flatMap"];
const PASSES: &[&str] = &["distinct", "sorted"];

fn on_stream(context: &Context, call: Node, names: &[&str]) -> bool {
    let named = call.child_by_field_name("name").is_some_and(|name| names.contains(&context.text(name)));
    named && context.resolver.resolve_call(call).is_some_and(|found| found.declaring == STREAM || context.resolver.index.is_subtype(&found.declaring, STREAM))
}

fn only_argument(call: Node) -> Option<Node> {
    let list: Vec<Node> = call.child_by_field_name("arguments").map(named_children).unwrap_or_default();
    let mut given = list.into_iter().filter(|argument| !argument.kind().ends_with("comment"));
    given.next().filter(|_| given.next().is_none())
}

/// The names of a lambda's parameters, in order.
pub(super) fn parameter_names<'c>(context: &'c Context, lambda: Node) -> Vec<&'c str> {
    let Some(list) = lambda.child_by_field_name("parameters") else { return Vec::new() };
    if list.kind() == "identifier" {
        return vec![context.text(list)];
    }
    let name = |part: Node| match part.kind() {
        "identifier" => Some(context.text(part)),
        "formal_parameter" => part.child_by_field_name("name").map(|name| context.text(name)),
        _ => None,
    };
    named_children(list).into_iter().filter_map(name).collect()
}

/// For the lambda given to a stream's `filter`: the lambda later in the same chain that takes what passes.
pub(super) fn taker<'t>(context: &Context, lambda: Node<'t>) -> Option<Node<'t>> {
    let mut call = parent(lambda).filter(|list| list.kind() == "argument_list").and_then(parent)?;
    if call.kind() != "method_invocation" || only_argument(call) != Some(lambda) || !on_stream(context, call, FILTERS) {
        return None;
    }
    loop {
        let outer = parent(call).filter(|outer| outer.kind() == "method_invocation" && outer.child_by_field_name("object") == Some(call))?;
        if on_stream(context, outer, TAKERS) {
            return only_argument(outer).filter(|argument| argument.kind() == "lambda_expression");
        }
        if !on_stream(context, outer, PASSES) {
            return None;
        }
        call = outer;
    }
}

impl<'t> Flow<'_, 't> {
    /// The stores after a condition: when it holds and when it does not.
    fn outcomes(&mut self, test: Node<'t>, store: &Store) -> (Store, Store) {
        let test = unwrap(test);
        let operator = test.child_by_field_name("operator").map(|operator| operator.kind());
        let both = |flow: &mut Self, first: &str, second: &str| -> Option<((Store, Store), Node<'t>)> {
            let (left, right) = (test.child_by_field_name(first)?, test.child_by_field_name(second)?);
            Some((flow.outcomes(left, store), right))
        };
        let meet = |a: Store, b: &Store| {
            let mut joined = Some(a);
            join(&mut joined, b);
            joined.unwrap_or_default()
        };
        match (test.kind(), operator) {
            ("binary_expression", Some("&&")) => match both(self, "left", "right") {
                Some(((holds, fails), right)) => {
                    let (then, otherwise) = self.outcomes(right, &holds);
                    (then, meet(fails, &otherwise))
                }
                None => (store.clone(), store.clone()),
            },
            ("binary_expression", Some("||")) => match both(self, "left", "right") {
                Some(((holds, fails), right)) => {
                    let (then, otherwise) = self.outcomes(right, &fails);
                    (meet(holds, &then), otherwise)
                }
                None => (store.clone(), store.clone()),
            },
            ("unary_expression", Some("!")) => match test.child_by_field_name("operand") {
                Some(operand) => {
                    let (holds, fails) = self.outcomes(operand, store);
                    (fails, holds)
                }
                None => (store.clone(), store.clone()),
            },
            _ => self.sides(test, store),
        }
    }

    /// What a `filter` lambda knows about its parameter whenever it answers true, said about `to` instead.
    pub(super) fn passed(&mut self, inputs: &[Option<Store>], lambda: Node<'t>, to: &str) -> Vec<String> {
        let context = self.context;
        let Some(from) = parameter_names(context, lambda).into_iter().next() else { return Vec::new() };
        let Some(body) = lambda.child_by_field_name("body") else { return Vec::new() };
        let mut held: Option<Store> = None;
        for block in 0..self.cfg.blocks.len() {
            let Some(mut store) = inputs[block].clone() else { continue };
            self.copy = self.cfg.blocks[block].copy;
            for position in 0..self.cfg.blocks[block].steps.len() {
                let node = self.cfg.blocks[block].steps[position];
                self.advance(node, &mut store);
                let answer = match node.kind() {
                    "return_statement" => named_children(node).into_iter().find(|part| !part.kind().ends_with("comment")),
                    _ => None,
                };
                if let Some(answer) = answer.filter(|answer| unwrap(*answer).kind() != "false") {
                    let (holds, _) = self.outcomes(answer, &store);
                    join(&mut held, &holds);
                }
            }
            if body.kind() != "block" && block == self.cfg.end && unwrap(body).kind() != "false" {
                let (holds, _) = self.outcomes(body, &store);
                join(&mut held, &holds);
            }
        }
        self.copy = 0;
        let Some(held) = held else { return Vec::new() };
        let rooted = |name: &str| name.strip_prefix(from).filter(|rest| rest.is_empty() || rest.starts_with(['.', '['])).map(|rest| format!("{to}{rest}"));
        self.paths.iter().filter(|(_, path)| read(&held, **path) == NONNULL).filter_map(|(name, _)| rooted(name)).collect()
    }

    /// For a call on an implicitly typed lambda parameter whose type is the anonymous class given to the same
    /// outer call: which parameters of the method that class declares accept null.
    pub(super) fn declared_open(&self, call: Node<'t>) -> Option<Vec<bool>> {
        let context = self.context;
        let resolver = context.resolver;
        let object = unwrap(call.child_by_field_name("object")?);
        if object.kind() != "identifier" {
            return None;
        }
        let mut at = parent(object);
        let (lambda, position) = loop {
            let node = at?;
            if node.kind() == "lambda_expression" {
                if let Some(position) = parameter_names(context, node).iter().position(|name| *name == context.text(object)) {
                    break (node, position);
                }
            }
            at = parent(node);
        };
        let outer = parent(lambda).filter(|list| list.kind() == "argument_list").and_then(parent)?;
        let given = Self::arguments(outer);
        let place = given.iter().position(|argument| *argument == lambda)?;
        let (resolved, _) = resolver.call_formals(outer)?;
        let method = &resolved.method;
        let Type::Class(interface, parts) = method.generic_parameters.get(place)? else { return None };
        let (declaring, function) = resolver.index.functional_method(interface)?;
        let Type::Variable(own) = function.generic_parameters.get(position)? else { return None };
        let slot = declaring.type_parameters.iter().position(|(name, _)| name == own).filter(|_| declaring.name == *interface)?;
        let Type::Variable(variable) = parts.get(slot)? else { return None };
        if !method.type_parameters.contains(variable) {
            return None;
        }
        let decides = |at: usize| matches!(method.generic_parameters.get(at), Some(Type::Variable(name)) if name == variable);
        let body = given.iter().enumerate().filter(|(at, _)| decides(*at)).find_map(|(_, argument)| {
            let argument = unwrap(*argument);
            children(argument).into_iter().find(|part| part.kind() == "class_body").filter(|_| argument.kind() == "object_creation_expression")
        })?;
        let name = context.text(call.child_by_field_name("name")?);
        let count = Self::arguments(call).len();
        let formals = children(body).into_iter().filter(|member| member.kind() == "method_declaration").find_map(|member| {
            let formals = crate::java::errorprone::hierarchy::formals(member);
            let fits = member.child_by_field_name("name").is_some_and(|written| context.text(written) == name) && formals.len() == count;
            fits.then_some(formals)
        })?;
        let open = |formal: &Node| {
            let void = formal.child_by_field_name("type").is_some_and(|kind| matches!(context.text(kind), "Void" | "java.lang.Void"));
            void || crate::java::helpers::marked_nullable(context.file, *formal)
        };
        Some(formals.iter().map(open).collect())
    }
}
