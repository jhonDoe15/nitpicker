package catalog

import (
	"strings"

	"golang.org/x/tools/go/analysis"
)

// Checks returns the checks an analyzer reports findings under, or nil when each finding is
// reported under the analyzer's name.
func Checks(analyzer string) []string {
	for _, linter := range Linters() {
		for _, each := range linter.Analyzers {
			if each.Name == analyzer {
				return linter.Checks
			}
		}
	}
	return nil
}

// Rule names a diagnostic's finding: its check, for a linter that reports checks, or else the
// analyzer. The message loses the check-name prefix such linters put in front of it.
func Rule(analyzer string, diagnostic analysis.Diagnostic) (string, string) {
	if diagnostic.Category == "" || Checks(analyzer) == nil {
		return analyzer, diagnostic.Message
	}
	return diagnostic.Category, strings.TrimPrefix(diagnostic.Message, diagnostic.Category+": ")
}
