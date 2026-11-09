package remote

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var loopAnalyzer = &analysis.Analyzer{
	Name:     "io_in_loop",
	Doc:      "reports a database or HTTP call once per item of a loop",
	Requires: support.Requires,
	Run:      runLoop,
}

const loopMessage = "one database or HTTP call per item of the loop: read or write the items in one batch " +
	"(`WHERE id = ANY($1)`, `IN (...)`, `COPY`, a bulk endpoint), or run the calls concurrently under a limit " +
	"with an errgroup and `SetLimit`"

func runLoop(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) || !remoteCall(pass.TypesInfo, call) {
			continue
		}
		if perItem(pass, cursor) {
			pass.Reportf(call.Pos(), "%s", loopMessage)
		}
	}
	return nil, nil
}

func perItem(pass *analysis.Pass, cursor inspector.Cursor) bool {
	for each := range cursor.Enclosing((*ast.RangeStmt)(nil), (*ast.FuncLit)(nil), (*ast.FuncDecl)(nil)) {
		loop, isRange := each.Node().(*ast.RangeStmt)
		if !isRange {
			return false
		}
		if inBody(loop, cursor.Node()) && overItems(pass, loop.X) {
			return true
		}
	}
	return false
}

func inBody(loop *ast.RangeStmt, node ast.Node) bool {
	return loop.Body.Pos() <= node.Pos() && node.End() <= loop.Body.End()
}

func overItems(pass *analysis.Pass, collection ast.Expr) bool {
	if _, literal := ast.Unparen(collection).(*ast.CompositeLit); literal {
		return false
	}
	if ident, ok := ast.Unparen(collection).(*ast.Ident); ok {
		if variable, isVar := pass.TypesInfo.Uses[ident].(*types.Var); isVar && variable.Parent() == pass.Pkg.Scope() {
			return false
		}
	}
	switch types.Unalias(pass.TypesInfo.TypeOf(collection)).Underlying().(type) {
	case *types.Slice, *types.Array, *types.Map:
		return true
	}
	return false
}
