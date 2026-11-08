package main

import (
	"go/ast"
	"go/token"
	"strconv"
)

type Test struct {
	Function
	ShortSkip bool `json:"shortSkip"`
}

var setupCalls = map[string]bool{"Parallel": true, "Helper": true}

var skipCalls = map[string]bool{"Skip": true, "Skipf": true, "SkipNow": true}

func testingName(file *ast.File) string {
	for _, spec := range file.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil || path != "testing" {
			continue
		}
		if spec.Name == nil {
			return "testing"
		}
		return spec.Name.Name
	}
	return ""
}

func skipsWhenShort(file *ast.File, function *ast.FuncDecl) bool {
	runner := runnerName(function)
	testing := testingName(file)
	if runner == "" || testing == "" || testing == "_" {
		return false
	}
	body := withoutSetup(function.Body.List, runner)
	if len(body) == 0 {
		return false
	}
	guard, ok := body[0].(*ast.IfStmt)
	if !ok || guard.Init != nil {
		return false
	}
	if isShortCall(guard.Cond, testing) {
		return endsInSkip(guard.Body.List, runner)
	}
	negated, ok := guard.Cond.(*ast.UnaryExpr)
	return ok && negated.Op == token.NOT && isShortCall(negated.X, testing) &&
		len(body) == 1 && guard.Else == nil && len(guard.Body.List) > 0
}

func runnerName(function *ast.FuncDecl) string {
	parameters := function.Type.Params.List
	if len(parameters) == 0 || len(parameters[0].Names) == 0 {
		return ""
	}
	return parameters[0].Names[0].Name
}

func withoutSetup(statements []ast.Stmt, runner string) []ast.Stmt {
	for index, statement := range statements {
		if !isRunnerCall(statement, runner, setupCalls) {
			return statements[index:]
		}
	}
	return nil
}

func isShortCall(expression ast.Expr, testing string) bool {
	call, ok := ast.Unparen(expression).(*ast.CallExpr)
	if !ok || len(call.Args) != 0 {
		return false
	}
	if testing == "." {
		name, ok := call.Fun.(*ast.Ident)
		return ok && name.Name == "Short"
	}
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Short" {
		return false
	}
	owner, ok := selector.X.(*ast.Ident)
	return ok && owner.Name == testing
}

func endsInSkip(statements []ast.Stmt, runner string) bool {
	if len(statements) == 0 {
		return false
	}
	last := statements[len(statements)-1]
	_, returns := last.(*ast.ReturnStmt)
	return returns || isRunnerCall(last, runner, skipCalls)
}

func isRunnerCall(statement ast.Stmt, runner string, methods map[string]bool) bool {
	expression, ok := statement.(*ast.ExprStmt)
	if !ok {
		return false
	}
	call, ok := expression.X.(*ast.CallExpr)
	if !ok {
		return false
	}
	selector, ok := call.Fun.(*ast.SelectorExpr)
	if !ok || !methods[selector.Sel.Name] {
		return false
	}
	owner, ok := selector.X.(*ast.Ident)
	return ok && owner.Name == runner
}
