package optional

import (
	"go/ast"
	"go/token"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

func collectSets(pass *analysis.Pass, result *Result) {
	for _, file := range pass.Files {
		sets := result.Set
		if support.InTestFile(pass, file) {
			sets = result.SetTests
		}
		ast.Inspect(file, func(node ast.Node) bool {
			switch typed := node.(type) {
			case *ast.CompositeLit:
				literalSets(pass, sets, typed)
			case *ast.AssignStmt:
				for _, target := range typed.Lhs {
					fieldSet(pass, sets, target)
				}
			case *ast.IncDecStmt:
				fieldSet(pass, sets, typed.X)
			case *ast.UnaryExpr:
				addressSet(pass, sets, typed)
			case *ast.Ident:
				if object := pass.TypesInfo.Uses[typed]; object != nil && isOptionFunc(object) {
					sets[key(pass, object)] = true
				}
			}
			return true
		})
	}
}

func literalSets(pass *analysis.Pass, sets map[string]bool, literal *ast.CompositeLit) {
	named, ok := optionsStruct(pass.TypesInfo.TypeOf(literal))
	if !ok {
		return
	}
	for _, element := range literal.Elts {
		pair, keyed := element.(*ast.KeyValueExpr)
		if !keyed {
			allFields(pass, sets, named)
			return
		}
		if name, ok := pair.Key.(*ast.Ident); ok && pass.TypesInfo.Uses[name] != nil {
			sets[key(pass, pass.TypesInfo.Uses[name])] = true
		}
	}
}

func allFields(pass *analysis.Pass, sets map[string]bool, named *types.Named) {
	fields := named.Underlying().(*types.Struct)
	for index := range fields.NumFields() {
		sets[key(pass, fields.Field(index))] = true
	}
}

func fieldSet(pass *analysis.Pass, sets map[string]bool, target ast.Expr) {
	selector, ok := ast.Unparen(target).(*ast.SelectorExpr)
	if !ok {
		return
	}
	if selection := pass.TypesInfo.Selections[selector]; selection != nil && selection.Kind() == types.FieldVal {
		sets[key(pass, selection.Obj())] = true
	}
}

func addressSet(pass *analysis.Pass, sets map[string]bool, unary *ast.UnaryExpr) {
	if unary.Op != token.AND {
		return
	}
	operand := ast.Unparen(unary.X)
	if _, literal := operand.(*ast.CompositeLit); literal {
		return
	}
	if named, ok := optionsStruct(pass.TypesInfo.TypeOf(operand)); ok {
		allFields(pass, sets, named)
		return
	}
	fieldSet(pass, sets, operand)
}
