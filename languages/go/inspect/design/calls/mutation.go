package calls

import (
	"go/ast"
	"go/token"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

var builtinMutators = map[string]string{"delete": "delete", "clear": "clear", "copy": "copy"}

var packageMutators = map[string]map[string]string{
	"sort": {
		"Slice": "sort", "SliceStable": "sort", "Sort": "sort", "Stable": "sort",
		"Strings": "sort", "Ints": "sort", "Float64s": "sort",
	},
	"slices": {"Sort": "sort", "SortFunc": "sort", "SortStableFunc": "sort", "Reverse": "reverse"},
	"maps":   {"DeleteFunc": "delete", "Copy": "copy"},
}

type mutator struct {
	env     *scope.Env
	sites   []site
	byNode  map[*ast.CallExpr]int
	holders map[string]int
}

func markMutations(env *scope.Env, body *ast.BlockStmt, sites []site) {
	if len(sites) == 0 {
		return
	}
	m := &mutator{env: env, sites: sites, byNode: map[*ast.CallExpr]int{}, holders: map[string]int{}}
	for position, entry := range sites {
		m.byNode[entry.node] = position
	}
	ast.Inspect(body, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.AssignStmt:
			m.holdResults(typed.Tok == token.DEFINE, typed.Lhs, typed.Rhs)
		case *ast.ValueSpec:
			names := make([]ast.Expr, len(typed.Names))
			for position, name := range typed.Names {
				names[position] = name
			}
			m.holdResults(true, names, typed.Values)
		}
		return true
	})
	ast.Inspect(body, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.AssignStmt:
			if typed.Tok != token.DEFINE {
				for _, target := range typed.Lhs {
					m.write(target, "assign", false)
				}
			}
		case *ast.IncDecStmt:
			m.write(typed.X, "assign", false)
		case *ast.CallExpr:
			m.mutatorCall(typed)
		}
		return true
	})
}

func (m *mutator) holdResults(define bool, names, values []ast.Expr) {
	if !define || len(values) != 1 {
		return
	}
	position, ok := m.siteOf(values[0])
	if !ok {
		return
	}
	for _, target := range names {
		identifier, ok := target.(*ast.Ident)
		if !ok || identifier.Name == "_" {
			continue
		}
		binding := m.env.Vars[identifier.Name]
		if binding != nil && binding.Count == 1 && m.env.Reassigned[identifier.Name] == 0 {
			m.holders[identifier.Name] = position
		}
	}
}

func (m *mutator) siteOf(expression ast.Expr) (int, bool) {
	for {
		paren, ok := expression.(*ast.ParenExpr)
		if !ok {
			break
		}
		expression = paren.X
	}
	call, ok := expression.(*ast.CallExpr)
	if !ok {
		return 0, false
	}
	position, found := m.byNode[call]
	return position, found
}

func (m *mutator) write(target ast.Expr, name string, allowBare bool) {
	position, ok := m.root(target, allowBare)
	if ok && m.sites[position].call.Mutation == "" {
		m.sites[position].call.Mutation = name
	}
}

func (m *mutator) root(expression ast.Expr, peeled bool) (int, bool) {
	switch typed := expression.(type) {
	case *ast.ParenExpr:
		return m.root(typed.X, peeled)
	case *ast.IndexExpr:
		return m.root(typed.X, true)
	case *ast.SliceExpr:
		return m.root(typed.X, true)
	case *ast.SelectorExpr:
		return m.root(typed.X, true)
	case *ast.StarExpr:
		return m.root(typed.X, true)
	case *ast.Ident:
		position, held := m.holders[typed.Name]
		return position, peeled && held
	case *ast.CallExpr:
		position, found := m.byNode[typed]
		return position, peeled && found
	}
	return 0, false
}

func (m *mutator) mutatorCall(call *ast.CallExpr) {
	if len(call.Args) == 0 {
		return
	}
	name := m.mutatorName(call)
	if name != "" {
		m.write(call.Args[0], name, true)
	}
}

func (m *mutator) mutatorName(call *ast.CallExpr) string {
	switch fun := call.Fun.(type) {
	case *ast.Ident:
		if m.env.Declared(fun.Name) || m.env.File.Pkg.Funcs[fun.Name] != nil {
			return ""
		}
		return builtinMutators[fun.Name]
	case *ast.SelectorExpr:
		qualifier, ok := fun.X.(*ast.Ident)
		if !ok || m.env.Declared(qualifier.Name) {
			return ""
		}
		return packageMutators[m.env.File.Paths[qualifier.Name]][fun.Sel.Name]
	}
	return ""
}
