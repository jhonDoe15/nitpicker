package recursion

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var Analyzer = &analysis.Analyzer{
	Name:     "self_recursion",
	Doc:      "reports a function that calls itself, directly or through another function of the package",
	Requires: support.Requires,
	Run:      run,
}

const exception = " An exception fits only when the recursion is bounded and deliberate."

const direct = "'%s' calls itself. Retry or poll: loop with `for attempt := range attempts`. Tree walk " +
	"(directories, AST, JSON): loop over a worklist, appending each node's children to it " +
	"(`for i := 0; i < len(pending); i++ { pending = append(pending, children...) }`). Flat data: a loop that " +
	"appends, or `slices` and `maps` helpers." + exception

const mutual = "'%s' and '%s' call each other. Replace the cycle with a loop over a worklist, or merge them " +
	"into one function that loops." + exception

type edge struct {
	source *types.Func
	target *types.Func
	at     token.Pos
}

func run(pass *analysis.Pass) (any, error) {
	declarations := functions(pass)
	edges := callGraph(pass, declarations)
	for _, each := range edges {
		if each.source == each.target {
			if unconditional(declarations[each.source]) {
				continue
			}
			pass.Reportf(each.at, direct, each.source.Name())
		} else if startsCycle(each, edges) {
			pass.Reportf(each.at, mutual, each.source.Name(), each.target.Name())
		}
	}
	return nil, nil
}

func functions(pass *analysis.Pass) map[*types.Func]*ast.FuncDecl {
	found := map[*types.Func]*ast.FuncDecl{}
	for object, declaration := range support.FuncDecls(pass) {
		function, ok := object.(*types.Func)
		if ok && !support.InTestFile(pass, declaration) {
			found[function] = declaration
		}
	}
	return found
}

func callGraph(pass *analysis.Pass, declarations map[*types.Func]*ast.FuncDecl) []edge {
	var edges []edge
	for source, declaration := range declarations {
		ast.Inspect(declaration.Body, func(node ast.Node) bool {
			for _, reference := range references(pass.TypesInfo, node) {
				if _, known := declarations[reference.target]; known {
					edges = append(edges, edge{source, reference.target, reference.at})
				}
			}
			return !deferred(pass.TypesInfo, node)
		})
	}
	return sorted(edges)
}

type reference struct {
	target *types.Func
	at     token.Pos
}

var iterating = map[string]bool{"slices": true, "sort": true, "maps": true, "iter": true}

func references(info *types.Info, node ast.Node) []reference {
	call, ok := node.(*ast.CallExpr)
	if !ok {
		return nil
	}
	var found []reference
	if callee, ok := typeutil.Callee(info, call).(*types.Func); ok {
		found = append(found, reference{callee.Origin(), call.Pos()})
		if callee.Pkg() != nil && iterating[callee.Pkg().Path()] {
			found = append(found, passed(info, call)...)
		}
	}
	return found
}

func passed(info *types.Info, call *ast.CallExpr) []reference {
	var found []reference
	for _, argument := range call.Args {
		var object types.Object
		switch each := ast.Unparen(argument).(type) {
		case *ast.Ident:
			object = info.Uses[each]
		case *ast.SelectorExpr:
			object = info.Uses[each.Sel]
		}
		if function, ok := object.(*types.Func); ok {
			found = append(found, reference{function.Origin(), argument.Pos()})
		}
	}
	return found
}

func deferred(info *types.Info, node ast.Node) bool {
	call, ok := node.(*ast.CallExpr)
	return ok && support.IsFunc(info, call, "time", "AfterFunc") && skipsLiteral(call)
}

func skipsLiteral(call *ast.CallExpr) bool {
	for _, argument := range call.Args {
		if _, literal := argument.(*ast.FuncLit); literal {
			return true
		}
	}
	return false
}

func sorted(edges []edge) []edge {
	for i := 1; i < len(edges); i++ {
		for j := i; j > 0 && edges[j].at < edges[j-1].at; j-- {
			edges[j], edges[j-1] = edges[j-1], edges[j]
		}
	}
	return edges
}

func reachable(start *types.Func, edges []edge) map[*types.Func]bool {
	seen := map[*types.Func]bool{start: true}
	pending := []*types.Func{start}
	for len(pending) > 0 {
		current := pending[0]
		pending = pending[1:]
		for _, each := range edges {
			if each.source == current && !seen[each.target] {
				seen[each.target] = true
				pending = append(pending, each.target)
			}
		}
	}
	return seen
}

func startsCycle(each edge, edges []edge) bool {
	if !reachable(each.target, edges)[each.source] {
		return false
	}
	forward := reachable(each.source, edges)
	for member := range forward {
		if reachable(member, edges)[each.source] && member.Pos() < each.source.Pos() {
			return false
		}
	}
	return true
}

func unconditional(declaration *ast.FuncDecl) bool {
	found := true
	ast.Inspect(declaration.Body, func(node ast.Node) bool {
		switch each := node.(type) {
		case *ast.IfStmt, *ast.ForStmt, *ast.RangeStmt, *ast.SwitchStmt, *ast.TypeSwitchStmt, *ast.SelectStmt,
			*ast.FuncLit:
			found = false
		case *ast.BinaryExpr:
			found = found && each.Op != token.LAND && each.Op != token.LOR
		}
		return found
	})
	return found
}
