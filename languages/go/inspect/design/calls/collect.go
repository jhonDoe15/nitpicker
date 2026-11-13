package calls

import (
	"go/ast"
	"go/token"
	"sort"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

type Call struct {
	Target   string `json:"target"`
	Line     int    `json:"line"`
	Mutation string `json:"mutation,omitempty"`
}

type site struct {
	call Call
	node *ast.CallExpr
	at   token.Pos
}

func targetOf(callee scope.Callee) string {
	switch callee.Kind {
	case scope.Function:
		return callee.Func.ID()
	case scope.Method:
		return callee.Member.ID()
	}
	return ""
}

func Collect(env *scope.Env, body *ast.BlockStmt, known func(string) bool) []Call {
	if body == nil {
		return nil
	}
	var sites []site
	ast.Inspect(body, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if !ok {
			return true
		}
		target := targetOf(env.Callee(call))
		if target != "" && known(target) {
			sites = append(sites, site{
				call: Call{Target: target, Line: env.File.Line(call.Lparen)},
				node: call,
				at:   call.Lparen,
			})
		}
		return true
	})
	sort.SliceStable(sites, func(left, right int) bool { return sites[left].at < sites[right].at })
	markMutations(env, body, sites)
	calls := make([]Call, len(sites))
	for position, entry := range sites {
		calls[position] = entry.call
	}
	return calls
}
