package schema

import (
	"go/ast"
	"go/constant"
	"go/types"
	"slices"

	"golang.org/x/tools/go/analysis"
)

const (
	entPath    = "entgo.io/ent"
	edgePath   = entPath + "/schema/edge"
	indexPath  = entPath + "/schema/index"
	fieldPath  = entPath + "/schema/field"
	mixinPath  = entPath + "/schema/mixin"
	entsqlPath = entPath + "/dialect/entsql"
)

type method struct {
	name string
	args []ast.Expr
}

type chain struct {
	root    *types.Func
	args    []ast.Expr
	methods []method
}

func readChain(info *types.Info, expr ast.Expr) (chain, bool) {
	var methods []method
	for {
		call, ok := ast.Unparen(expr).(*ast.CallExpr)
		if !ok {
			return chain{}, false
		}
		selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
		if !ok {
			return chain{}, false
		}
		if function, isFunc := info.Uses[selector.Sel].(*types.Func); isFunc && function.Signature().Recv() == nil {
			slices.Reverse(methods)
			return chain{root: function, args: call.Args, methods: methods}, true
		}
		methods = append(methods, method{name: selector.Sel.Name, args: call.Args})
		expr = selector.X
	}
}

func (each chain) from(path string, names ...string) bool {
	return each.root.Pkg() != nil && each.root.Pkg().Path() == path &&
		(len(names) == 0 || slices.Contains(names, each.root.Name()))
}

func (each chain) has(name string) bool {
	return slices.ContainsFunc(each.methods, func(call method) bool { return call.name == name })
}

func (each chain) argument(info *types.Info, name string) (string, bool) {
	for _, call := range slices.Backward(each.methods) {
		if call.name == name && len(call.args) > 0 {
			return stringValue(info, call.args[0])
		}
	}
	return "", false
}

func stringValue(info *types.Info, expr ast.Expr) (string, bool) {
	value := info.Types[expr].Value
	if value == nil || value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(value), true
}

func stringValues(info *types.Info, exprs []ast.Expr) ([]string, bool) {
	var values []string
	for _, expr := range exprs {
		value, ok := stringValue(info, expr)
		if !ok {
			return nil, false
		}
		values = append(values, value)
	}
	return values, true
}

func returnedElements(pass *analysis.Pass, decl *ast.FuncDecl) ([]ast.Expr, bool) {
	var elements []ast.Expr
	readable := decl.Body != nil
	ast.Inspect(decl.Body, func(node ast.Node) bool {
		switch each := node.(type) {
		case *ast.FuncLit:
			return false
		case *ast.ReturnStmt:
			if len(each.Results) != 1 {
				readable = false
				return false
			}
			literal, ok := ast.Unparen(each.Results[0]).(*ast.CompositeLit)
			if ok {
				elements = append(elements, literal.Elts...)
			} else if !isNil(pass.TypesInfo, each.Results[0]) {
				readable = false
			}
		}
		return true
	})
	return elements, readable
}

func isNil(info *types.Info, expr ast.Expr) bool {
	return info.Types[expr].IsNil()
}
