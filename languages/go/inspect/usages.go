package main

import (
	"go/ast"
	"go/token"
	"sort"
	"strconv"
)

type Usage struct {
	File      string     `json:"file"`
	Imports   []Import   `json:"imports"`
	Names     []string   `json:"names"`
	Selectors []Selector `json:"selectors"`
	Local     []string   `json:"local"`
}

type Import struct {
	Path string `json:"path"`
	Name string `json:"name"`
	Line int    `json:"line"`
}

type Selector struct {
	Qualifier string `json:"qualifier"`
	Name      string `json:"name"`
}

func fileImports(fileSet *token.FileSet, syntax *ast.File) []Import {
	imports := []Import{}
	for _, spec := range syntax.Imports {
		path, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		name := ""
		if spec.Name != nil {
			name = spec.Name.Name
		}
		imports = append(imports, Import{Path: path, Name: name, Line: fileSet.Position(spec.Pos()).Line})
	}
	return imports
}

func skippedIdentifiers(syntax *ast.File) map[*ast.Ident]bool {
	skipped := map[*ast.Ident]bool{syntax.Name: true}
	ast.Inspect(syntax, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.ImportSpec:
			return false
		case *ast.FuncDecl:
			skipped[typed.Name] = true
		case *ast.SelectorExpr:
			skipped[typed.Sel] = true
		case *ast.LabeledStmt:
			skipped[typed.Label] = true
		case *ast.BranchStmt:
			if typed.Label != nil {
				skipped[typed.Label] = true
			}
		}
		return true
	})
	return skipped
}

type usageSets struct {
	names     map[string]bool
	selectors map[Selector]bool
	local     map[string]bool
}

func (sets usageSets) identifier(scope *ast.Scope, identifier *ast.Ident) {
	if identifier.Obj == nil {
		sets.names[identifier.Name] = true
		return
	}
	if scope.Objects[identifier.Name] == identifier.Obj && identifier.Obj.Pos() != identifier.Pos() {
		sets.local[identifier.Name] = true
	}
}

func sortedKeys(set map[string]bool) []string {
	keys := make([]string, 0, len(set))
	for key := range set {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func sortedSelectors(set map[Selector]bool) []Selector {
	selectors := make([]Selector, 0, len(set))
	for selector := range set {
		selectors = append(selectors, selector)
	}
	sort.Slice(selectors, func(left, right int) bool {
		if selectors[left].Qualifier != selectors[right].Qualifier {
			return selectors[left].Qualifier < selectors[right].Qualifier
		}
		return selectors[left].Name < selectors[right].Name
	})
	return selectors
}

func fileUsage(fileSet *token.FileSet, file parsedFile) Usage {
	skipped := skippedIdentifiers(file.syntax)
	sets := usageSets{names: map[string]bool{}, selectors: map[Selector]bool{}, local: map[string]bool{}}
	ast.Inspect(file.syntax, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.ImportSpec:
			return false
		case *ast.SelectorExpr:
			if qualifier, ok := typed.X.(*ast.Ident); ok && qualifier.Obj == nil {
				sets.selectors[Selector{Qualifier: qualifier.Name, Name: typed.Sel.Name}] = true
			}
		case *ast.Ident:
			if !skipped[typed] {
				sets.identifier(file.syntax.Scope, typed)
			}
		}
		return true
	})
	return Usage{
		File:      file.path,
		Imports:   fileImports(fileSet, file.syntax),
		Names:     sortedKeys(sets.names),
		Selectors: sortedSelectors(sets.selectors),
		Local:     sortedKeys(sets.local),
	}
}
