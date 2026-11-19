package domainmutation

import (
	"go/ast"
	"go/token"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var Analyzer = &analysis.Analyzer{
	Name:     "mutating_method_in_domain",
	Doc:      "reports domain code that changes a slice or map it was given",
	Requires: support.Requires,
	Run:      run,
}

const slicePrefix = "Domain code does not change a value it was given, and %s changes the slice parameter `%s`: "
const sliceForm = "build a new slice instead, `append(slices.Clone(%s), ...)`, `slices.Concat(...)` or " +
	"`slices.Sorted(slices.Values(%s))`. A slice made and filled in the same function is allowed."
const mapPrefix = "Domain code does not change a value it was given, and %s changes the map parameter `%s`: "
const mapForm = "build a new map instead, `maps.Clone(%s)` changed before it is returned, or a map made and " +
	"filled in the same function."

var adapterSegments = []string{"adapter", "adapters", "infrastructure", "infra"}

func inDomain(pass *analysis.Pass) bool {
	segments := strings.Split(pass.Pkg.Path(), "/")
	return slices.Contains(segments, "domain") && !slices.ContainsFunc(segments, func(segment string) bool {
		return slices.Contains(adapterSegments, segment)
	})
}

func run(pass *analysis.Pass) (any, error) {
	if !inDomain(pass) {
		return nil, nil
	}
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		check(pass, cursor)
	}
	return nil, nil
}

func check(pass *analysis.Pass, cursor inspector.Cursor) {
	var params *ast.FieldList
	var body *ast.BlockStmt
	switch node := cursor.Node().(type) {
	case *ast.FuncDecl:
		params, body = node.Type.Params, node.Body
	case *ast.FuncLit:
		params, body = node.Type.Params, node.Body
	}
	if body == nil || params == nil || support.InTestFile(pass, body) {
		return
	}
	given := givenValues(pass, params)
	if len(given) == 0 {
		return
	}
	rebound := reboundAt(pass, body, given)
	reported := map[types.Object]bool{}
	ast.Inspect(body, func(node ast.Node) bool {
		object, text := mutation(pass, node, given)
		if object == nil || reported[object] {
			return true
		}
		if at, replaced := rebound[object]; replaced && at < node.Pos() {
			return true
		}
		reported[object] = true
		report(pass, node, object, text)
		return true
	})
}

func report(pass *analysis.Pass, node ast.Node, object types.Object, text string) {
	if _, isMap := object.Type().Underlying().(*types.Map); isMap {
		pass.Reportf(node.Pos(), mapPrefix+mapForm, text, object.Name(), object.Name())
		return
	}
	pass.Reportf(node.Pos(), slicePrefix+sliceForm, text, object.Name(), object.Name(), object.Name())
}

func givenValues(pass *analysis.Pass, params *ast.FieldList) map[types.Object]bool {
	found := map[types.Object]bool{}
	for _, field := range params.List {
		for _, name := range field.Names {
			object := pass.TypesInfo.Defs[name]
			if object == nil {
				continue
			}
			switch object.Type().Underlying().(type) {
			case *types.Slice, *types.Map:
				found[object] = true
			}
		}
	}
	return found
}

func reboundAt(pass *analysis.Pass, body *ast.BlockStmt, given map[types.Object]bool) map[types.Object]token.Pos {
	found := map[types.Object]token.Pos{}
	ast.Inspect(body, func(node ast.Node) bool {
		assign, ok := node.(*ast.AssignStmt)
		if !ok || assign.Tok == token.DEFINE {
			return true
		}
		for index, left := range assign.Lhs {
			ident, isIdent := left.(*ast.Ident)
			if !isIdent || !given[pass.TypesInfo.ObjectOf(ident)] || selfAppend(pass, assign, index, ident) {
				continue
			}
			target := pass.TypesInfo.ObjectOf(ident)
			if at, seen := found[target]; !seen || assign.Pos() < at {
				found[target] = assign.Pos()
			}
		}
		return true
	})
	return found
}

func objectOf(pass *analysis.Pass, expr ast.Expr) types.Object {
	if ident, ok := expr.(*ast.Ident); ok {
		return pass.TypesInfo.ObjectOf(ident)
	}
	return nil
}

func selfAppend(pass *analysis.Pass, assign *ast.AssignStmt, index int, target *ast.Ident) bool {
	if len(assign.Lhs) != len(assign.Rhs) {
		return false
	}
	call, ok := assign.Rhs[index].(*ast.CallExpr)
	if !ok || !support.IsBuiltin(pass.TypesInfo, call, "append") || len(call.Args) == 0 {
		return false
	}
	first := objectOf(pass, call.Args[0])
	return first != nil && first == pass.TypesInfo.ObjectOf(target)
}
