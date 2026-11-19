package nilbranch

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "nil_branch_fall_through",
	Doc:      "reports a nil branch that does not leave and is followed by a use of the same value",
	Requires: support.Requires,
	Run:      run,
}

const message = "The nil branch handles `%s` and then falls through to `%s`, which uses `%s`; add `return` " +
	"(or an `else`) so the nil case is handled once."

func run(pass *analysis.Pass) (any, error) {
	held := receivers(pass)
	for cursor := range support.Root(pass).Preorder((*ast.BlockStmt)(nil)) {
		block := cursor.Node().(*ast.BlockStmt)
		if support.InTestFile(pass, block) {
			continue
		}
		checkBlock(pass, block.List, held)
	}
	return nil, nil
}

func checkBlock(pass *analysis.Pass, statements []ast.Stmt, held map[types.Object]bool) {
	for index, statement := range statements {
		branch, ok := statement.(*ast.IfStmt)
		if !ok || branch.Else != nil || branch.Init != nil {
			continue
		}
		subject := nilSubject(branch.Cond)
		if subject == nil || leaves(pass, branch.Body, subject) || !acts(branch.Body) {
			continue
		}
		if initialises(branch.Body) && isShared(pass, subject, held) {
			continue
		}
		if use := usesAfter(pass, statements[index+1:], subject); use != nil {
			name := types.ExprString(subject)
			pass.Reportf(branch.If, message, name, shown(use), name)
		}
	}
}

const maxShown = 40

func shown(node ast.Node) string {
	text := strings.Join(strings.Fields(types.ExprString(node.(ast.Expr))), " ")
	if len(text) > maxShown {
		return text[:maxShown] + "..."
	}
	return text
}

func nilSubject(condition ast.Expr) ast.Expr {
	comparison, ok := ast.Unparen(condition).(*ast.BinaryExpr)
	if !ok || comparison.Op != token.EQL {
		return nil
	}
	switch {
	case isNil(comparison.Y):
		return nameOf(comparison.X)
	case isNil(comparison.X):
		return nameOf(comparison.Y)
	}
	return nil
}

func isNil(expr ast.Expr) bool {
	identifier, ok := expr.(*ast.Ident)
	return ok && identifier.Name == "nil"
}

func nameOf(expr ast.Expr) ast.Expr {
	switch node := expr.(type) {
	case *ast.Ident:
		return node
	case *ast.SelectorExpr:
		if nameOf(node.X) != nil {
			return node
		}
	}
	return nil
}

func same(pass *analysis.Pass, left, right ast.Expr) bool {
	if types.ExprString(left) != types.ExprString(right) {
		return false
	}
	first, second := rootOf(left), rootOf(right)
	if first == nil || second == nil {
		return false
	}
	return pass.TypesInfo.ObjectOf(first) == pass.TypesInfo.ObjectOf(second)
}

func rootOf(expr ast.Expr) *ast.Ident {
	for {
		switch node := expr.(type) {
		case *ast.Ident:
			return node
		case *ast.SelectorExpr:
			expr = node.X
		default:
			return nil
		}
	}
}
