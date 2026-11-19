package rules

import (
	"slices"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/affixes"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/backoff"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/concurrency"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/copies"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/database"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/design"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/failures"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/guards"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/honesty"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/httpvalues"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/indexbound"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/jobs"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/lifecycles"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/listings"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/lookups"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/markup"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/nanguard"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/negativecount"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/nilbranch"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/optional"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/overflow"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/preconditions"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/querytext"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/remote"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/replacements"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/requests"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/resolvers"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/responsejson"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/schema"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/secrets"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/textsplits"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/translation"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/wallclock"
	"golang.org/x/tools/go/analysis"
)

const Tool = "go-rules"

func Analyzers() []*analysis.Analyzer {
	return slices.Concat(
		failures.Analyzers(),
		concurrency.Analyzers(),
		design.Analyzers(),
		remote.Analyzers(),
		database.Analyzers(),
		guards.Analyzers(),
		schema.Analyzers(),
		secrets.Analyzers(),
		honesty.Analyzers(),
		lifecycles.Analyzers(),
		httpvalues.Analyzers(),
		textsplits.Analyzers(),
		affixes.Analyzers(),
		[]*analysis.Analyzer{
			copies.Analyzer,
			optional.Analyzer,
	return slices.Concat(failures.Analyzers(), concurrency.Analyzers(), design.Analyzers(), remote.Analyzers(),
		database.Analyzers(), guards.Analyzers(), schema.Analyzers(), secrets.Analyzers(), honesty.Analyzers(),
		lifecycles.Analyzers(), httpvalues.Analyzers(),
		[]*analysis.Analyzer{
			copies.Analyzer,
			optional.Analyzer,
			nilbranch.Analyzer,
			overflow.Analyzer,
			requests.Analyzer,
			jobs.Analyzer,
			resolvers.Analyzer,
			translation.Analyzer,
			replacements.Analyzer,
			markup.Analyzer,
			responsejson.Analyzer,
			wallclock.Analyzer,
			backoff.Analyzer,
			indexbound.Analyzer,
			negativecount.Analyzer,
			nanguard.Analyzer,
			lookups.Analyzer,
			preconditions.Analyzer,
			querytext.Analyzer,
			listings.Analyzer,
		},
	)
		})
}
