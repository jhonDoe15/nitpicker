package nanguard

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "nan_only_guard",
	Doc:      "reports math.IsNaN as the only check on a parsed or computed float",
	Requires: support.Requires,
	Run:      run,
}

const message = "`math.IsNaN(%s)` is the only check on a parsed or computed float, but `+Inf` and `-Inf` pass it " +
	"(`strconv.ParseFloat(\"1e999\", 64)` and a division by zero produce them), so the value goes on as a limit or " +
	"an amount: also reject infinities with `math.IsInf(%s, 0)`"

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		if support.InTestFile(pass, cursor.Node()) {
			continue
		}
		if body := bodyOf(cursor.Node()); body != nil {
			check(pass, body)
		}
	}
	return nil, nil
}

func bodyOf(node ast.Node) *ast.BlockStmt {
	if declaration, ok := node.(*ast.FuncDecl); ok {
		return declaration.Body
	}
	return node.(*ast.FuncLit).Body
}

func isFloat(pass *analysis.Pass, expression ast.Expr) bool {
	basic, ok := types.Unalias(pass.TypesInfo.TypeOf(expression)).Underlying().(*types.Basic)
	return ok && basic.Info()&types.IsFloat != 0
}

func canBeInfinite(pass *analysis.Pass, expression ast.Expr) bool {
	switch value := ast.Unparen(expression).(type) {
	case *ast.CallExpr:
		return support.IsFunc(pass.TypesInfo, value, "strconv", "ParseFloat")
	case *ast.BinaryExpr:
		constant := func(operand ast.Expr) bool { return pass.TypesInfo.Types[operand].Value != nil }
		switch value.Op {
		case token.QUO:
			return isFloat(pass, value) && !constant(value.Y)
		case token.MUL:
			return isFloat(pass, value) && !constant(value.X) && !constant(value.Y)
		}
	}
	return false
}

func origins(pass *analysis.Pass, body *ast.BlockStmt) map[types.Object]bool {
	found := map[types.Object]bool{}
	ast.Inspect(body, func(node ast.Node) bool {
		assign, ok := node.(*ast.AssignStmt)
		if !ok || assign.Tok != token.DEFINE || len(assign.Rhs) == 0 {
			return true
		}
		if len(assign.Lhs) != len(assign.Rhs) && len(assign.Rhs) != 1 {
			return true
		}
		if ident, ok := assign.Lhs[0].(*ast.Ident); ok && canBeInfinite(pass, assign.Rhs[0]) {
			if object := pass.TypesInfo.Defs[ident]; object != nil && isFloat(pass, ident) {
				found[object] = true
			}
		}
		return true
	})
	return found
}

func mentionsInfinity(pass *analysis.Pass, body *ast.BlockStmt) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok {
			found = found || support.IsFunc(pass.TypesInfo, call, "math", "IsInf") ||
				support.IsFunc(pass.TypesInfo, call, "math", "Inf")
		}
		return !found
	})
	return found
}

func compared(pass *analysis.Pass, body *ast.BlockStmt, object types.Object) bool {
	found := false
	ast.Inspect(body, func(node ast.Node) bool {
		expression, ok := node.(*ast.BinaryExpr)
		if !ok || (expression.Op != token.LSS && expression.Op != token.GTR && expression.Op != token.LEQ &&
			expression.Op != token.GEQ) {
			return !found
		}
		for _, side := range []ast.Expr{expression.X, expression.Y} {
			if ident, ok := ast.Unparen(side).(*ast.Ident); ok && pass.TypesInfo.Uses[ident] == object {
				found = true
			}
		}
		return !found
	})
	return found
}

func check(pass *analysis.Pass, body *ast.BlockStmt) {
	held := origins(pass, body)
	if len(held) == 0 || mentionsInfinity(pass, body) {
		return
	}
	ast.Inspect(body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok || len(call.Args) != 1 || !support.IsFunc(pass.TypesInfo, call, "math", "IsNaN") {
			return true
		}
		ident, ok := ast.Unparen(call.Args[0]).(*ast.Ident)
		if ok && held[pass.TypesInfo.Uses[ident]] && !compared(pass, body, pass.TypesInfo.Uses[ident]) {
			pass.Reportf(call.Pos(), message, ident.Name, ident.Name)
		}
		return true
	})
}
