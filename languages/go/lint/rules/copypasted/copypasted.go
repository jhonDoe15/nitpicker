package copypasted

import (
	"fmt"
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

const minCopies = 3

var Analyzer = &analysis.Analyzer{
	Name:     "copy_pasted_tests",
	Doc:      "reports a test that repeats the body of others and differs only in its literals",
	Requires: support.Requires,
	Run:      run,
}

const message = "this test repeats the body of %d others and differs only in its literals: put the cases in one " +
	"table and run a `t.Run` subtest per row (`for _, tc := range []struct{ name string; ... }{...} { " +
	"t.Run(tc.name, func(t *testing.T) { ... }) }`); a test whose copies differ in a call is not a copy"

type copyCase struct {
	position token.Pos
	shape    string
}

func run(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if !support.InTestFile(pass, file) || ast.IsGenerated(file) {
			continue
		}
		reportGroup(pass, topLevelTests(pass, file))
		ast.Inspect(file, func(node ast.Node) bool {
			if block, ok := node.(*ast.BlockStmt); ok {
				reportGroup(pass, subtests(pass, block.List))
			}
			return true
		})
	}
	return nil, nil
}

func reportGroup(pass *analysis.Pass, cases []copyCase) {
	groups := map[string][]copyCase{}
	for _, found := range cases {
		groups[found.shape] = append(groups[found.shape], found)
	}
	for _, group := range groups {
		for _, found := range group[min(minCopies-1, len(group)):] {
			pass.Reportf(found.position, message, len(group)-1)
		}
	}
}

func topLevelTests(pass *analysis.Pass, file *ast.File) []copyCase {
	cases := []copyCase{}
	for _, declaration := range file.Decls {
		function, ok := declaration.(*ast.FuncDecl)
		if ok && function.Body != nil && isTest(function) {
			receiver := ""
			if function.Recv != nil {
				receiver = types.ExprString(function.Recv.List[0].Type)
			}
			cases = append(cases, copyCase{function.Name.Pos(), receiver + "|" + shapeOf(pass.TypesInfo, function.Body)})
		}
	}
	return cases
}

func isTest(function *ast.FuncDecl) bool {
	parameters := function.Type.Params.List
	return strings.HasPrefix(function.Name.Name, "Test") && len(parameters) == 1 &&
		types.ExprString(parameters[0].Type) == "*testing.T"
}

func subtests(pass *analysis.Pass, statements []ast.Stmt) []copyCase {
	cases := []copyCase{}
	for _, statement := range statements {
		expression, ok := statement.(*ast.ExprStmt)
		if !ok {
			continue
		}
		call, ok := expression.X.(*ast.CallExpr)
		if !ok || len(call.Args) != 2 || !isRun(call) {
			continue
		}
		if body, ok := call.Args[1].(*ast.FuncLit); ok {
			cases = append(cases, copyCase{call.Pos(), shapeOf(pass.TypesInfo, body.Body)})
		}
	}
	return cases
}

func isRun(call *ast.CallExpr) bool {
	selector, ok := call.Fun.(*ast.SelectorExpr)
	return ok && selector.Sel.Name == "Run"
}

func shapeOf(info *types.Info, body *ast.BlockStmt) string {
	var shape strings.Builder
	ast.Inspect(body, func(node ast.Node) bool {
		if node == nil {
			return true
		}
		shape.WriteString(describe(info, node))
		return !isSignedLiteral(node)
	})
	return shape.String()
}

func describe(info *types.Info, node ast.Node) string {
	switch typed := node.(type) {
	case *ast.BasicLit:
		return "<literal>;"
	case *ast.UnaryExpr:
		if isSignedLiteral(node) {
			return "<literal>;"
		}
		return fmt.Sprintf("unary%s;", typed.Op)
	case *ast.Ident:
		if isUniverseConstant(info, typed) {
			return "<literal>;"
		}
		return typed.Name + ";"
	case *ast.BinaryExpr:
		return fmt.Sprintf("binary%s;", typed.Op)
	case *ast.AssignStmt:
		return fmt.Sprintf("assign%s;", typed.Tok)
	case *ast.IncDecStmt:
		return fmt.Sprintf("incdec%s;", typed.Tok)
	case *ast.BranchStmt:
		return fmt.Sprintf("branch%s;", typed.Tok)
	case *ast.RangeStmt:
		return fmt.Sprintf("range%s;", typed.Tok)
	}
	return fmt.Sprintf("%T;", node)
}

func isSignedLiteral(node ast.Node) bool {
	unary, ok := node.(*ast.UnaryExpr)
	if !ok || (unary.Op != token.SUB && unary.Op != token.ADD) {
		return false
	}
	_, literal := unary.X.(*ast.BasicLit)
	return literal
}

func isUniverseConstant(info *types.Info, ident *ast.Ident) bool {
	switch info.Uses[ident].(type) {
	case *types.Nil:
		return true
	case *types.Const:
		return info.Uses[ident].Pkg() == nil
	}
	return false
}
