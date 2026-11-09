package design

import (
	"go/ast"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var initAnalyzer = &analysis.Analyzer{
	Name:     "init_side_effect",
	Doc:      "reports an init function that runs calls for their effect",
	Requires: support.Requires,
	Run:      runInit,
}

const initMessage = "init runs this at import time, in an order callers cannot see or control: " +
	"move it into a setup function that main or a constructor calls"

func runInit(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) {
			continue
		}
		for _, decl := range file.Decls {
			function, ok := decl.(*ast.FuncDecl)
			if ok && function.Recv == nil && function.Name.Name == "init" && function.Body != nil {
				reportEffects(pass, function.Body)
			}
		}
	}
	return nil, nil
}

func reportEffects(pass *analysis.Pass, body *ast.BlockStmt) {
	ast.Inspect(body, func(node ast.Node) bool {
		switch node.(type) {
		case *ast.FuncLit:
			return false
		case *ast.ExprStmt, *ast.GoStmt, *ast.DeferStmt, *ast.SendStmt:
			pass.Reportf(node.Pos(), "%s", initMessage)
			return false
		}
		return true
	})
}
