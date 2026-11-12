package remote

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

func assignedTarget(cursor inspector.Cursor) ast.Expr {
	node := cursor.Node()
	parent := cursor.Parent()
	if unary, ok := parent.Node().(*ast.UnaryExpr); ok && unary.X == node {
		node, parent = unary, parent.Parent()
	}
	switch each := parent.Node().(type) {
	case *ast.AssignStmt:
		for index, value := range each.Rhs {
			if value == node && index < len(each.Lhs) {
				return each.Lhs[index]
			}
		}
	case *ast.ValueSpec:
		for index, value := range each.Values {
			if value == node && index < len(each.Names) {
				return each.Names[index]
			}
		}
	}
	return nil
}

func timeoutSetLater(pass *analysis.Pass, cursor inspector.Cursor, target ast.Expr) bool {
	function, found := support.EnclosingFunc(cursor)
	if target == nil || !found {
		return false
	}
	want := types.ExprString(target)
	for each := range function.Preorder((*ast.AssignStmt)(nil)) {
		for _, left := range each.Node().(*ast.AssignStmt).Lhs {
			selector, ok := left.(*ast.SelectorExpr)
			if ok && selector.Sel.Name == "Timeout" && types.ExprString(selector.X) == want {
				return true
			}
		}
	}
	return false
}
