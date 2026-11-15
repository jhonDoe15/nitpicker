package overflow

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "max_value_overflow",
	Doc:      "reports an integer sum or product with an operand that holds the type's maximum value",
	Requires: support.Requires,
	Run:      run,
}

const message = "this operand can hold the maximum of its type, so the %s can overflow and go on as a " +
	"negative index, length or bound: compare without adding (`width >= length-start`), " +
	"check the sentinel before the arithmetic, or use `min` before the add"

func run(pass *analysis.Pass) (any, error) {
	carriers := maxCarriers(pass)
	for cursor := range support.Root(pass).Preorder((*ast.BinaryExpr)(nil), (*ast.AssignStmt)(nil)) {
		if support.InTestFile(pass, cursor.Node()) {
			continue
		}
		switch node := cursor.Node().(type) {
		case *ast.BinaryExpr:
			checkBinary(pass, carriers, cursor, node)
		case *ast.AssignStmt:
			checkAssign(pass, carriers, cursor, node)
		}
	}
	return nil, nil
}

func checkBinary(pass *analysis.Pass, carriers carriers, cursor cursorOf, expr *ast.BinaryExpr) {
	if (expr.Op != token.ADD && expr.Op != token.MUL) || !isInteger(pass.TypesInfo.TypeOf(expr)) ||
		pass.TypesInfo.Types[expr].Value != nil {
		return
	}
	operand, found := maxOperand(pass, carriers, expr.X, expr.Y)
	if !found || guarded(pass, carriers, cursor, operand) || !resultUsed(pass, cursor) {
		return
	}
	pass.Reportf(expr.OpPos, message, operation(expr.Op))
}

func checkAssign(pass *analysis.Pass, carriers carriers, cursor cursorOf, statement *ast.AssignStmt) {
	if (statement.Tok != token.ADD_ASSIGN && statement.Tok != token.MUL_ASSIGN) || len(statement.Lhs) != 1 ||
		len(statement.Rhs) != 1 || !isInteger(pass.TypesInfo.TypeOf(statement.Lhs[0])) {
		return
	}
	operand, found := maxOperand(pass, carriers, statement.Lhs[0], statement.Rhs[0])
	if !found || guarded(pass, carriers, cursor, operand) || !targetUsed(pass, cursor, statement.Lhs[0]) {
		return
	}
	operator := token.ADD
	if statement.Tok == token.MUL_ASSIGN {
		operator = token.MUL
	}
	pass.Reportf(statement.TokPos, message, operation(operator))
}

func operation(operator token.Token) string {
	if operator == token.MUL {
		return "product"
	}
	return "sum"
}

func isInteger(typ types.Type) bool {
	basic, ok := types.Unalias(typ).Underlying().(*types.Basic)
	return ok && basic.Info()&types.IsInteger != 0
}
