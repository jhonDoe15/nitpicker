pub mod errorprone;
mod spotbugs;
mod facts;
mod grammar;
pub(crate) mod fields;
mod helpers;
pub mod javac;
mod magic_number;
mod naming;
mod pmd_sample;
mod statements;
mod pmd;
mod typed_rules;
mod types;
mod visibility;

use crate::engine::source::SourceFile;
use crate::engine::{FileFacts, FileRule, Language, Options, Project};

pub struct Java;

impl Language for Java {
    fn id(&self) -> &'static str { "java" }
    fn extensions(&self) -> &'static [&'static str] { &["java"] }
    fn grammar(&self) -> tree_sitter::Language { tree_sitter_java::LANGUAGE.into() }
    /// Text the grammar parses in place of the file, same length: see `grammar::masked`.
    fn grammar_text(&self, text: &str) -> Option<String> { grammar::masked(text) }
    fn rules(&self) -> Vec<Box<dyn FileRule>> {
        let mut rules: Vec<Box<dyn FileRule>> = vec![
            Box::new(magic_number::MagicNumber),
            Box::new(visibility::VisibilityModifier),
        ];
        rules.extend(naming::rules());
        rules.extend(statements::rules());
        rules.extend(pmd_sample::rules());
        rules.extend(typed_rules::rules());
        rules.push(Box::new(errorprone::ErrorProne));
        rules.push(Box::new(spotbugs::SpotBugs));
        rules.push(Box::new(javac::rule::JavacNames));
        rules.push(Box::new(pmd::dump::TreeDump));
        if let Some(rules_from_file) = pmd::rules::XPathRules::from_env() {
            rules.push(Box::new(rules_from_file));
        }
        rules
    }
    fn facts(&self, file: &SourceFile) -> FileFacts { facts::facts(file) }
    fn outline(&self, file: &SourceFile) -> Option<String> { Some(types::project::outline(file)) }
    fn project(&self, files: &[SourceFile], options: &Options, needed: bool) -> Box<Project> {
        if needed { Box::new(types::project::build(files, &options.classpath)) } else { Box::new(()) }
    }
}
