package rules

import (
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/concurrency"
	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/failures"
	"golang.org/x/tools/go/analysis"
)

const Tool = "go-rules"

func Analyzers() []*analysis.Analyzer {
	return append(failures.Analyzers(), concurrency.Analyzers()...)
}
