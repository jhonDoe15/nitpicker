package uses

import (
	"go/ast"
	"sort"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

type referencer struct {
	env    *scope.Env
	known  func(string) bool
	calls  bool
	found  map[string]bool
	stack  []ast.Node
	tables bool
}

func newReferencer(env *scope.Env, known func(string) bool, calls, tables bool) *referencer {
	return &referencer{env: env, known: known, calls: calls, tables: tables, found: map[string]bool{}}
}

func (r *referencer) result() []string {
	if len(r.found) == 0 {
		return nil
	}
	ids := make([]string, 0, len(r.found))
	for id := range r.found {
		ids = append(ids, id)
	}
	sort.Strings(ids)
	return ids
}

func References(env *scope.Env, root ast.Node, known func(string) bool) []string {
	r := newReferencer(env, known, false, true)
	ast.Walk(r, root)
	return r.result()
}

func ImportTime(env *scope.Env, roots []ast.Node, known func(string) bool) []string {
	r := newReferencer(env, known, true, false)
	for _, root := range roots {
		ast.Walk(r, root)
	}
	return r.result()
}

func (r *referencer) add(id string) {
	if id != "" && r.known(id) {
		r.found[id] = true
	}
}

func (r *referencer) Visit(node ast.Node) ast.Visitor {
	if node == nil {
		r.stack = r.stack[:len(r.stack)-1]
		return nil
	}
	parent := r.parent()
	r.stack = append(r.stack, node)
	switch typed := node.(type) {
	case *ast.CallExpr:
		if r.calls {
			r.add(r.env.Callee(typed).Target())
		}
	case *ast.KeyValueExpr:
		return r.keyValue(typed)
	case *ast.Ident:
		if !r.isSelected(parent, typed) && !r.isCalled(parent, typed) {
			r.use(typed)
		}
	case *ast.SelectorExpr:
		if !r.isCalled(parent, typed) {
			if id := r.env.FuncValue(typed); id != "" {
				r.add(id)
				r.stack = r.stack[:len(r.stack)-1]
				return nil
			}
		}
	}
	return r
}

func (r *referencer) keyValue(pair *ast.KeyValueExpr) ast.Visitor {
	if _, plain := pair.Key.(*ast.Ident); !plain {
		ast.Walk(r, pair.Key)
	}
	ast.Walk(r, pair.Value)
	r.stack = r.stack[:len(r.stack)-1]
	return nil
}

func (r *referencer) parent() ast.Node {
	if len(r.stack) == 0 {
		return nil
	}
	return r.stack[len(r.stack)-1]
}

func (r *referencer) isSelected(parent ast.Node, identifier *ast.Ident) bool {
	selector, ok := parent.(*ast.SelectorExpr)
	return ok && selector.Sel == identifier
}

func (r *referencer) isCalled(parent ast.Node, node ast.Expr) bool {
	call, ok := parent.(*ast.CallExpr)
	return ok && call.Fun == node
}

func (r *referencer) use(identifier *ast.Ident) {
	if id := r.env.FuncValue(identifier); id != "" {
		r.add(id)
		return
	}
	variable := r.env.PackageVar(identifier.Name)
	if !r.tables || variable == nil || variable.Spec == nil {
		return
	}
	table := newReferencer(scope.ForFile(variable.File), r.known, false, false)
	for _, value := range variable.Spec.Values {
		ast.Walk(table, value)
	}
	for id := range table.found {
		r.found[id] = true
	}
}
