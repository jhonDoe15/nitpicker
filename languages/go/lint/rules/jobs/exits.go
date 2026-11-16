package jobs

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"golang.org/x/tools/go/types/typeutil"
)

func failsTheRun(info *types.Info, statement *ast.IfStmt, failures map[types.Object]bool, path []ast.Node) bool {
	binary, ok := ast.Unparen(statement.Cond).(*ast.BinaryExpr)
	if !ok || binary.Op != token.NEQ || !isNil(info, binary.Y) {
		return false
	}
	ident, isIdent := ast.Unparen(binary.X).(*ast.Ident)
	if !isIdent || !failures[info.ObjectOf(ident)] || len(statement.Body.List) == 0 {
		return false
	}
	last := statement.Body.List[len(statement.Body.List)-1]
	return endsRun(info, last) && !continues(statement.Body) && (!isBreak(last) || !nestedBreakTarget(path))
}

func isNil(info *types.Info, expression ast.Expr) bool {
	ident, ok := ast.Unparen(expression).(*ast.Ident)
	if !ok {
		return false
	}
	_, isNilValue := info.Uses[ident].(*types.Nil)
	return isNilValue
}

func endsRun(info *types.Info, statement ast.Stmt) bool {
	switch last := statement.(type) {
	case *ast.ReturnStmt:
		return true
	case *ast.BranchStmt:
		return last.Tok == token.BREAK && last.Label == nil
	case *ast.ExprStmt:
		call, ok := last.X.(*ast.CallExpr)
		return ok && (fatal(info, call) || panics(info, call))
	}
	return false
}

func fatal(info *types.Info, call *ast.CallExpr) bool {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil {
		return false
	}
	return callee.Pkg().Path() == "os" && callee.Name() == "Exit" || strings.HasPrefix(callee.Name(), "Fatal")
}

func panics(info *types.Info, call *ast.CallExpr) bool {
	ident, ok := ast.Unparen(call.Fun).(*ast.Ident)
	if !ok {
		return false
	}
	builtin, isBuiltin := info.Uses[ident].(*types.Builtin)
	return isBuiltin && builtin.Name() == "panic"
}

func continues(body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		switch each := node.(type) {
		case *ast.RangeStmt, *ast.ForStmt, *ast.FuncLit:
			return false
		case *ast.BranchStmt:
			found = found || each.Tok == token.CONTINUE
		}
		return !found
	})
	return found
}

func isBreak(statement ast.Stmt) bool {
	branch, ok := statement.(*ast.BranchStmt)
	return ok && branch.Tok == token.BREAK
}

func nestedBreakTarget(path []ast.Node) bool {
	for _, node := range path {
		switch node.(type) {
		case *ast.SwitchStmt, *ast.TypeSwitchStmt, *ast.SelectStmt, *ast.RangeStmt, *ast.ForStmt:
			return true
		}
	}
	return false
}
