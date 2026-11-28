//! The parse and semantic errors that make a file `!parse`: those typescript-estree also refuses. The TypeScript
//! parser leaves `await` and `yield` placement and redeclarations to the type checker, so a file with only those
//! errors is linted, as long as ESLint's scope manager would see the same variables as oxc.
mod redeclarations;
mod syntax;

use crate::typescript::ParsedFile;
use oxc_semantic::SemanticBuilderReturn;

const PLACEMENTS: [&str; 5] = [
    "`await` is only allowed within async functions and at the top levels of modules",
    "`for await` loops are only allowed within async functions and at the top levels of modules",
    "A 'yield' expression is only allowed in a generator body.",
    "Cannot use `await` as an identifier in an async context",
    "Cannot use `yield` as an identifier in a generator context",
];

const CHECKED_PLACEMENTS: [&str; 7] = [
    "The keyword 'await' is reserved",
    "The keyword 'yield' is reserved",
    "await expression not allowed in formal parameter",
    "yield expression not allowed in formal parameter",
    "Cannot use await in class static initialization block",
    "Cannot use 'for await' in class static initialization block",
    "Cannot use 'await using' in class static initialization block",
];

/// Whether typescript-estree refuses the parsed file: a parse error other than an `await` or `yield` placement, or
/// syntax its own checks reject.
pub fn refused_parse(file: &ParsedFile) -> bool {
    file.panicked || file.errors.iter().any(|error| !PLACEMENTS.contains(&error.as_str())) || syntax::refused(file.program, file.text, file.path)
}

pub fn refused(built: &SemanticBuilderReturn) -> bool {
    if built.diagnostics.is_empty() {
        return false;
    }
    let allowed = redeclarations::shared_redeclarations(&built.semantic);
    built.diagnostics.iter().any(|diagnostic| {
        let spans: Vec<u32> = diagnostic.labels.iter().filter_map(|label| u32::try_from(label.offset()).ok()).collect();
        let redeclared = diagnostic.message.ends_with("has already been declared");
        let placement = CHECKED_PLACEMENTS.contains(&diagnostic.message.as_ref());
        !(placement || redeclared && matches!(spans[..], [first, again] if allowed.contains(&(first, again))))
    })
}

