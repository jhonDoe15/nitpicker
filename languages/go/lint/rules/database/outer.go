package database

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
	"golang.org/x/tools/go/types/typeutil"
)

var outerAnalyzer = &analysis.Analyzer{
	Name:     "write_outside_transaction",
	Doc:      "reports a database write through the outer handle inside a function that has an open transaction",
	Requires: support.Requires,
	Run:      runOuter,
}

const outerMessage = "this write goes through the outer handle while `%s` is open, so it runs outside the " +
	"transaction and is not rolled back with it: run it through `%s`. An exception fits only when the write must " +
	"survive a rollback (an audit row)"

func runOuter(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		found, ok := writeOf(pass.TypesInfo, cursor.Node().(*ast.CallExpr))
		if !ok || found.tx || support.InTestFile(pass, cursor.Node()) {
			continue
		}
		if name := openTransaction(pass.TypesInfo, cursor, found); name != "" {
			pass.Reportf(found.call.Pos(), outerMessage, name, name)
		}
	}
	return nil, nil
}

func openTransaction(info *types.Info, cursor inspector.Cursor, found write) string {
	for each := range cursor.Enclosing((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		if found.gorm {
			if name := callbackParameter(info, each, found); name != "" {
				return name
			}
			continue
		}
		if name := openVariable(info, each.Node(), found.call.Pos()); name != "" {
			return name
		}
	}
	return ""
}

func openVariable(info *types.Info, function ast.Node, at token.Pos) string {
	name := ""
	ast.Inspect(function, func(node ast.Node) bool {
		ident, ok := node.(*ast.Ident)
		if !ok || name != "" || ident.Pos() >= at {
			return name == ""
		}
		object := info.Defs[ident]
		if object != nil && isTx(object.Type()) && encloses(object, at) && !closedBefore(info, function, object, at) {
			name = ident.Name
		}
		return name == ""
	})
	return name
}

func encloses(object types.Object, at token.Pos) bool {
	scope := object.Parent()
	return scope != nil && scope.Pos() <= at && at < scope.End()
}

func closedBefore(info *types.Info, function ast.Node, variable types.Object, at token.Pos) bool {
	body := functionBody(function)
	for _, statement := range body.List {
		if statement.Pos() >= at {
			return false
		}
		if commits(info, statement, variable) {
			return true
		}
	}
	return false
}

func functionBody(function ast.Node) *ast.BlockStmt {
	if declaration, ok := function.(*ast.FuncDecl); ok {
		return declaration.Body
	}
	return function.(*ast.FuncLit).Body
}

func commits(info *types.Info, statement ast.Stmt, variable types.Object) bool {
	found := false
	ast.Inspect(statement, func(node ast.Node) bool {
		switch node.(type) {
		case *ast.DeferStmt, *ast.FuncLit:
			return false
		}
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return !found
		}
		selector, isSelector := ast.Unparen(call.Fun).(*ast.SelectorExpr)
		if isSelector && (selector.Sel.Name == "Commit" || selector.Sel.Name == "Rollback") {
			receiver, isIdent := ast.Unparen(selector.X).(*ast.Ident)
			found = found || isIdent && info.Uses[receiver] == variable
		}
		return !found
	})
	return found
}

func callbackParameter(info *types.Info, function inspector.Cursor, found write) string {
	literal, isLiteral := function.Node().(*ast.FuncLit)
	call, isCall := function.Parent().Node().(*ast.CallExpr)
	if !isLiteral || !isCall || !isGormTransaction(info, call) || found.root == nil {
		return ""
	}
	parameters := literal.Type.Params.List
	if len(parameters) == 0 || len(parameters[0].Names) == 0 {
		return ""
	}
	root := rootIdent(found.root)
	if root == nil {
		return ""
	}
	object := info.Uses[root]
	if object == nil || (object.Pos() >= literal.Pos() && object.Pos() < literal.End()) {
		return ""
	}
	return parameters[0].Names[0].Name
}

func isGormTransaction(info *types.Info, call *ast.CallExpr) bool {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	return ok && callee.Pkg() != nil && inPackage(callee.Pkg().Path(), "gorm.io/gorm") && callee.Name() == "Transaction"
}

func rootIdent(expression ast.Expr) *ast.Ident {
	for {
		switch node := ast.Unparen(expression).(type) {
		case *ast.Ident:
			return node
		case *ast.SelectorExpr:
			expression = node.X
		default:
			return nil
		}
	}
}
