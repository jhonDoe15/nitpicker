// Package catalog lists the go/analysis linters the lint program runs beside staticcheck,
// each under its own tool name.
package catalog

import (
	errname "github.com/Antonboom/errname/pkg/analyzer"
	nilnil "github.com/Antonboom/nilnil/pkg/analyzer"
	"github.com/gostaticanalysis/comment"
	"github.com/gostaticanalysis/comment/passes/commentmap"
	"github.com/gostaticanalysis/nilerr"
	"github.com/jingyugao/rowserrcheck/passes/rowserr"
	"github.com/kkHAIKE/contextcheck"
	"github.com/polyfloyd/go-errorlint/errorlint"
	sqlclosecheck "github.com/ryanrolds/sqlclosecheck/pkg/analyzer"
	"github.com/sivchari/containedctx"
	"github.com/sonatard/noctx"
	"github.com/timakin/bodyclose/passes/bodyclose"
	fatcontext "go.augendre.info/fatcontext/pkg/analyzer"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/packages"
)

// Linter is one linter: the tool name findings are printed under and its analyzers.
type Linter struct {
	Tool      string
	Analyzers []*analysis.Analyzer
}

// SQLPackages are the packages whose rows rowserrcheck follows beside database/sql.
var SQLPackages = []string{"github.com/jmoiron/sqlx"}

var (
	errorComparisons = errorlint.NewAnalyzer()
	contexts         = contextcheck.NewAnalyzer(contextcheck.Configuration{})
	linters          = []Linter{
		{Tool: "bodyclose", Analyzers: []*analysis.Analyzer{bodyclose.Analyzer}},
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
	return linters
}

// Configure sets the options that differ from each linter's defaults, and turns off the
// `//lint:ignore` comments some linters read.
func Configure() error {
	commentmap.Analyzer.Run = func(*analysis.Pass) (any, error) { return comment.Maps{}, nil }
	return errorComparisons.Flags.Set("errorf", "true")
}

// Prepare readies the catalog linters for the loaded packages. It limits contextcheck to the
// module's own packages, as golangci-lint does, so that what it infers about the standard
// library does not reach the module's calls, and it turns off the `//nolint:` doc comments
// contextcheck reads.
func Prepare(loaded []*packages.Package) error {
	for _, pkg := range loaded {
		ignoreSuppressions(pkg.Syntax)
		if pkg.Module != nil {
			if err := contexts.Flags.Set("pkgprefix", pkg.Module.Path); err != nil {
				return err
			}
		}
	}
	return nil
}
