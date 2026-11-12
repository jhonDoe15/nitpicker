package guards

import (
	"go/ast"
	"go/types"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var aliasAnalyzer = &analysis.Analyzer{
	Name:     "forwarding_method_alias",
	Doc:      "reports a method that only forwards its parameters to another method of the same type",
	Requires: support.Requires,
	Run:      runAliases,
}

const aliasMessage = "`%s` only passes its parameters on to `%s` of the same type: keep one of the two methods " +
	"(call `%s` directly, or rename it to `%s`) and delete the other"

func runAliases(pass *analysis.Pass) (any, error) {
	foreign := support.ImportedInterfaceMethods(pass.Pkg)
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) {
			continue
		}
		for _, declaration := range file.Decls {
			method, ok := declaration.(*ast.FuncDecl)
			if !ok || method.Recv == nil || method.Body == nil {
				continue
			}
			wrapper, isFunc := pass.TypesInfo.Defs[method.Name].(*types.Func)
			target := forwardedTarget(pass.TypesInfo, method)
			if !isFunc || target == nil || target.Name() == wrapper.Name() ||
				!types.Identical(wrapper.Signature(), target.Signature()) ||
				!sameReceiverType(wrapper, target) || foreign.Implements(wrapper) || localInterface(pass.Pkg, wrapper) {
				continue
			}
			pass.Reportf(method.Name.Pos(), aliasMessage, wrapper.Name(), target.Name(), target.Name(), wrapper.Name())
		}
	}
	return nil, nil
}

func forwardedTarget(info *types.Info, method *ast.FuncDecl) *types.Func {
	receiver := receiverObject(info, method)
	parameters := parameterObjects(info, method)
	if receiver == nil || len(parameters) == 0 || len(method.Body.List) != 1 {
		return nil
	}
	call := forwardedCall(method.Body.List[0], method.Type.Results != nil)
	if call == nil || len(call.Args) != len(parameters) {
		return nil
	}
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if !ok || !isObject(info, selector.X, receiver) {
		return nil
	}
	for index, argument := range call.Args {
		if !isObject(info, argument, parameters[index]) {
			return nil
		}
	}
	target, _ := info.Uses[selector.Sel].(*types.Func)
	if target == nil || call.Ellipsis.IsValid() != target.Signature().Variadic() {
		return nil
	}
	return target
}

func forwardedCall(statement ast.Stmt, hasResults bool) *ast.CallExpr {
	var value ast.Expr
	switch each := statement.(type) {
	case *ast.ReturnStmt:
		if len(each.Results) != 1 {
			return nil
		}
		value = each.Results[0]
	case *ast.ExprStmt:
		if hasResults {
			return nil
		}
		value = each.X
	default:
		return nil
	}
	call, _ := ast.Unparen(value).(*ast.CallExpr)
	return call
}

func receiverObject(info *types.Info, method *ast.FuncDecl) types.Object {
	names := method.Recv.List[0].Names
	if len(names) == 0 {
		return nil
	}
	return info.Defs[names[0]]
}

func parameterObjects(info *types.Info, method *ast.FuncDecl) []types.Object {
	objects := []types.Object{}
	for _, field := range method.Type.Params.List {
		for _, name := range field.Names {
			objects = append(objects, info.Defs[name])
		}
	}
	return objects
}

func isObject(info *types.Info, expression ast.Expr, object types.Object) bool {
	ident, ok := ast.Unparen(expression).(*ast.Ident)
	return ok && object != nil && info.Uses[ident] == object
}

func sameReceiverType(wrapper, target *types.Func) bool {
	targetReceiver := target.Signature().Recv()
	if targetReceiver == nil {
		return false
	}
	own := types.Unalias(support.Deref(wrapper.Signature().Recv().Type()))
	theirs := types.Unalias(support.Deref(targetReceiver.Type()))
	ownNamed, ownOk := own.(*types.Named)
	theirNamed, theirOk := theirs.(*types.Named)
	return ownOk && theirOk && ownNamed.Origin() == theirNamed.Origin() && target.Pkg() == wrapper.Pkg()
}

func localInterface(pkg *types.Package, method *types.Func) bool {
	receiver := support.Deref(method.Signature().Recv().Type())
	scope := pkg.Scope()
	for _, name := range scope.Names() {
		object, ok := scope.Lookup(name).(*types.TypeName)
		if !ok {
			continue
		}
		face, isInterface := object.Type().Underlying().(*types.Interface)
		if !isInterface || face.NumMethods() == 0 || !hasMethod(face, method.Name()) {
			continue
		}
		if types.Implements(receiver, face) || types.Implements(types.NewPointer(receiver), face) {
			return true
		}
	}
	return false
}

func hasMethod(face *types.Interface, name string) bool {
	for each := range face.Methods() {
		if each.Name() == name {
			return true
		}
	}
	return false
}
