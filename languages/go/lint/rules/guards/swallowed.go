package guards

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
	"golang.org/x/tools/go/types/typeutil"
)

var swallowedAnalyzer = &analysis.Analyzer{
	Name:     "swallowed_error",
	Doc:      "reports an error check whose body only logs, continues or returns constants",
	Requires: support.Requires,
	Run:      runSwallowed,
}

const swallowedMessage = "the error is only logged or dropped here and the code carries on as if the call worked: " +
	"return it wrapped with `%w`, handle it (retry, or a fallback the caller can tell apart), " +
	"or check for the one error you expect with `errors.Is`"

var errorType = types.Universe.Lookup("error").Type()

func runSwallowed(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.IfStmt)(nil)) {
		statement := cursor.Node().(*ast.IfStmt)
		if support.InTestFile(pass, statement) || !checksError(pass.TypesInfo, statement.Cond) ||
			len(statement.Body.List) == 0 {
			continue
		}
		results := enclosingResults(pass.TypesInfo, cursor)
		if returnsError(results) {
			continue
		}
		if allSwallow(pass.TypesInfo, statement.Body.List, results) {
			pass.Reportf(statement.Pos(), "%s", swallowedMessage)
		}
	}
	return nil, nil
}

func checksError(info *types.Info, condition ast.Expr) bool {
	binary, ok := ast.Unparen(condition).(*ast.BinaryExpr)
	if !ok || binary.Op != token.NEQ {
		return false
	}
	left, right := ast.Unparen(binary.X), ast.Unparen(binary.Y)
	if isNil(info, left) {
		left, right = right, left
	}
	switch left.(type) {
	case *ast.Ident, *ast.SelectorExpr:
		return isNil(info, right) && types.Identical(info.TypeOf(left), errorType)
	}
	return false
}

func isNil(info *types.Info, expression ast.Expr) bool {
	ident, ok := expression.(*ast.Ident)
	if !ok {
		return false
	}
	_, isNil := info.Uses[ident].(*types.Nil)
	return isNil
}

func enclosingResults(info *types.Info, cursor inspector.Cursor) *types.Tuple {
	function, found := support.EnclosingFunc(cursor)
	if !found {
		return nil
	}
	var signature *types.Signature
	switch node := function.Node().(type) {
	case *ast.FuncDecl:
		if object, ok := info.Defs[node.Name].(*types.Func); ok {
			signature = object.Signature()
		}
	case *ast.FuncLit:
		signature, _ = info.TypeOf(node).(*types.Signature)
	}
	if signature == nil {
		return types.NewTuple()
	}
	return signature.Results()
}

func returnsError(results *types.Tuple) bool {
	for each := range results.Variables() {
		if types.Implements(each.Type(), errorType.Underlying().(*types.Interface)) {
			return true
		}
	}
	return false
}

func allSwallow(info *types.Info, statements []ast.Stmt, results *types.Tuple) bool {
	for _, statement := range statements {
		if !swallows(info, statement, results) {
			return false
		}
	}
	return true
}

func swallows(info *types.Info, statement ast.Stmt, results *types.Tuple) bool {
	switch each := statement.(type) {
	case *ast.ExprStmt:
		call, ok := ast.Unparen(each.X).(*ast.CallExpr)
		return ok && reportsOnly(info, call)
	case *ast.BranchStmt:
		return each.Tok == token.CONTINUE
	case *ast.AssignStmt:
		return each.Tok == token.ASSIGN && allConstant(info, each.Rhs)
	case *ast.ReturnStmt:
		if len(each.Results) == 0 {
			return results.Len() == 0
		}
		return allConstant(info, each.Results)
	}
	return false
}

func reportsOnly(info *types.Info, call *ast.CallExpr) bool {
	if callee, isLogger := support.LoggerCall(info, call); isLogger {
		return !support.Exits(callee.Name())
	}
	if support.IsBuiltin(info, call, "print") || support.IsBuiltin(info, call, "println") {
		return true
	}
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil || callee.Pkg().Path() != "fmt" {
		return false
	}
	switch callee.Name() {
	case "Print", "Printf", "Println":
		return true
	case "Fprint", "Fprintf", "Fprintln":
		return len(call.Args) > 0 && standardStream(info, call.Args[0])
	}
	return false
}

func standardStream(info *types.Info, writer ast.Expr) bool {
	selector, ok := ast.Unparen(writer).(*ast.SelectorExpr)
	if !ok {
		return false
	}
	variable, isVar := info.Uses[selector.Sel].(*types.Var)
	return isVar && variable.Pkg() != nil && variable.Pkg().Path() == "os" &&
		(variable.Name() == "Stdout" || variable.Name() == "Stderr")
}

func allConstant(info *types.Info, values []ast.Expr) bool {
	for _, value := range values {
		if !constantValue(info, value) {
			return false
		}
	}
	return true
}

func constantValue(info *types.Info, value ast.Expr) bool {
	switch each := ast.Unparen(value).(type) {
	case *ast.BasicLit:
		return true
	case *ast.UnaryExpr:
		return each.Op == token.SUB && constantValue(info, each.X)
	case *ast.CompositeLit:
		return len(each.Elts) == 0
	case *ast.Ident:
		object := info.Uses[each]
		return object != nil && object.Parent() == types.Universe
	}
	return false
}
