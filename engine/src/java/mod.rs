pub mod errorprone;
mod spotbugs;
mod facts;
mod flow;
mod helpers;
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
    /// The grammar rejects an annotation between a type and `...`; it is blanked out for parsing only.
    fn grammar_text(&self, text: &str) -> Option<String> {
        static ANNOTATED_SPREAD: std::sync::LazyLock<regex::Regex> =
            std::sync::LazyLock::new(|| regex::Regex::new(r"@[A-Za-z_][\w.]*(\s*\([^()]*\))?(\s*)\.\.\.").expect("pattern"));
        if !text.contains("...") {
            return None;
        }
        let mut masked: Option<Vec<u8>> = None;
        for found in ANNOTATED_SPREAD.find_iter(text) {
            let bytes = masked.get_or_insert_with(|| text.as_bytes().to_vec());
            for byte in &mut bytes[found.start()..found.end() - 3] {
                if !byte.is_ascii_whitespace() {
                    *byte = b' ';
                }
            }
        }
        masked.and_then(|bytes| String::from_utf8(bytes).ok())
    }
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
