use super::report::Report;
use crate::engine::FileRule;
use crate::engine::source::SourceFile;
use crate::java::{magic_number, naming, statements, visibility};

const CHECKS: &str = "com.puppycrawl.tools.checkstyle.checks.";

fn package(id: &str) -> &'static str {
    match id {
        "MagicNumber" | "MissingSwitchDefault" | "MultipleVariableDeclarations" | "NoFinalizer" => {
            "coding."
        }
        "NeedBraces" => "blocks.",
        "VisibilityModifier" | "OneTopLevelClass" => "design.",
        "AvoidStarImport" => "imports.",
        "ModifierOrder" => "modifier.",
        "UpperEll" | "ArrayTypeStyle" => "",
        _ => "naming.",
    }
}

pub fn check(file: &SourceFile, report: &mut Report) {
    let mut rules: Vec<Box<dyn FileRule>> = vec![
        Box::new(magic_number::MagicNumber),
        Box::new(visibility::VisibilityModifier),
    ];
    rules.extend(naming::rules());
    rules.extend(statements::rules());
    let mut found = Vec::new();
    for rule in &rules {
        rule.check(file, &mut found);
    }
    for finding in found {
        let source = format!("{CHECKS}{}{}Check", package(&finding.rule), finding.rule);
        let text = report.line_text(finding.line);
        let byte = (finding.column - 1).min(text.len());
        let units = text
            .get(..byte)
            .map_or(byte, |prefix| prefix.encode_utf16().count());
        let message = match (finding.message.strip_prefix("Name "), named(&finding.rule)) {
            (Some(rest), Some(kind)) => format!("{kind} name {rest}"),
            _ => finding.message,
        };
        report.at(finding.line, Some(units), &source, message);
    }
}

fn named(id: &str) -> Option<&'static str> {
    Some(match id {
        "MethodName" => "Method",
        "ParameterName" => "Parameter",
        "LambdaParameterName" => "Lambda parameter",
        "CatchParameterName" => "Catch parameter",
        "LocalVariableName" => "Local variable",
        "TypeName" => "Type",
        _ => return None,
    })
}
