package catalog

import (
	"go/ast"
	"go/token"

	"github.com/ashanbrown/makezero/v2/makezero"
	"github.com/charithe/durationcheck"
	reassign "github.com/curioswitch/go-reassign"
	"github.com/golangci/unconvert"
	"github.com/nishanths/exhaustive/passes/exhaustive"
	"github.com/raeperd/recvcheck"
	"github.com/sanposhiho/wastedassign/v2"
	"golang.org/x/tools/go/analysis"
)

// valueMethods are the interface methods a type implements with a value receiver even when its
// other methods take a pointer, so that values and pointers both satisfy the interface.
var valueMethods = []string{
	"*.String", "*.GoString", "*.Format", "*.Error", "*.Value",
	"*.MarshalJSON", "*.MarshalText", "*.MarshalBinary", "*.MarshalYAML", "*.MarshalXML",
}

var (
	appendsToLength = &analysis.Analyzer{
		Name: "makezero",
		Doc:  "reports appends to a slice made with a non-zero length",
		Run:  reportAppendsToLength,
	}
	conversions = &analysis.Analyzer{
		Name: "unconvert",
		Doc:  "reports conversions to the type the value already has",
		Run:  reportConversions,
	}
	valueLinters = []Linter{
		{Tool: "exhaustive", Analyzers: []*analysis.Analyzer{exhaustive.Analyzer}},
		{Tool: "recvcheck", Analyzers: []*analysis.Analyzer{recvcheck.NewAnalyzer(recvcheck.Settings{Exclusions: valueMethods})}},
		{Tool: "durationcheck", Analyzers: []*analysis.Analyzer{durationcheck.Analyzer}},
		{Tool: "makezero", Analyzers: []*analysis.Analyzer{appendsToLength}},
		{Tool: "reassign", Analyzers: []*analysis.Analyzer{reassign.NewAnalyzer()}},
		{Tool: "unconvert", Analyzers: []*analysis.Analyzer{conversions}},
		{Tool: "wastedassign", Analyzers: []*analysis.Analyzer{wastedassign.Analyzer}},
	}
)

func reportAppendsToLength(pass *analysis.Pass) (any, error) {
	files := make([]ast.Node, 0, len(pass.Files))
	for _, file := range pass.Files {
		uncommented := *file
		uncommented.Comments = nil
		files = append(files, &uncommented)
	}
	issues, err := makezero.NewLinter(false).Run(pass.Fset, pass.TypesInfo, files...)
	if err != nil {
		return nil, err
	}
	for _, issue := range issues {
		pass.Reportf(issue.Pos(), "%s", issue.Details())
	}
	return nil, nil
}

func reportConversions(pass *analysis.Pass) (any, error) {
	parentheses := map[token.Position]token.Pos{}
	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			if call, ok := node.(*ast.CallExpr); ok {
				position := pass.Fset.Position(call.Lparen)
				position.Offset = 0
				parentheses[position] = call.Lparen
			}
			return true
		})
	}
	for _, position := range unconvert.Run(pass) {
		position.Offset = 0
		if at, found := parentheses[position]; found {
			pass.Reportf(at, "unnecessary conversion")
		}
	}
	return nil, nil
}

func configureValues() error {
	return exhaustive.Analyzer.Flags.Set("d", "true")
}
