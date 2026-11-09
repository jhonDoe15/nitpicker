package support

import "go/types"

type ForeignMethods map[string][]*types.Signature

func ImportedInterfaceMethods(pkg *types.Package) ForeignMethods {
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
			methods[method.Name()] = append(methods[method.Name()], method.Signature())
		}
	}
}

func (methods ForeignMethods) Implements(method *types.Func) bool {
	signature := method.Signature()
	for _, candidate := range methods[method.Name()] {
		if types.Identical(withoutReceiver(candidate), withoutReceiver(signature)) {
			return true
		}
	}
	return false
}

func withoutReceiver(signature *types.Signature) *types.Signature {
	return types.NewSignatureType(nil, nil, nil, signature.Params(), signature.Results(), signature.Variadic())
}
