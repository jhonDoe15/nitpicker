package design

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var interfaceAnalyzer = &analysis.Analyzer{
	Name:     "lone_interface",
	Doc:      "reports an interface declared beside its only implementation",
	Requires: support.Requires,
	Run:      runInterface,
}

const interfaceMessage = "interface `%s` is returned beside its only implementation, `%s`: return the concrete type " +
	"and declare the interface in the package that consumes it, with only the methods that package calls"

func runInterface(pass *analysis.Pass) (any, error) {
	concrete := concreteTypes(pass)
	returned := returnedTypes(pass)
	for _, name := range pass.Pkg.Scope().Names() {
		object, ok := pass.Pkg.Scope().Lookup(name).(*types.TypeName)
		if !ok || object.IsAlias() || inTestFile(pass, object) {
			continue
		}
		face, isInterface := object.Type().Underlying().(*types.Interface)
		if !isInterface || !returned[object] || !face.IsMethodSet() || face.NumMethods() == 0 || sealed(face) {
			continue
		}
		implementations := implementing(concrete, face)
		if len(implementations) == 1 {
			pass.Reportf(object.Pos(), interfaceMessage, object.Name(), implementations[0].Obj().Name())
		}
	}
	return nil, nil
}

func returnedTypes(pass *analysis.Pass) map[*types.TypeName]bool {
	returned := map[*types.TypeName]bool{}
	for _, file := range pass.Files {
		for _, decl := range file.Decls {
			function, ok := decl.(*ast.FuncDecl)
			if !ok || function.Type.Results == nil || support.InTestFile(pass, function) {
				continue
			}
			for _, result := range function.Type.Results.List {
				if named, isNamed := types.Unalias(pass.TypesInfo.TypeOf(result.Type)).(*types.Named); isNamed {
					returned[named.Obj()] = true
				}
			}
		}
	}
	return returned
}

func inTestFile(pass *analysis.Pass, object types.Object) bool {
	return support.InTestFile(pass, &ast.Ident{NamePos: object.Pos()})
}

func sealed(face *types.Interface) bool {
	for method := range face.Methods() {
		if !method.Exported() {
			return true
		}
	}
	return false
}

func concreteTypes(pass *analysis.Pass) []*types.Named {
	var found []*types.Named
	for _, name := range pass.Pkg.Scope().Names() {
		object, ok := pass.Pkg.Scope().Lookup(name).(*types.TypeName)
		if !ok || object.IsAlias() || inTestFile(pass, object) {
			continue
		}
		named, isNamed := object.Type().(*types.Named)
		if isNamed && named.TypeParams().Len() == 0 && !types.IsInterface(named) {
			found = append(found, named)
		}
	}
	return found
}

func implementing(concrete []*types.Named, face *types.Interface) []*types.Named {
	var found []*types.Named
	for _, named := range concrete {
		if types.Implements(named, face) || types.Implements(types.NewPointer(named), face) {
			found = append(found, named)
		}
	}
	return found
}
