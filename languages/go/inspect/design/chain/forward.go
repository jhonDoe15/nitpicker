package chain

import (
	"go/ast"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

type Forward struct {
	Target    string `json:"target"`
	Arguments []int  `json:"arguments"`
	Returned  bool   `json:"returned"`
}

func Of(env *scope.Env, declaration *ast.FuncDecl, known func(string) bool) *Forward {
	if declaration.Body == nil || len(declaration.Body.List) != 1 {
		return nil
	}
	call, returned := onlyCall(declaration)
	if call == nil || call.Ellipsis.IsValid() {
		return nil
	}
	target := env.Callee(call).Target()
	if target == "" || !known(target) {
		return nil
	}
	positions := map[*ast.Object]int{}
	for _, param := range scope.ParamObjects(declaration) {
		positions[param.Object] = param.Position
	}
	forward := &Forward{Target: target, Arguments: make([]int, len(call.Args)), Returned: returned}
	passed := false
	for at, argument := range call.Args {
		forward.Arguments[at] = -1
		if identifier, ok := argument.(*ast.Ident); ok && identifier.Obj != nil {
			if position, found := positions[identifier.Obj]; found {
				forward.Arguments[at] = position
				passed = true
			}
		}
	}
	if !passed {
		return nil
	}
	return forward
}

func onlyCall(declaration *ast.FuncDecl) (*ast.CallExpr, bool) {
	hasResults := declaration.Type.Results != nil && len(declaration.Type.Results.List) > 0
	switch statement := declaration.Body.List[0].(type) {
	case *ast.ReturnStmt:
		if hasResults && len(statement.Results) == 1 {
			call, _ := statement.Results[0].(*ast.CallExpr)
			return call, true
		}
	case *ast.ExprStmt:
		if !hasResults {
			call, _ := statement.X.(*ast.CallExpr)
			return call, false
		}
	}
	return nil, false
}
