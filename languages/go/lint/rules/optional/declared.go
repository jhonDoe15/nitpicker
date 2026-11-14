package optional

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

func declare(pass *analysis.Pass, result *Result) {
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) || ast.IsGenerated(file) {
			continue
		}
		for _, declaration := range file.Decls {
			if function, ok := declaration.(*ast.FuncDecl); ok && exportedAPI(pass.TypesInfo, function) {
				declareParameters(pass, result, pass.TypesInfo.Defs[function.Name].(*types.Func))
			}
		}
	}
}

func exportedAPI(info *types.Info, function *ast.FuncDecl) bool {
	if !function.Name.IsExported() {
		return false
	}
	if function.Recv == nil || len(function.Recv.List) == 0 {
		return function.Recv == nil
	}
	named, ok := types.Unalias(support.Deref(info.TypeOf(function.Recv.List[0].Type))).(*types.Named)
	return ok && named.Obj().Exported()
}

func declareParameters(pass *analysis.Pass, result *Result, function *types.Func) {
	signature := function.Type().(*types.Signature)
	for index := range signature.Params().Len() {
		parameter := signature.Params().At(index).Type()
		if signature.Variadic() && index == signature.Params().Len()-1 {
			declareFunctional(pass, result, parameter.(*types.Slice).Elem())
			continue
		}
		if named, ok := optionsStruct(parameter); ok && named.Obj().Pkg() == pass.Pkg {
			declareFields(pass, result, named)
		}
	}
}

func declareFields(pass *analysis.Pass, result *Result, named *types.Named) {
	fields := named.Underlying().(*types.Struct)
	for index := range fields.NumFields() {
		field := fields.Field(index)
		if field.Exported() && !field.Embedded() && fields.Tag(index) == "" {
			result.Declared[key(pass, field)] = Option{
				Name:      named.Obj().Name() + "." + field.Name(),
				Position:  pass.Fset.Position(field.Pos()),
				Published: published(pass, pass.Pkg),
			}
		}
	}
}

func declareFunctional(pass *analysis.Pass, result *Result, option types.Type) {
	named, ok := types.Unalias(option).(*types.Named)
	if !ok || named.Obj().Pkg() != pass.Pkg {
		return
	}
	scope := pass.Pkg.Scope()
	for _, name := range scope.Names() {
		object := scope.Lookup(name)
		if !isOptionFunc(object) {
			continue
		}
		results := object.Type().(*types.Signature).Results()
		if results.Len() == 1 && types.Identical(results.At(0).Type(), named) {
			result.Declared[key(pass, object)] = Option{
				Name:      object.Name(),
				Position:  pass.Fset.Position(object.Pos()),
				Published: published(pass, pass.Pkg),
			}
		}
	}
}
