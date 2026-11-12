package rules

import (
	"slices"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/concurrency"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/design"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/failures"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/guards"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/honesty"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/remote"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/secrets"
	"golang.org/x/tools/go/analysis"
)

const Tool = "go-rules"

func Analyzers() []*analysis.Analyzer {
	return slices.Concat(failures.Analyzers(), concurrency.Analyzers(), design.Analyzers(), remote.Analyzers(),
		guards.Analyzers(), secrets.Analyzers(), honesty.Analyzers())
}
