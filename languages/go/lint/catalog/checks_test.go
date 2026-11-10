package catalog

import (
	"testing"

	"golang.org/x/tools/go/analysis"
)

func TestRuleNamesTheCheckOfALinterThatReportsChecks(t *testing.T) {
	cases := []struct {
		analyzer, category, message, rule, text string
	}{
		{"testifylint", "len", "len: use assert.Len", "len", "use assert.Len"},
		{"testifylint", "new-check", "new-check: use something", "testifylint", "new-check: use something"},
		{"testifylint", "", "use assert.Len", "testifylint", "use assert.Len"},
		{"nilerr", "nilerr", "error is not nil", "nilerr", "error is not nil"},
	}
	for _, each := range cases {
		rule, text := Rule(each.analyzer, analysis.Diagnostic{Category: each.category, Message: each.message})
		if rule != each.rule || text != each.text {
			t.Errorf("Rule(%q, %q) = %q, %q", each.analyzer, each.message, rule, text)
		}
	}
}
