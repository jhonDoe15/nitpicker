package overflow

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"math/big"

	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
	"golang.org/x/tools/go/types/typeutil"
)

type cursorOf = inspector.Cursor

type carriers map[types.Object]bool

type flow struct {
	target types.Object
	value  ast.Expr
}

func maxCarriers(pass *analysis.Pass) carriers {
	found := carriers{}
	flows := flowsOf(pass)
	for changed := true; changed; {
		changed = false
		for _, each := range flows {
			if !found[each.target] && holdsMax(pass, found, each.value, each.target.Type()) {
				found[each.target] = true
				changed = true
			}
		}
	}
	return found
}

func flowsOf(pass *analysis.Pass) []flow {
	var flows []flow
	add := func(target ast.Expr, value ast.Expr) {
		if object := objectOf(pass.TypesInfo, target); object != nil {
			flows = append(flows, flow{object, value})
		}
	}
	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			switch typed := node.(type) {
			case *ast.AssignStmt:
				if typed.Tok == token.ASSIGN || typed.Tok == token.DEFINE {
					pairs(typed.Lhs, typed.Rhs, add)
				}
			case *ast.ValueSpec:
				names := make([]ast.Expr, len(typed.Names))
				for index, name := range typed.Names {
					names[index] = name
				}
				pairs(names, typed.Values, add)
			case *ast.KeyValueExpr:
				add(typed.Key, typed.Value)
			case *ast.CallExpr:
				flows = append(flows, argumentFlows(pass, typed)...)
			}
			return true
		})
	}
	return flows
}

func pairs(targets, values []ast.Expr, add func(ast.Expr, ast.Expr)) {
	if len(targets) != len(values) {
		return
	}
	for index, target := range targets {
		add(target, values[index])
	}
}

func argumentFlows(pass *analysis.Pass, call *ast.CallExpr) []flow {
	callee, ok := typeutil.Callee(pass.TypesInfo, call).(*types.Func)
	if !ok || callee.Pkg() != pass.Pkg {
		return nil
	}
	signature, _ := callee.Type().(*types.Signature)
	if signature == nil || signature.Variadic() || signature.Params().Len() != len(call.Args) {
		return nil
	}
	flows := make([]flow, len(call.Args))
	for index, argument := range call.Args {
		flows[index] = flow{signature.Params().At(index), argument}
	}
	return flows
}

func objectOf(info *types.Info, target ast.Expr) types.Object {
	switch typed := ast.Unparen(target).(type) {
	case *ast.Ident:
		if object := info.ObjectOf(typed); object != nil {
			if _, isVar := object.(*types.Var); isVar {
				return object
			}
		}
	case *ast.SelectorExpr:
		if selection := info.Selections[typed]; selection != nil && selection.Kind() == types.FieldVal {
			return selection.Obj()
		}
	}
	return nil
}

func holdsMax(pass *analysis.Pass, found carriers, value ast.Expr, target types.Type) bool {
	value = ast.Unparen(value)
	if known := pass.TypesInfo.Types[value].Value; known != nil {
		return isMaxOf(pass, known, target)
	}
	object := objectOf(pass.TypesInfo, value)
	return object != nil && found[object]
}

func isMaxOf(pass *analysis.Pass, value constant.Value, typ types.Type) bool {
	basic, ok := types.Unalias(typ).Underlying().(*types.Basic)
	if !ok || basic.Info()&types.IsInteger == 0 || value.Kind() != constant.Int {
		return false
	}
	bits := uint(pass.TypesSizes.Sizeof(basic) * 8)
	limit := new(big.Int).Lsh(big.NewInt(1), bits)
	if basic.Info()&types.IsUnsigned == 0 {
		limit.Rsh(limit, 1)
	}
	limit.Sub(limit, big.NewInt(1))
	return constant.Compare(value, token.EQL, constant.Make(limit))
}

func maxOperand(pass *analysis.Pass, found carriers, operands ...ast.Expr) (types.Object, bool) {
	for _, operand := range operands {
		unwrapped := ast.Unparen(operand)
		typ := pass.TypesInfo.TypeOf(unwrapped)
		if known := pass.TypesInfo.Types[unwrapped].Value; known != nil && isMaxOf(pass, known, typ) {
			return nil, true
		}
		if object := objectOf(pass.TypesInfo, unwrapped); object != nil && found[object] {
			return object, true
		}
	}
	return nil, false
}
