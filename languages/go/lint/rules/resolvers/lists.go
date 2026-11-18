package resolvers

import (
	"go/types"
	"strings"

	"golang.org/x/tools/go/analysis"
)

func listParents(pass *analysis.Pass) map[types.Type]bool {
	lists := map[types.Type]bool{}
	scopes := []*types.Scope{pass.Pkg.Scope()}
	for _, imported := range pass.Pkg.Imports() {
		if !strings.Contains(imported.Path(), "gqlgen") {
			scopes = append(scopes, imported.Scope())
		}
	}
	for _, scope := range scopes {
		for _, name := range scope.Names() {
			object, isType := scope.Lookup(name).(*types.TypeName)
			if !isType {
				continue
			}
			collect(object, lists)
		}
	}
	return lists
}

func collect(object *types.TypeName, lists map[types.Type]bool) {
	typ, ok := object.Type().(*types.Named)
	if !ok {
		return
	}
	if structure, isStruct := typ.Underlying().(*types.Struct); isStruct {
		for index := range structure.NumFields() {
			noteList(structure.Field(index).Type(), lists)
		}
	}
	for index := range typ.NumMethods() {
		results := typ.Method(index).Signature().Results()
		for position := range results.Len() {
			noteList(results.At(position).Type(), lists)
		}
	}
}

func noteList(typ types.Type, lists map[types.Type]bool) {
	slice, isSlice := types.Unalias(typ).(*types.Slice)
	if !isSlice {
		return
	}
	if item := named(slice.Elem()); item != nil {
		lists[item] = true
	}
}
