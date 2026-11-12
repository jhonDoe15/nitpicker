package main

import (
	"go/ast"
	"go/token"
	"path"
)

type typeKey struct {
	directory string
	name      string
}

func fieldCount(fields *ast.FieldList) int {
	if fields == nil {
		return 0
	}
	count := 0
	for _, field := range fields.List {
		count += max(1, len(field.Names))
	}
	return count
}

func methodCounts(files []parsedFile) map[typeKey]int {
	counts := map[typeKey]int{}
	for _, file := range files {
		if file.test {
			continue
		}
		for _, declaration := range file.syntax.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok {
				continue
			}
			if receiver := receiverName(function); receiver != "" {
				counts[typeKey{path.Dir(file.path), receiver}]++
			}
		}
	}
	return counts
}

func typeEntries(fileSet *token.FileSet, files []parsedFile) []Type {
	methods := methodCounts(files)
	entries := []Type{}
	for _, file := range files {
		if file.test {
			continue
		}
		for _, declaration := range file.syntax.Decls {
			general, ok := declaration.(*ast.GenDecl)
			if !ok || general.Tok != token.TYPE {
				continue
			}
			for _, spec := range general.Specs {
				entries = append(entries, typeEntry(fileSet, file.path, spec.(*ast.TypeSpec), methods))
			}
		}
	}
	return entries
}

func typeEntry(fileSet *token.FileSet, file string, spec *ast.TypeSpec, methods map[typeKey]int) Type {
	entry := Type{
		File:    file,
		Name:    spec.Name.Name,
		Kind:    "type",
		Start:   fileSet.Position(spec.Pos()).Line,
		End:     fileSet.Position(spec.End()).Line,
		Methods: methods[typeKey{path.Dir(file), spec.Name.Name}],
	}
	switch typed := spec.Type.(type) {
	case *ast.StructType:
		entry.Kind = "struct"
		entry.Fields = fieldCount(typed.Fields)
	case *ast.InterfaceType:
		entry.Kind = "interface"
		entry.Methods = fieldCount(typed.Methods)
	}
	return entry
}
