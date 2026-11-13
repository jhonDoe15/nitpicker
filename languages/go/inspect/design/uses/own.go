package uses

import (
	"go/ast"
	"sort"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
)

func OwnFields(env *scope.Env, function *index.FuncInfo) []string {
	if function.Decl.Body == nil {
		return nil
	}
	names := map[string]bool{}
	if function.Recv != nil {
		for _, field := range function.Recv.Fields() {
			names[field.Name] = false
		}
	}
	used := map[string]bool{}
	selected := map[*ast.Ident]bool{}
	ast.Inspect(function.Decl.Body, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.SelectorExpr:
			selected[typed.Sel] = true
			base, ok := typed.X.(*ast.Ident)
			if _, field := names[typed.Sel.Name]; ok && field && env.Receiver != "" && base.Name == env.Receiver {
				used[typed.Sel.Name] = true
			}
		case *ast.Ident:
			if function.Recv == nil && !selected[typed] && isModuleVariable(env, typed.Name) {
				used[typed.Name] = true
			}
		}
		return true
	})
	if len(used) == 0 {
		return nil
	}
	fields := make([]string, 0, len(used))
	for name := range used {
		fields = append(fields, name)
	}
	sort.Strings(fields)
	return fields
}

func isModuleVariable(env *scope.Env, name string) bool {
	variable := env.PackageVar(name)
	return variable != nil && !variable.Const && variable.File == env.File
}
