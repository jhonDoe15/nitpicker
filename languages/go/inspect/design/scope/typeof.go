package scope

import (
	"go/ast"
	"go/token"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
)

const typingDepth = 6

func (e *Env) TypeOf(expression ast.Expr) index.Ty {
	if e.depth > typingDepth {
		return index.Ty{}
	}
	e.depth++
	defer func() { e.depth-- }()
	switch typed := expression.(type) {
	case *ast.ParenExpr:
		return e.TypeOf(typed.X)
	case *ast.Ident:
		return e.identifierType(typed.Name)
	case *ast.StarExpr:
		return e.TypeOf(typed.X)
	case *ast.UnaryExpr:
		if typed.Op == token.AND {
			return e.TypeOf(typed.X)
		}
	case *ast.CompositeLit:
		if typed.Type != nil {
			return index.Ty{Expr: typed.Type, File: e.File}
		}
	case *ast.CallExpr:
		if results := e.Results(typed); len(results) == 1 {
			return results[0]
		}
	case *ast.SelectorExpr:
		return e.selectorType(typed)
	case *ast.IndexExpr:
		return e.TypeOf(typed.X).Elem()
	case *ast.SliceExpr:
		return e.TypeOf(typed.X)
	case *ast.TypeAssertExpr:
		if typed.Type != nil {
			return index.Ty{Expr: typed.Type, File: e.File}
		}
	}
	return index.Ty{}
}

func (e *Env) identifierType(name string) index.Ty {
	if e.Declared(name) {
		if binding := e.Lookup(name); binding != nil {
			return binding.Ty
		}
		return index.Ty{}
	}
	variable := e.File.Pkg.Vars[name]
	if variable == nil || variable.Const {
		return index.Ty{}
	}
	if variable.Spec.Type != nil {
		return index.Ty{Expr: variable.Spec.Type, File: variable.File}
	}
	if len(variable.Spec.Values) != len(variable.Spec.Names) {
		return index.Ty{}
	}
	scope := &Env{Index: e.Index, File: variable.File, Vars: map[string]*Binding{}, depth: e.depth}
	return scope.TypeOf(variable.Spec.Values[variable.Slot])
}

func (e *Env) selectorType(selector *ast.SelectorExpr) index.Ty {
	owner := e.TypeOf(selector.X).Project()
	if owner == nil {
		return index.Ty{}
	}
	field, found := e.Index.Field(owner, selector.Sel.Name)
	if !found {
		return index.Ty{}
	}
	return field.Type
}

func (e *Env) Results(expression ast.Expr) []index.Ty {
	switch typed := expression.(type) {
	case *ast.ParenExpr:
		return e.Results(typed.X)
	case *ast.TypeAssertExpr:
		return []index.Ty{e.TypeOf(typed), {}}
	case *ast.IndexExpr:
		return []index.Ty{e.TypeOf(typed), {}}
	case *ast.CallExpr:
		return e.callResults(typed)
	}
	return []index.Ty{e.TypeOf(expression)}
}

func (e *Env) callResults(call *ast.CallExpr) []index.Ty {
	callee := e.Callee(call)
	switch callee.Kind {
	case Conversion:
		return []index.Ty{callee.Type}
	case Function:
		return signatureResults(callee.Func.Decl.Type, callee.Func.File)
	case Method:
		return signatureResults(callee.Member.Sig, callee.Member.File())
	}
	return nil
}

func signatureResults(signature *ast.FuncType, file *index.FileCtx) []index.Ty {
	var results []index.Ty
	if signature.Results == nil {
		return results
	}
	for _, field := range signature.Results.List {
		for range max(1, len(field.Names)) {
			results = append(results, index.Ty{Expr: field.Type, File: file})
		}
	}
	return results
}
