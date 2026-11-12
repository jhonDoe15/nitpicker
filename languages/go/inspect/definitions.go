package main

import (
	"go/ast"
	"go/scanner"
	"go/token"
	"strings"
)

type Definition struct {
	File     string   `json:"file"`
	Name     string   `json:"name"`
	Kind     string   `json:"kind"`
	Line     int      `json:"line"`
	Lines    int      `json:"lines"`
	Exported bool     `json:"exported"`
	Entry    bool     `json:"entry"`
	Literal  bool     `json:"literal"`
	Tokens   []string `json:"tokens"`
}

var entryDirectives = []string{"//export ", "//go:linkname "}

func hasEntryDirective(groups ...*ast.CommentGroup) bool {
	for _, group := range groups {
		if group == nil {
			continue
		}
		for _, comment := range group.List {
			for _, directive := range entryDirectives {
				if strings.HasPrefix(comment.Text, directive) {
					return true
				}
			}
		}
	}
	return false
}

func sourceTokens(fileSet *token.FileSet, file parsedFile, from, to token.Pos) []string {
	handle := fileSet.File(from)
	start, end := handle.Offset(from), handle.Offset(to)
	source := file.source[start:end]
	var reader scanner.Scanner
	reader.Init(fileSet.AddFile("", -1, len(source)), source, nil, 0)
	tokens := []string{}
	for {
		_, kind, literal := reader.Scan()
		if kind == token.EOF {
			return tokens
		}
		if kind == token.SEMICOLON && literal == "\n" {
			continue
		}
		if literal == "" {
			literal = kind.String()
		}
		tokens = append(tokens, literal)
	}
}

func newDefinition(fileSet *token.FileSet, file parsedFile, name *ast.Ident, node ast.Node) Definition {
	start := fileSet.Position(node.Pos()).Line
	return Definition{
		File:     file.path,
		Name:     name.Name,
		Line:     fileSet.Position(name.Pos()).Line,
		Lines:    fileSet.Position(node.End()).Line - start + 1,
		Exported: ast.IsExported(name.Name),
		Tokens:   sourceTokens(fileSet, file, node.Pos(), node.End()),
	}
}

func functionDefinition(fileSet *token.FileSet, file parsedFile, function *ast.FuncDecl) []Definition {
	if function.Recv != nil || function.Name.Name == "_" {
		return nil
	}
	definition := newDefinition(fileSet, file, function.Name, function)
	definition.Kind = "function"
	name := function.Name.Name
	definition.Entry = name == "init" || (name == "main" && file.syntax.Name.Name == "main") ||
		hasEntryDirective(function.Doc)
	return []Definition{definition}
}

func typeKind(spec *ast.TypeSpec) string {
	if _, ok := spec.Type.(*ast.InterfaceType); ok {
		return "interface"
	}
	return "type"
}

func isLiteral(expression ast.Expr) bool {
	switch typed := expression.(type) {
	case *ast.BasicLit:
		return true
	case *ast.UnaryExpr:
		return isLiteral(typed.X)
	case *ast.ParenExpr:
		return isLiteral(typed.X)
	}
	return false
}

func valueDefinitions(fileSet *token.FileSet, file parsedFile, declaration *ast.GenDecl, spec *ast.ValueSpec) []Definition {
	definitions := []Definition{}
	literal := declaration.Tok == token.CONST && len(spec.Values) > 0
	for _, value := range spec.Values {
		literal = literal && isLiteral(value)
	}
	for _, name := range spec.Names {
		if name.Name == "_" {
			continue
		}
		definition := newDefinition(fileSet, file, name, spec)
		definition.Kind = "const"
		definition.Literal = literal
		definition.Entry = hasEntryDirective(declaration.Doc, spec.Doc)
		definitions = append(definitions, definition)
	}
	return definitions
}

func generalDefinitions(fileSet *token.FileSet, file parsedFile, declaration *ast.GenDecl) []Definition {
	definitions := []Definition{}
	for _, spec := range declaration.Specs {
		switch typed := spec.(type) {
		case *ast.TypeSpec:
			if typed.Name.Name == "_" {
				continue
			}
			definition := newDefinition(fileSet, file, typed.Name, typed)
			definition.Kind = typeKind(typed)
			definitions = append(definitions, definition)
		case *ast.ValueSpec:
			definitions = append(definitions, valueDefinitions(fileSet, file, declaration, typed)...)
		}
	}
	return definitions
}

func fileDefinitions(fileSet *token.FileSet, file parsedFile) []Definition {
	definitions := []Definition{}
	for _, declaration := range file.syntax.Decls {
		switch typed := declaration.(type) {
		case *ast.FuncDecl:
			definitions = append(definitions, functionDefinition(fileSet, file, typed)...)
		case *ast.GenDecl:
			definitions = append(definitions, generalDefinitions(fileSet, file, typed)...)
		}
	}
	return definitions
}
