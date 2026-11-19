package nilbranch

import (
	"go/ast"
	"go/token"

	"golang.org/x/tools/go/analysis"
)

func usesAfter(pass *analysis.Pass, statements []ast.Stmt, subject ast.Expr) ast.Node {
	for _, statement := range statements {
		switch found, at := outcome(pass, statement, subject); found {
		case used:
			return at
		case settled:
			return nil
		}
	}
	return nil
}

type result int

const (
	untouched result = iota
	used
	settled
)

func outcome(pass *analysis.Pass, statement ast.Stmt, subject ast.Expr) (result, ast.Node) {
	found := untouched
	var at ast.Node
	ast.Inspect(statement, func(node ast.Node) bool {
		if found != untouched {
			return false
		}
		switch node := node.(type) {
		case *ast.FuncLit:
			return false
		case *ast.AssignStmt:
			if assigns(pass, node.Lhs, subject) {
				found = settled
			}
		case *ast.BinaryExpr:
			if (node.Op == token.EQL || node.Op == token.NEQ) && (same(pass, node.X, subject) || same(pass, node.Y, subject)) {
				found = settled
			}
		case *ast.SelectorExpr:
			if same(pass, node.X, subject) {
				found, at = used, node
			}
		case *ast.StarExpr:
			if same(pass, node.X, subject) {
				found, at = used, node
			}
		}
		return found == untouched
	})
	return found, at
}
