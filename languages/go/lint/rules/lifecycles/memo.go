package lifecycles

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var onceAnalyzer = &analysis.Analyzer{
	Name:     "once_keeps_error",
	Doc:      "reports a sync.Once initialiser whose failure is kept for every later caller",
	Requires: support.Requires,
	Run:      runOnce,
}

const onceMessage = "this initialiser runs once and its error is kept, so one failed attempt (a dial that times out) " +
	"fails every later caller until the process restarts: guard the initialiser with a mutex and reset on failure, " +
	"or retry through `singleflight`. An exception fits only when a startup failure should stay failed"

func runOnce(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) {
			continue
		}
		if isOnceDo(pass, call) && assignsError(pass, call) || isOnceValues(pass, call) {
			pass.Reportf(call.Pos(), "%s", onceMessage)
		}
	}
	return nil, nil
}

func isOnceDo(pass *analysis.Pass, call *ast.CallExpr) bool {
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Do" {
		return false
	}
	return support.IsNamed(support.Deref(pass.TypesInfo.TypeOf(selector.X)), "sync", "Once")
}

func isOnceValues(pass *analysis.Pass, call *ast.CallExpr) bool {
	if !support.IsFunc(pass.TypesInfo, call, "sync", "OnceValues") || len(call.Args) != 1 {
		return false
	}
	signature, ok := pass.TypesInfo.TypeOf(call.Args[0]).(*types.Signature)
	if !ok || signature.Results().Len() == 0 {
		return false
	}
	return isError(signature.Results().At(signature.Results().Len() - 1).Type())
}

func assignsError(pass *analysis.Pass, call *ast.CallExpr) bool {
	if len(call.Args) != 1 {
		return false
	}
	literal, ok := call.Args[0].(*ast.FuncLit)
	if !ok {
		return false
	}
	found := false
	ast.Inspect(literal.Body, func(node ast.Node) bool {
		assignment, ok := node.(*ast.AssignStmt)
		if !ok {
			return !found
		}
		for _, left := range assignment.Lhs {
			if isError(pass.TypesInfo.TypeOf(left)) && escapes(pass, left, literal) {
				found = true
			}
		}
		return !found
	})
	return found
}

func escapes(pass *analysis.Pass, left ast.Expr, literal *ast.FuncLit) bool {
	switch value := ast.Unparen(left).(type) {
	case *ast.SelectorExpr:
		return true
	case *ast.Ident:
		object := pass.TypesInfo.Uses[value]
		return object != nil && (object.Pos() < literal.Pos() || object.Pos() > literal.End())
	}
	return false
}
