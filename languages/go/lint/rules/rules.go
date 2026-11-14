package rules

import (
	"slices"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/concurrency"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/copies"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/database"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/design"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/failures"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/guards"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/honesty"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/jobs"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/lifecycles"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/optional"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/remote"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/resolvers"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/schema"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/secrets"
	"golang.org/x/tools/go/analysis"
)

const Tool = "go-rules"

func Analyzers() []*analysis.Analyzer {
	return slices.Concat(failures.Analyzers(), concurrency.Analyzers(), design.Analyzers(), remote.Analyzers(),
		database.Analyzers(), guards.Analyzers(), schema.Analyzers(), secrets.Analyzers(), honesty.Analyzers(),
		lifecycles.Analyzers(),
		[]*analysis.Analyzer{copies.Analyzer, optional.Analyzer, jobs.Analyzer, resolvers.Analyzer})
}
