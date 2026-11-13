package calls

import (
	"go/ast"
	"go/token"
	"sort"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

type Call struct {
	Target   string   `json:"target"`
	Line     int      `json:"line"`
	Receiver string   `json:"receiver,omitempty"`
	Cleanup  bool     `json:"cleanup,omitempty"`
	Branch   []string `json:"branch,omitempty"`
	Mutation string   `json:"mutation,omitempty"`
}

type site struct {
	call Call
	node *ast.CallExpr
	at   token.Pos
}

type collector struct {
	env          *scope.Env
	known        func(string) bool
	sites        []site
	conditionals int
}

func Collect(env *scope.Env, body *ast.BlockStmt, known func(string) bool) []Call {
	if body == nil {
		return nil
	}
	c := &collector{env: env, known: known}
	ast.Walk(visitor{collector: c}, body)
	sort.SliceStable(c.sites, func(left, right int) bool { return c.sites[left].at < c.sites[right].at })
	markMutations(env, body, c.sites)
	stored := storedLocals(env, body)
	calls := make([]Call, len(c.sites))
	for position, entry := range c.sites {
		if field, ok := stored[entry.call.Receiver]; ok {
			entry.call.Receiver = field
		}
		calls[position] = entry.call
	}
	return calls
}

func storedLocals(env *scope.Env, body *ast.BlockStmt) map[string]string {
	stored := map[string]string{}
	ast.Inspect(body, func(node ast.Node) bool {
		assign, ok := node.(*ast.AssignStmt)
		if !ok || len(assign.Lhs) != len(assign.Rhs) {
			return true
		}
		for position, target := range assign.Lhs {
			value, isIdent := assign.Rhs[position].(*ast.Ident)
			field := receiverKey(env, target)
			if isIdent && env.Declared(value.Name) && strings.HasPrefix(field, "this.") {
				stored[value.Name] = field
			}
		}
		return true
	})
	return stored
}

func (c *collector) record(call *ast.CallExpr, state context) {
	callee := c.env.Callee(call)
	target := callee.Target()
	if target == "" || !c.known(target) {
		return
	}
	entry := Call{
		Target: target, Line: c.env.File.Line(call.Lparen),
		Cleanup: state.cleanup, Branch: append([]string(nil), state.branch...),
	}
	if callee.Kind == scope.Method {
		entry.Receiver = receiverKey(c.env, callee.Receiver)
	}
	c.sites = append(c.sites, site{call: entry, node: call, at: call.Lparen})
}

func receiverKey(env *scope.Env, expression ast.Expr) string {
	switch typed := expression.(type) {
	case *ast.ParenExpr:
		return receiverKey(env, typed.X)
	case *ast.StarExpr:
		return receiverKey(env, typed.X)
	case *ast.UnaryExpr:
		if typed.Op == token.AND {
			return receiverKey(env, typed.X)
		}
	case *ast.Ident:
		switch {
		case typed.Name == env.Receiver:
			return "this"
		case env.Declared(typed.Name):
			return typed.Name
		case env.File.Pkg.Vars[typed.Name] != nil:
			return "this." + typed.Name
		}
	case *ast.SelectorExpr:
		if base := receiverKey(env, typed.X); base != "" {
			return base + "." + typed.Sel.Name
		}
	}
	return ""
}
