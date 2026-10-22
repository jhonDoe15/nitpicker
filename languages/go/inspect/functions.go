package main

import (
	"fmt"
	"go/ast"
	"go/token"
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
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Body == nil {
				continue
			}
			name := function.Name.Name
			if receiver := receiverName(function); receiver != "" {
				name = receiver + "." + name
			}
			entries := measureUnit(fileSet, file.path, name, function.Type, function.Body, function.Pos())
			if file.test {
				if isTestFunction(function) {
					report.Tests = append(report.Tests, entries[0])
				}
				continue
			}
			report.Functions = append(report.Functions, entries...)
		}
	}
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
