package backoff

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"regexp"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var Analyzer = &analysis.Analyzer{
	Name:     "backoff_shift_overflow",
	Doc:      "reports an exponential backoff delay computed by a shift that overflows for large attempt counts",
	Requires: support.Requires,
	Run:      run,
}

const message = "the delay is multiplied by `1 << %s`, but nothing keeps `%s` below about 30, so for a large attempt " +
	"count the shift wraps to zero or the product overflows and the delay turns negative (a clamp to the type " +
	"width does not help): cap the exponent from the maximum delay (`min(%s, 20)`), or stop growing once " +
	"`%s` passes a limit"

const safeBound = 30

var comparison = map[token.Token]bool{token.LSS: true, token.GTR: true, token.LEQ: true, token.GEQ: true}

var hint = regexp.MustCompile(`(?i)attempt|retr(y|ies)|tries|backoff|delay|wait|sleep|failure`)

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.BinaryExpr)(nil)) {
		expression := cursor.Node().(*ast.BinaryExpr)
		if expression.Op != token.MUL || support.InTestFile(pass, expression) {
			continue
		}
		shift := shiftOf(pass, expression.X)
		if shift == nil {
			shift = shiftOf(pass, expression.Y)
		}
		if shift == nil || pass.TypesInfo.Types[expression].Value != nil {
			continue
		}
		exponent, bounded := exponentOf(pass, shift.Y)
		name := types.ExprString(exponent)
		if bounded || !named(cursor, name) || compared(pass, cursor, exponent) {
			continue
		}
		pass.Reportf(expression.Pos(), message, name, name, name, name)
	}
	return nil, nil
}

func shiftOf(pass *analysis.Pass, expression ast.Expr) *ast.BinaryExpr {
	shift, ok := ast.Unparen(expression).(*ast.BinaryExpr)
	if !ok || shift.Op != token.SHL || pass.TypesInfo.Types[shift.Y].Value != nil {
		return nil
	}
	one := pass.TypesInfo.Types[shift.X].Value
	if one == nil || constant.Compare(one, token.NEQ, constant.MakeInt64(1)) {
		return nil
	}
	return shift
}

func exponentOf(pass *analysis.Pass, expression ast.Expr) (ast.Expr, bool) {
	call, ok := ast.Unparen(expression).(*ast.CallExpr)
	if !ok || !support.IsBuiltin(pass.TypesInfo, call, "min") || len(call.Args) != 2 {
		return expression, false
	}
	for index, argument := range call.Args {
		value := pass.TypesInfo.Types[argument].Value
		if value != nil && value.Kind() == constant.Int {
			limit, _ := constant.Int64Val(value)
			return call.Args[1-index], limit <= safeBound
		}
	}
	return expression, false
}

func named(cursor inspector.Cursor, exponent string) bool {
	if hint.MatchString(exponent) {
		return true
	}
	function, ok := support.EnclosingDecl(cursor)
	return ok && hint.MatchString(function.Name.Name)
}

func compared(pass *analysis.Pass, cursor inspector.Cursor, exponent ast.Expr) bool {
	function, ok := support.EnclosingFunc(cursor)
	if !ok {
		return false
	}
	text := types.ExprString(exponent)
	found := false
	ast.Inspect(function.Node(), func(node ast.Node) bool {
		binary, isBinary := node.(*ast.BinaryExpr)
		if !isBinary || !comparison[binary.Op] {
			return !found
		}
		left := types.ExprString(ast.Unparen(binary.X))
		right := types.ExprString(ast.Unparen(binary.Y))
		found = found || left == text || right == text
		return !found
	})
	return found
}
