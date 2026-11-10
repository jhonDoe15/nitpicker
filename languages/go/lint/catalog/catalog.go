// Package catalog lists the go/analysis linters the lint program runs beside staticcheck,
// each under its own tool name.
package catalog

import (
	"slices"

	"codeberg.org/polyfloyd/go-errorlint/errorlint"
	errname "github.com/Antonboom/errname/pkg/analyzer"
	nilnil "github.com/Antonboom/nilnil/pkg/analyzer"
	"github.com/gostaticanalysis/comment"
	"github.com/gostaticanalysis/comment/passes/commentmap"
	"github.com/gostaticanalysis/nilerr"
	"github.com/jingyugao/rowserrcheck/passes/rowserr"
	"github.com/kkHAIKE/contextcheck"
	sqlclosecheck "github.com/ryanrolds/sqlclosecheck/pkg/analyzer"
	"github.com/sivchari/containedctx"
	"github.com/sonatard/noctx"
	"github.com/timakin/bodyclose/passes/bodyclose"
	fatcontext "go.augendre.info/fatcontext/pkg/analyzer"
	"golang.org/x/tools/go/analysis"
)

// Linter is one linter: the tool name findings are printed under and its analyzers. A linter
// with Checks reports each finding under the check named by the diagnostic's category.
type Linter struct {
	Tool      string
	Analyzers []*analysis.Analyzer
	Checks    []string
}

// SQLPackages are the packages whose rows rowserrcheck follows beside database/sql.
var SQLPackages = []string{"github.com/jmoiron/sqlx"}

var (
	errorComparisons = errorlint.NewAnalyzer()
	contexts         = contextcheck.NewAnalyzer(contextcheck.Configuration{})
	linters          = []Linter{
		{Tool: "bodyclose", Analyzers: []*analysis.Analyzer{bodyclose.Analyzer, handledDirective}},
		{Tool: "rowserrcheck", Analyzers: []*analysis.Analyzer{rowserr.NewAnalyzer(SQLPackages...)}},
		{Tool: "sqlclosecheck", Analyzers: []*analysis.Analyzer{sqlclosecheck.NewAnalyzer()}},
		{Tool: "noctx", Analyzers: []*analysis.Analyzer{noctx.Analyzer}},
		{Tool: "errorlint", Analyzers: []*analysis.Analyzer{errorComparisons}},
		{Tool: "nilerr", Analyzers: []*analysis.Analyzer{nilerr.Analyzer}},
		{Tool: "nilnil", Analyzers: []*analysis.Analyzer{nilnil.New()}},
		{Tool: "errname", Analyzers: []*analysis.Analyzer{errname.New()}},
		{Tool: "contextcheck", Analyzers: []*analysis.Analyzer{contexts}},
		{Tool: "containedctx", Analyzers: []*analysis.Analyzer{containedctx.Analyzer}},
		{Tool: "fatcontext", Analyzers: []*analysis.Analyzer{fatcontext.NewAnalyzer()}},
	}
)

// Linters returns every catalog linter.
func Linters() []Linter {
	return slices.Concat(linters, valueLinters, testLinters)
}

// Configure sets the options that differ from each linter's defaults, and turns off the
// `//lint:ignore` comments some linters read.
func Configure() error {
	commentmap.Analyzer.Run = func(*analysis.Pass) (any, error) { return comment.Maps{}, nil }
	if err := errorComparisons.Flags.Set("errorf", "true"); err != nil {
		return err
	}
	if err := configureValues(); err != nil {
		return err
	}
	return configureTests()
}
