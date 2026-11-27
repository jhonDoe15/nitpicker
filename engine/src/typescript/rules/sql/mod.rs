//! `no-sql-string-building`: SQL text built by a template, concatenation, `+=` or a string method from a runtime
//! value, where the text reads as a statement or goes to a raw SQL, clause or query call.
mod arrays;
mod composition;
mod inert;
mod sinks;
mod text;

use self::composition::{composition_kind, has_runtime_value, looks_like_sql, pieces_of};
use self::inert::{Piece, classify};
use self::sinks::{Sink, sink_for, variable_sink};
use crate::typescript::rules::Context;
use crate::typescript::rules::module_values::{Bindings, bindings_of, imported_function};
use crate::typescript::rules::security_values::{defs, variable_of};
use crate::typescript::rules::support::scope::{DefKind, Scopes};
use crate::typescript::rules::support::view::Node;
use std::collections::HashSet;

const RULE: &str = "no-sql-string-building";
const FORMAT_MODULES: &[&str] = &["util", "node:util", "sprintf-js"];
const FORMAT_FUNCTIONS: [&str; 2] = ["format", "sprintf"];
const COMPOSITIONS: [&str; 3] = ["BinaryExpression", "TemplateLiteral", "CallExpression"];
const TAGGED: [(&str, &str); 7] = [
    ("@prisma/client", "`prisma.$queryRaw`SELECT * FROM users WHERE id = ${id}`` (Prisma)"),
    ("drizzle-orm", "`sql`SELECT * FROM users WHERE id = ${id}`` from drizzle-orm"),
    ("kysely", "`sql`SELECT * FROM users WHERE id = ${id}`` from kysely"),
    ("postgres", "`sql`SELECT * FROM users WHERE id = ${id}`` (postgres)"),
    ("slonik", "`sql.unsafe`SELECT * FROM users WHERE id = ${id}`` from slonik"),
    ("@databases/pg", "`sql`SELECT * FROM users WHERE id = ${id}`` from @databases/pg"),
    ("sql-template-strings", "`SQL`SELECT * FROM users WHERE id = ${id}`` from sql-template-strings"),
];
const ANY_TAGGED: &str = "a tagged template where the driver has one (`sql`... ${id}`` in drizzle-orm, kysely or postgres, `prisma.$queryRaw`...``), or ";
const MESSAGE: &str = "SQL text built by {{kind}} lets a runtime value change the statement (SQL injection). Use {{tagged}}bind parameters: `pool.query(\"SELECT * FROM users WHERE id = $1\", [id])` (pg), `?` with an array (mysql2, sqlite, knex.raw, knex.whereRaw), `:name` (sequelize, typeorm `.where(\"user.id = :id\", { id })`). Placeholder lists are built from placeholders alone: `ids.map(() => \"?\").join(\",\")`, rows as `rows.map(() => \"(?, ?)\").join(\", \")`, `$${i + 1}`, and optional filters as `conditions.push(\"name = ?\")` joined with `\" AND \"`. A table or column name comes from a fixed lookup (`const COLUMNS = { name: \"name\" } as const; COLUMNS[key]`) or a value typed as a union of literal names (`table: \"users\" | \"orders\"`). An exception fits only when the value is trusted and cannot be written that way.";

fn tagged_form(library: Option<&str>) -> String {
    match TAGGED.iter().find(|(name, _)| Some(*name) == library) {
        Some((_, form)) => format!("{form}, or "),
        None => ANY_TAGGED.to_string(),
    }
}

struct Builder<'c, 'a, 's> {
    scopes: &'c Scopes<'a, 's>,
    formatters: Bindings,
    reported: HashSet<u32>,
    found: Vec<(Node<'s>, &'static str)>,
}

impl<'s> Builder<'_, '_, 's> {
    fn is_format_call(&self, call: Node<'s>) -> bool {
        let function = call.node("callee").and_then(|callee| imported_function(self.scopes, callee, &self.formatters));
        function.is_some_and(|function| FORMAT_FUNCTIONS.contains(&function.as_str()))
    }

    fn check(&mut self, node: Node<'s>, pieces: Option<Vec<Piece<'s>>>, sink: impl FnOnce() -> Option<Sink>) {
        let covered = node.ancestors().any(|owner| self.reported.contains(&owner.index));
        let Some(pieces) = pieces.filter(|pieces| !covered && has_runtime_value(pieces)) else { return };
        if looks_like_sql(&pieces, sink) {
            self.reported.insert(node.index);
            self.found.push((node, composition_kind(node)));
        }
    }

    fn check_composition(&mut self, node: Node<'s>) {
        let joined = node.is("BinaryExpression") && node.parent().is_some_and(|parent| parent.is("BinaryExpression") && parent.text("operator").as_deref() == Some("+"));
        let tagged = node.parent().is_some_and(|parent| parent.is("TaggedTemplateExpression"));
        if tagged || joined {
            return;
        }
        let pieces = pieces_of(self.scopes, node, &|call| self.is_format_call(call));
        let scopes = self.scopes;
        self.check(node, pieces, || sink_for(scopes, node));
    }

    fn initial_pieces(&self, identifier: Node<'s>) -> Vec<Piece<'s>> {
        let definition = defs(self.scopes, identifier).into_iter().next();
        let Some(init) = definition.filter(|definition| definition.kind == DefKind::Variable).and_then(|definition| definition.node.node("init")) else { return Vec::new() };
        pieces_of(self.scopes, init, &|call| self.is_format_call(call)).unwrap_or_else(|| vec![classify(self.scopes, Some(init))])
    }

    fn check_append(&mut self, node: Node<'s>) {
        let Some(left) = node.node("left").filter(|left| left.is("Identifier") && node.text("operator").as_deref() == Some("+=")) else { return };
        let mut pieces = self.initial_pieces(left);
        pieces.push(classify(self.scopes, node.node("right")));
        let scopes = self.scopes;
        self.check(node, Some(pieces), || variable_sink(scopes, variable_of(scopes, left)));
    }
}

pub fn check(context: &mut Context) {
    let Some((view, scopes)) = context.estree else { return };
    let tagged = tagged_form(context.setting(&format!("{RULE}.sql-library")).filter(|library| !library.is_empty()));
    let mut builder = Builder { scopes, formatters: bindings_of(view.program(), FORMAT_MODULES), reported: HashSet::new(), found: Vec::new() };
    for node in view.nodes() {
        if COMPOSITIONS.contains(&node.kind()) {
            builder.check_composition(node);
        } else if node.is("AssignmentExpression") {
            builder.check_append(node);
        }
    }
    for (node, kind) in builder.found {
        let message = MESSAGE.replace("{{kind}}", kind).replace("{{tagged}}", &tagged);
        context.report_range(RULE, node.start(), Some(node.end()), message);
    }
}
