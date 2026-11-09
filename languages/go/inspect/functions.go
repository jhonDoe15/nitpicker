package main

import (
	"fmt"
	"go/ast"
	"go/token"
	"strconv"
	"strings"
)

var testPrefixes = []string{"Test", "Benchmark", "Fuzz", "Example"}

func receiverName(declaration *ast.FuncDecl) string {
	if declaration.Recv == nil || len(declaration.Recv.List) == 0 {
		return ""
	}
	return baseTypeName(declaration.Recv.List[0].Type)
}

func baseTypeName(expression ast.Expr) string {
	switch typed := expression.(type) {
	case *ast.StarExpr:
		return baseTypeName(typed.X)
	case *ast.IndexExpr:
		return baseTypeName(typed.X)
	case *ast.IndexListExpr:
		return baseTypeName(typed.X)
	case *ast.ParenExpr:
		return baseTypeName(typed.X)
	case *ast.Ident:
		return typed.Name
	}
	return ""
}

func isTestFunction(declaration *ast.FuncDecl) bool {
	if declaration.Recv != nil {
		return false
	}
	for _, prefix := range testPrefixes {
		rest, found := strings.CutPrefix(declaration.Name.Name, prefix)
		if found && (rest == "" || !isLowerStart(rest)) {
			return true
		}
	}
	return false
}

func isLowerStart(text string) bool {
	return text[0] >= 'a' && text[0] <= 'z'
}

func addFunctions(report *Report, fileSet *token.FileSet, files []parsedFile) {
	for _, file := range files {
		for _, declaration := range file.syntax.Decls {
			switch typed := declaration.(type) {
			case *ast.FuncDecl:
				addDeclaration(report, fileSet, file, typed)
			case *ast.GenDecl:
				if !file.test && typed.Tok == token.VAR {
					report.Functions = append(report.Functions, variableLiterals(fileSet, file.path, typed)...)
				}
			}
		}
	}
}

func addDeclaration(report *Report, fileSet *token.FileSet, file parsedFile, function *ast.FuncDecl) {
	if function.Body == nil {
		return
	}
	name := function.Name.Name
	if receiver := receiverName(function); receiver != "" {
		name = receiver + "." + name
	}
	entries := measureUnit(fileSet, file.path, name, function.Type, function.Body, function.Pos())
	if !file.test {
		report.Functions = append(report.Functions, entries...)
	} else if isTestFunction(function) {
		report.Tests = append(report.Tests, Test{Function: entries[0], ShortSkip: skipsWhenShort(file.syntax, function)})
	}
}

func variableLiterals(fileSet *token.FileSet, path string, declaration *ast.GenDecl) []Function {
	var entries []Function
	for _, spec := range declaration.Specs {
		values, ok := spec.(*ast.ValueSpec)
		if !ok {
			continue
		}
		for index, value := range values.Values {
			name := "_"
			if index < len(values.Names) {
				name = values.Names[index].Name
			}
			entries = append(entries, valueLiterals(fileSet, path, name, value)...)
		}
	}
	return entries
}

func valueLiterals(fileSet *token.FileSet, path, name string, value ast.Expr) []Function {
	walker := newBodyWalker()
	walker.expressions(value)
	var entries []Function
	for index, literal := range walker.literals {
		literalName := name
		if ast.Expr(literal) != value {
			literalName = fmt.Sprintf("%s.func%d", name, index+1)
		}
		entries = append(entries, measureUnit(fileSet, path, literalName, literal.Type, literal.Body, literal.Pos())...)
	}
	return entries
}

func measureUnit(fileSet *token.FileSet, path, name string, signature *ast.FuncType, body *ast.BlockStmt, start token.Pos) []Function {
	walker := newBodyWalker()
	walker.block(body.List, 0)
	entry := Function{
		File:              path,
		Name:              name,
		Start:             fileSet.Position(start).Line,
		End:               fileSet.Position(body.Rbrace).Line,
		Statements:        walker.statements,
		MaxControlNesting: walker.deepest,
		Parameters:        parameterCount(signature),
		Complexity:        walker.complexity,
		Body:              position(fileSet, body.Lbrace),
		Close:             position(fileSet, body.Rbrace),
	}
	for _, decision := range walker.decisions {
		if remapped(fileSet, decision.Pos()) {
			continue
		}
		branch := decisionBranch(fileSet, decision)
		branch.File = path
		branch.Function = name
		entry.Branches = append(entry.Branches, branch)
	}
	entry.Lines = entry.End - entry.Start + 1
	entries := []Function{entry}
	for index, literal := range walker.literals {
		literalName := fmt.Sprintf("%s.func%d", name, index+1)
		entries = append(entries, measureUnit(fileSet, path, literalName, literal.Type, literal.Body, literal.Pos())...)
	}
	return entries
}

func parameterCount(signature *ast.FuncType) int {
	count := 0
	for _, field := range signature.Params.List {
		count += max(1, len(field.Names))
	}
	return count
}

func remapped(fileSet *token.FileSet, pos token.Pos) bool {
	adjusted := fileSet.PositionFor(pos, true)
	raw := fileSet.PositionFor(pos, false)
	return adjusted.Filename != raw.Filename || adjusted.Line != raw.Line
}

var setupCalls = map[string]bool{"Parallel": true, "Helper": true}

var skipCalls = map[string]bool{"Skip": true, "Skipf": true, "SkipNow": true}

var logCalls = map[string]bool{"Log": true, "Logf": true}

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
	if impliedByShort(guard.Cond, testing) {
		return onlySkips(guard.Body.List, runner)
	}
	negated, ok := ast.Unparen(guard.Cond).(*ast.UnaryExpr)
	return ok && negated.Op == token.NOT && isShortCall(negated.X, testing) &&
		len(body) == 1 && len(guard.Body.List) > 0 && skippingElse(guard.Else, runner)
}

func impliedByShort(condition ast.Expr, testing string) bool {
	binary, ok := ast.Unparen(condition).(*ast.BinaryExpr)
	if ok && binary.Op == token.LOR {
		return impliedByShort(binary.X, testing) || impliedByShort(binary.Y, testing)
	}
	return isShortCall(condition, testing)
}

func skippingElse(branch ast.Stmt, runner string) bool {
	if branch == nil {
		return true
	}
	block, ok := branch.(*ast.BlockStmt)
	return ok && onlySkips(block.List, runner)
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

func onlySkips(statements []ast.Stmt, runner string) bool {
	if len(statements) == 0 {
		return false
	}
	for _, statement := range statements[:len(statements)-1] {
		if !isRunnerCall(statement, runner, logCalls) {
			return false
		}
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
