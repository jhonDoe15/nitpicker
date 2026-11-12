package schema

import (
	"fmt"
	"go/ast"
	"go/types"
	"unicode"
	"unicode/utf8"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

func entFindings(pass *analysis.Pass) []finding {
	schemas := entSchemas(pass)
	var found []finding
	for _, read := range schemas {
		if read.opaque || read.skip {
			continue
		}
		for _, edge := range read.edges {
			if message, report := edgeMessage(schemas, edge); report {
				found = append(found, finding{pos: edge.pos, message: message})
			}
		}
	}
	return found
}

func entSchemas(pass *analysis.Pass) map[*types.TypeName]*entSchema {
	methods := map[*types.TypeName]map[string]*ast.FuncDecl{}
	scope := pass.Pkg.Scope()
	for _, name := range scope.Names() {
		if owner, ok := scope.Lookup(name).(*types.TypeName); ok && isEntSchema(owner) && !inTestFile(pass, owner.Pos()) {
			methods[owner] = map[string]*ast.FuncDecl{}
		}
	}
	for _, file := range sourceFiles(pass) {
		for _, decl := range file.Decls {
			function, ok := decl.(*ast.FuncDecl)
			if !ok || function.Recv == nil || len(function.Recv.List) != 1 {
				continue
			}
			if owner := receiverType(pass.TypesInfo, function.Recv.List[0].Type); methods[owner] != nil {
				methods[owner][function.Name.Name] = function
			}
		}
	}
	schemas := map[*types.TypeName]*entSchema{}
	for owner, declared := range methods {
		schemas[owner] = readSchema(pass, owner, declared)
	}
	return schemas
}

func receiverType(info *types.Info, expr ast.Expr) *types.TypeName {
	named, ok := types.Unalias(support.Deref(info.TypeOf(expr))).(*types.Named)
	if !ok {
		return nil
	}
	return named.Obj()
}

func isEntSchema(owner *types.TypeName) bool {
	structure, ok := owner.Type().Underlying().(*types.Struct)
	if !ok {
		return false
	}
	for index := range structure.NumFields() {
		field := structure.Field(index)
		if field.Anonymous() && support.IsNamed(field.Type(), entPath, "Schema") {
			return true
		}
	}
	return false
}

func edgeMessage(schemas map[*types.TypeName]*entSchema, edge *entEdge) (string, bool) {
	if edge.through {
		return "", false
	}
	if edge.inverse {
		assoc, ok := assocOf(schemas, edge)
		if !ok || !edge.unique || assoc.unique {
			return "", false
		}
		return keyMessage(schemas[edge.owner], edge)
	}
	if paired(schemas, edge) {
		inverse, ok := inverseOf(schemas, edge)
		if !ok || !edge.unique || inverse.unique {
			return "", false
		}
		return keyMessage(schemas[edge.owner], edge)
	}
	switch {
	case edge.target == edge.owner:
		return "", false
	case edge.unique:
		return keyMessage(schemas[edge.owner], edge)
	}
	target := schemas[edge.target]
	if target == nil || target.opaque || target.skip {
		return "", false
	}
	return fmt.Sprintf(
		"the ent edge `%s.%s` stores its foreign key in `%s`, which has no edge to index it by: "+
			"add the inverse `edge.From(%q, %s.Type).Ref(%q).Unique()` to `%s` and `index.Edges(%q)` to its `Indexes()`",
		edge.owner.Name(), edge.name, edge.target.Name(), lowerFirst(edge.owner.Name()), edge.owner.Name(),
		edge.name, edge.target.Name(), lowerFirst(edge.owner.Name())), true
}

func keyMessage(owner *entSchema, edge *entEdge) (string, bool) {
	byField := edge.field != "" && (owner.leads["field:"+edge.field] || owner.unique[edge.field])
	if owner.leads["edge:"+edge.name] || byField {
		return "", false
	}
	return fmt.Sprintf(
		"the ent edge `%s.%s` holds a foreign key, and no index or unique field of `%s` starts with it: "+
			"add `index.Edges(%q)` to `%s.Indexes()`, or put the edge first in a composite index",
		edge.owner.Name(), edge.name, edge.owner.Name(), edge.name, edge.owner.Name()), true
}

func assocOf(schemas map[*types.TypeName]*entSchema, inverse *entEdge) (*entEdge, bool) {
	target := schemas[inverse.target]
	if target == nil || target.opaque {
		return nil, false
	}
	for _, edge := range target.edges {
		if !edge.inverse && edge.name == inverse.ref && edge.target == inverse.owner {
			return edge, true
		}
	}
	return nil, false
}

func inverseOf(schemas map[*types.TypeName]*entSchema, assoc *entEdge) (*entEdge, bool) {
	target := schemas[assoc.target]
	if target == nil || target.opaque {
		return nil, false
	}
	for _, edge := range target.edges {
		if edge.inverse && edge.ref == assoc.name && edge.target == assoc.owner {
			return edge, true
		}
	}
	return nil, false
}

func paired(schemas map[*types.TypeName]*entSchema, assoc *entEdge) bool {
	target := schemas[assoc.target]
	if target == nil {
		return false
	}
	if target.opaque {
		return true
	}
	_, found := inverseOf(schemas, assoc)
	return found
}

func lowerFirst(name string) string {
	first, size := utf8.DecodeRuneInString(name)
	return string(unicode.ToLower(first)) + name[size:]
}
