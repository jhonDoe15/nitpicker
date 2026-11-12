package concurrency

import (
	"go/ast"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var contextAnalyzer = &analysis.Analyzer{
	Name:     "context_outside_entry",
	Doc:      "reports context.Background and context.TODO outside package main",
	Requires: support.Requires,
	Run:      runContext,
}

const contextMessage = "a new root context outside package main cannot be cancelled by any caller: " +
	"take `ctx context.Context` as the first parameter and pass it on"

func runContext(pass *analysis.Pass) (any, error) {
	if pass.Pkg.Name() == "main" {
		return nil, nil
	}
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) {
			continue
		}
		if support.IsFunc(pass.TypesInfo, call, "context", "Background") ||
			support.IsFunc(pass.TypesInfo, call, "context", "TODO") {
			pass.Reportf(call.Pos(), "%s", contextMessage)
		}
	}
	return nil, nil
}
