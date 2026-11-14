package index

import "go/ast"

func Arity(signature *ast.FuncType) [2]int {
	count := func(list *ast.FieldList) int {
		total := 0
		if list != nil {
			for _, field := range list.List {
				total += max(1, len(field.Names))
			}
		}
		return total
	}
	return [2]int{count(signature.Params), count(signature.Results)}
}

func (x *Index) MethodSet(t *TypeInfo) map[string][2]int {
	set := map[string][2]int{}
	x.collectMethods(t, set, embeddingDepth)
	return set
}

func (x *Index) collectMethods(t *TypeInfo, set map[string][2]int, depth int) {
	for name, function := range t.Methods {
		set[name] = Arity(function.Decl.Type)
	}
	for _, member := range t.InterfaceMethods() {
		set[member.Name] = Arity(member.Sig)
	}
	if depth == 0 {
		return
	}
	for _, parent := range t.Embedded() {
		x.collectMethods(parent, set, depth-1)
	}
}
