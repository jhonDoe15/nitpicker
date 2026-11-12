package support

import (
	"go/types"
	"sync"
)

type ForeignMethods map[string][]*types.Interface

var foreignCache sync.Map

func ImportedInterfaceMethods(pkg *types.Package) ForeignMethods {
	if cached, ok := foreignCache.Load(pkg); ok {
		return cached.(ForeignMethods)
	}
	methods := collectMethods(pkg)
	foreignCache.Store(pkg, methods)
	return methods
}

func collectMethods(pkg *types.Package) ForeignMethods {
	methods := ForeignMethods{}
	seen := map[*types.Package]bool{}
	var visit func(*types.Package)
	visit = func(each *types.Package) {
		if seen[each] {
			return
		}
		seen[each] = true
		methods.add(each.Scope())
		for _, imported := range each.Imports() {
			visit(imported)
		}
	}
	for _, imported := range pkg.Imports() {
		visit(imported)
	}
	return methods
}

func (methods ForeignMethods) add(scope *types.Scope) {
	for _, name := range scope.Names() {
		object, ok := scope.Lookup(name).(*types.TypeName)
		if !ok || !object.Exported() {
			continue
		}
		face, isInterface := object.Type().Underlying().(*types.Interface)
		if !isInterface {
			continue
		}
		for method := range face.Methods() {
			methods[method.Name()] = append(methods[method.Name()], face)
		}
	}
}

func (methods ForeignMethods) Implements(method *types.Func) bool {
	receiver := Deref(method.Signature().Recv().Type())
	for _, face := range methods[method.Name()] {
		if types.Implements(receiver, face) || types.Implements(types.NewPointer(receiver), face) {
			return true
		}
	}
	return false
}
