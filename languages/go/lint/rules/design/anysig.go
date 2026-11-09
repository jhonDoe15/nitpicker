package design

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var anyAnalyzer = &analysis.Analyzer{
	Name:     "any_in_exported_signature",
	Doc:      "reports any in an exported signature where a type or a type parameter fits",
	Requires: support.Requires,
	Run:      runAny,
}

const (
	anyResultMessage = "an exported function returns `any`, so every caller has to assert its type: " +
		"return the concrete type, or a type parameter"
	anyParameterMessage = "this `any` parameter is asserted to a fixed set of types: take the concrete type, " +
		"a type parameter with a constraint, or one function per type"
)

func runAny(pass *analysis.Pass) (any, error) {
	foreign := support.ImportedInterfaceMethods(pass.Pkg)
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) {
			continue
		}
		for _, decl := range file.Decls {
			function, ok := decl.(*ast.FuncDecl)
			if !ok || !exportedAPI(function) || implementsForeign(pass, foreign, function) {
				continue
			}
			checkResults(pass, function)
			checkParameters(pass, function)
		}
	}
	return nil, nil
}

func exportedAPI(function *ast.FuncDecl) bool {
	if !function.Name.IsExported() {
		return false
	}
	if function.Recv == nil || len(function.Recv.List) == 0 {
		return true
	}
	receiver := function.Recv.List[0].Type
	for {
		switch node := receiver.(type) {
		case *ast.StarExpr:
			receiver = node.X
		case *ast.IndexExpr:
			receiver = node.X
		case *ast.IndexListExpr:
			receiver = node.X
		case *ast.Ident:
			return node.IsExported()
		default:
			return false
		}
	}
}

func implementsForeign(pass *analysis.Pass, foreign support.ForeignMethods, function *ast.FuncDecl) bool {
	method, ok := pass.TypesInfo.Defs[function.Name].(*types.Func)
	return ok && function.Recv != nil && foreign.Implements(method)
}

func emptyInterface(typ types.Type) bool {
	face, ok := types.Unalias(typ).(*types.Interface)
	return ok && face.Empty()
}

func checkResults(pass *analysis.Pass, function *ast.FuncDecl) {
	if function.Type.Results == nil {
		return
	}
	for _, field := range function.Type.Results.List {
		if emptyInterface(pass.TypesInfo.TypeOf(field.Type)) {
			pass.Reportf(field.Type.Pos(), "%s", anyResultMessage)
		}
	}
}

func checkParameters(pass *analysis.Pass, function *ast.FuncDecl) {
	if function.Body == nil {
		return
	}
	asserted := assertedObjects(pass.TypesInfo, function.Body)
	for _, field := range function.Type.Params.List {
		if _, variadic := field.Type.(*ast.Ellipsis); variadic || !emptyInterface(pass.TypesInfo.TypeOf(field.Type)) {
			continue
		}
		for _, name := range field.Names {
			if asserted[pass.TypesInfo.Defs[name]] {
				pass.Reportf(name.Pos(), "%s", anyParameterMessage)
			}
		}
	}
}

func assertedObjects(info *types.Info, body *ast.BlockStmt) map[types.Object]bool {
	asserted := map[types.Object]bool{}
	ast.Inspect(body, func(node ast.Node) bool {
		switch statement := node.(type) {
		case *ast.TypeAssertExpr:
			if statement.Type != nil && concrete(info, statement.Type) {
				asserted[assertedObject(info, statement)] = true
			}
		case *ast.TypeSwitchStmt:
			if assertion := switchAssertion(statement); assertion != nil && concreteCase(info, statement) {
				asserted[assertedObject(info, assertion)] = true
			}
		}
		return true
	})
	return asserted
}

func assertedObject(info *types.Info, assertion *ast.TypeAssertExpr) types.Object {
	if ident, ok := ast.Unparen(assertion.X).(*ast.Ident); ok {
		return info.Uses[ident]
	}
	return nil
}

func switchAssertion(statement *ast.TypeSwitchStmt) *ast.TypeAssertExpr {
	var expression ast.Expr
	switch assign := statement.Assign.(type) {
	case *ast.ExprStmt:
		expression = assign.X
	case *ast.AssignStmt:
		expression = assign.Rhs[0]
	}
	assertion, _ := ast.Unparen(expression).(*ast.TypeAssertExpr)
	return assertion
}

func concreteCase(info *types.Info, statement *ast.TypeSwitchStmt) bool {
	for _, clause := range statement.Body.List {
		for _, typ := range clause.(*ast.CaseClause).List {
			if concrete(info, typ) {
				return true
			}
		}
	}
	return false
}

func concrete(info *types.Info, expression ast.Expr) bool {
	typ := info.TypeOf(expression)
	return typ != nil && !types.IsInterface(typ) && typ != types.Typ[types.UntypedNil]
}
