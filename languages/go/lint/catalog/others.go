package catalog

import (
	"go/ast"

	"4d63.com/gocheckcompilerdirectives/checkcompilerdirectives"
	"github.com/breml/bidichk/pkg/bidichk"
	perfsprint "github.com/catenacyber/perfsprint/analyzer"
	"github.com/golangci/asciicheck"
	"github.com/golangci/canonicalheader"
	spancheck "github.com/jjti/go-spancheck"
	usestdlibvars "github.com/sashamelentyev/usestdlibvars/pkg/analyzer"
	"go-simpler.org/musttag"
	"go-simpler.org/sloglint"
	"golang.org/x/tools/go/analysis"
)

// PerfsprintChecks are the perfsprint checks this preset runs; modernize covers concat-loop;
// revive unnecessary-format covers error-format.
var PerfsprintChecks = []string{
	"integer-format", "string-format", "bool-format", "hex-format",
}

var standardValues = []string{
	usestdlibvars.TimeLayoutFlag, usestdlibvars.RPCDefaultPathFlag, usestdlibvars.TimeDateMonthFlag,
}

var (
	directives         = checkcompilerdirectives.Analyzer()
	compilerDirectives = &analysis.Analyzer{
		Name: directives.Name,
		Doc:  directives.Doc,
		Run:  reportDirectives,
	}
	spans        = spancheck.NewAnalyzerWithConfig(spancheck.NewDefaultConfig())
	formatting   = perfsprint.New()
	stdlibValues = usestdlibvars.New()
	logCalls     = sloglint.New(&sloglint.Options{ContextOnly: "scope", AttributesOnly: true})
	otherLinters = []Linter{
		{Tool: "asciicheck", Analyzers: []*analysis.Analyzer{asciicheck.NewAnalyzer()}},
		{Tool: "bidichk", Analyzers: []*analysis.Analyzer{bidichk.NewAnalyzer()}},
		{Tool: "gocheckcompilerdirectives", Analyzers: []*analysis.Analyzer{compilerDirectives}},
		{Tool: "canonicalheader", Analyzers: []*analysis.Analyzer{canonicalheader.New()}},
		{Tool: "musttag", Analyzers: []*analysis.Analyzer{musttag.New()}},
		{Tool: "perfsprint", Analyzers: []*analysis.Analyzer{formatting}, Checks: PerfsprintChecks},
		{Tool: "usestdlibvars", Analyzers: []*analysis.Analyzer{stdlibValues}},
		{Tool: "sloglint", Analyzers: []*analysis.Analyzer{logCalls}},
		{Tool: "spancheck", Analyzers: []*analysis.Analyzer{spans}},
	}
)

func configureOthers() error {
	for _, check := range standardValues {
		if err := stdlibValues.Flags.Set(check, "true"); err != nil {
			return err
		}
	}
	for _, check := range []string{"fiximports", "concat-loop", "error-format"} {
		if err := formatting.Flags.Set(check, "false"); err != nil {
			return err
		}
	}
	return nil
}

func reportDirectives(pass *analysis.Pass) (any, error) {
	padded := *pass
	padded.Files = make([]*ast.File, 0, len(pass.Files))
	for _, file := range pass.Files {
		copied := *file
		copied.Comments = make([]*ast.CommentGroup, 0, len(file.Comments))
		for _, group := range file.Comments {
			lines := make([]*ast.Comment, 0, len(group.List))
			for _, line := range group.List {
				lines = append(lines, &ast.Comment{Slash: line.Slash, Text: line.Text + " "})
			}
			copied.Comments = append(copied.Comments, &ast.CommentGroup{List: lines})
		}
		padded.Files = append(padded.Files, &copied)
	}
	return directives.Run(&padded)
}
