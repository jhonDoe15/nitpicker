package failures

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
)

func logs(info *types.Info, statement ast.Stmt) bool {
	expression, ok := statement.(*ast.ExprStmt)
	if !ok {
		return false
	}
	found, exited := false, false
	ast.Inspect(expression.X, func(node ast.Node) bool {
		call, isCall := node.(*ast.CallExpr)
		if !isCall {
			return true
		}
		if callee, isLogger := support.LoggerCall(info, call); isLogger {
			found = true
			exited = exited || support.Exits(callee.Name())
		}
		return true
	})
	return found && !exited
}
