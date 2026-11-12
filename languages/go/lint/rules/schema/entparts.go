package schema

import (
	"go/ast"
	"go/token"
	"go/types"
	"slices"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

type entEdge struct {
	owner, target *types.TypeName
	name, ref     string
	field         string
	inverse       bool
	unique        bool
	through       bool
	pos           token.Pos
}

type entSchema struct {
	edges  []*entEdge
	unique map[string]bool
	leads  map[string]bool
	opaque bool
	skip   bool
}

func readSchema(pass *analysis.Pass, owner *types.TypeName, methods map[string]*ast.FuncDecl) *entSchema {
	read := &entSchema{unique: map[string]bool{}, leads: map[string]bool{}}
	readers := map[string]func(*analysis.Pass, *types.TypeName, ast.Expr) bool{
		"Edges": read.edge, "Indexes": read.index, "Fields": read.fieldOf, "Annotations": read.annotation,
		"Mixin": read.mixin,
	}
	for name, reader := range readers {
		decl, found := methods[name]
		if !found {
			continue
		}
		elements, readable := returnedElements(pass, decl)
		read.opaque = read.opaque || !readable
		for _, element := range elements {
			read.opaque = read.opaque || !reader(pass, owner, element)
		}
	}
	return read
}

func (read *entSchema) edge(pass *analysis.Pass, owner *types.TypeName, element ast.Expr) bool {
	call, ok := readChain(pass.TypesInfo, element)
	if !ok || !call.from(edgePath, "To", "From") || len(call.args) != 2 {
		return false
	}
	name, named := stringValue(pass.TypesInfo, call.args[0])
	target, typed := edgeTarget(pass.TypesInfo, call.args[1])
	if !named || !typed {
		return false
	}
	base := entEdge{owner: owner, target: target, name: name, inverse: call.root.Name() == "From", pos: element.Pos()}
	split := slices.IndexFunc(call.methods, func(step method) bool { return step.name == "From" })
	if split < 0 || base.inverse {
		read.edges = append(read.edges, describe(pass.TypesInfo, base, chain{root: call.root, methods: call.methods}))
		return true
	}
	inverseName, literal := stringValue(pass.TypesInfo, firstArg(call.methods[split]))
	if !literal {
		return false
	}
	inverse := entEdge{owner: owner, target: target, name: inverseName, ref: name, inverse: true, pos: element.Pos()}
	read.edges = append(read.edges,
		describe(pass.TypesInfo, base, chain{root: call.root, methods: call.methods[:split]}),
		describe(pass.TypesInfo, inverse, chain{root: call.root, methods: call.methods[split+1:]}))
	return true
}

func firstArg(step method) ast.Expr {
	if len(step.args) == 0 {
		return nil
	}
	return step.args[0]
}

func describe(info *types.Info, edge entEdge, steps chain) *entEdge {
	if ref, found := steps.argument(info, "Ref"); found {
		edge.ref = ref
	}
	edge.field, _ = steps.argument(info, "Field")
	edge.unique, edge.through = steps.has("Unique"), steps.has("Through")
	return &edge
}

func edgeTarget(info *types.Info, expr ast.Expr) (*types.TypeName, bool) {
	selector, ok := ast.Unparen(expr).(*ast.SelectorExpr)
	if !ok || selector.Sel.Name != "Type" {
		return nil, false
	}
	ident, ok := ast.Unparen(selector.X).(*ast.Ident)
	if !ok {
		return nil, false
	}
	target, ok := info.Uses[ident].(*types.TypeName)
	return target, ok
}

func (read *entSchema) index(pass *analysis.Pass, _ *types.TypeName, element ast.Expr) bool {
	call, ok := readChain(pass.TypesInfo, element)
	if !ok || !call.from(indexPath, "Fields", "Edges") {
		return false
	}
	parts := map[string][]string{}
	steps := append([]method{{name: call.root.Name(), args: call.args}}, call.methods...)
	partial := false
	for _, step := range steps {
		switch step.name {
		case "Fields", "Edges":
			values, literal := stringValues(pass.TypesInfo, step.args)
			if !literal {
				return false
			}
			parts[step.name] = append(parts[step.name], values...)
		case "Annotations":
			partial = partial || hasWhere(pass.TypesInfo, step.args)
		}
	}
	switch {
	case partial:
	case len(parts["Fields"]) > 0:
		read.leads["field:"+parts["Fields"][0]] = true
	case len(parts["Edges"]) > 0:
		read.leads["edge:"+parts["Edges"][0]] = true
	}
	return true
}

func hasWhere(info *types.Info, args []ast.Expr) bool {
	where := false
	for _, arg := range args {
		ast.Inspect(arg, func(node ast.Node) bool {
			switch each := node.(type) {
			case *ast.KeyValueExpr:
				key, ok := each.Key.(*ast.Ident)
				where = where || ok && key.Name == "Where"
			case *ast.CallExpr:
				call, ok := readChain(info, each)
				where = where || ok && call.root.Name() == "IndexWhere"
			}
			return !where
		})
	}
	return where
}

func (read *entSchema) fieldOf(pass *analysis.Pass, _ *types.TypeName, element ast.Expr) bool {
	call, ok := readChain(pass.TypesInfo, element)
	if !ok || !call.from(fieldPath) || len(call.args) == 0 {
		return false
	}
	name, named := stringValue(pass.TypesInfo, call.args[0])
	if named && call.has("Unique") {
		read.unique[name] = true
	}
	return named
}

func (read *entSchema) annotation(pass *analysis.Pass, _ *types.TypeName, element ast.Expr) bool {
	if call, ok := readChain(pass.TypesInfo, element); ok && call.from(fieldPath, "ID") && len(call.args) > 0 {
		if first, named := stringValue(pass.TypesInfo, call.args[0]); named {
			read.leads["field:"+first] = true
		}
	}
	ast.Inspect(element, func(node ast.Node) bool {
		switch each := node.(type) {
		case *ast.KeyValueExpr:
			key, ok := each.Key.(*ast.Ident)
			read.skip = read.skip || ok && key.Name == "Skip" && isTrue(pass.TypesInfo, each.Value)
		case *ast.CallExpr:
			call, ok := readChain(pass.TypesInfo, each)
			read.skip = read.skip || ok && call.root.Name() == "Skip" && len(call.args) == 0
		}
		return true
	})
	return true
}

func isTrue(info *types.Info, expr ast.Expr) bool {
	value := info.Types[expr].Value
	return value != nil && value.String() == "true"
}

func (read *entSchema) mixin(pass *analysis.Pass, _ *types.TypeName, element ast.Expr) bool {
	named, ok := types.Unalias(support.Deref(pass.TypesInfo.TypeOf(element))).(*types.Named)
	if !ok {
		return false
	}
	if named.Obj().Pkg() != nil && named.Obj().Pkg().Path() == mixinPath {
		return true
	}
	for index := range named.NumMethods() {
		if name := named.Method(index).Name(); name == "Edges" || name == "Indexes" {
			return false
		}
	}
	return true
}
