package scope

import (
	"go/ast"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
)

type Kind int

const (
	Unknown Kind = iota
	Function
	Method
	Conversion
)

type Callee struct {
	Kind     Kind
	Func     *index.FuncInfo
	Member   index.Member
	Receiver ast.Expr
	Type     index.Ty
}

func unwrapGeneric(expression ast.Expr) ast.Expr {
	switch typed := expression.(type) {
	case *ast.IndexExpr:
		return typed.X
	case *ast.IndexListExpr:
		return typed.X
	case *ast.ParenExpr:
		return unwrapGeneric(typed.X)
	}
	return expression
}

func (e *Env) Callee(call *ast.CallExpr) Callee {
	switch fun := unwrapGeneric(call.Fun).(type) {
	case *ast.Ident:
		return e.identifierCallee(fun.Name, call)
	case *ast.SelectorExpr:
		return e.selectorCallee(fun)
	}
	return Callee{}
}

func (e *Env) identifierCallee(name string, call *ast.CallExpr) Callee {
	if e.Declared(name) {
		return Callee{}
	}
	if function := e.File.Pkg.Funcs[name]; function != nil && function.Decl.Body != nil {
		return Callee{Kind: Function, Func: function}
	}
	if project := e.File.Pkg.Types[name]; project != nil {
		return Callee{Kind: Conversion, Type: index.Ty{Expr: ast.NewIdent(name), File: e.File}}
	}
	if (name == "new" || name == "make") && len(call.Args) > 0 {
		return Callee{Kind: Conversion, Type: index.Ty{Expr: call.Args[0], File: e.File}}
	}
	return Callee{}
}

func (e *Env) selectorCallee(selector *ast.SelectorExpr) Callee {
	if qualifier, ok := selector.X.(*ast.Ident); ok && !e.Declared(qualifier.Name) {
		return e.packageCallee(qualifier.Name, selector.Sel.Name)
	}
	owner := e.TypeOf(selector.X).Project()
	if owner == nil {
		return Callee{}
	}
	member, found := e.Index.Method(owner, selector.Sel.Name)
	if !found || (member.Func != nil && member.Func.Decl.Body == nil) {
		return Callee{}
	}
	return Callee{Kind: Method, Member: member, Receiver: selector.X}
}

func (e *Env) packageCallee(alias, name string) Callee {
	dir, project := e.File.Imports[alias]
	if !project {
		if _, found := e.File.Pkg.Vars[alias]; found {
			return e.methodOnVariable(alias, name)
		}
		return Callee{}
	}
	target := e.Index.Packages[dir]
	if function := target.Funcs[name]; function != nil && function.Decl.Body != nil {
		return Callee{Kind: Function, Func: function}
	}
	if project := target.Types[name]; project != nil {
		qualified := &ast.SelectorExpr{X: ast.NewIdent(alias), Sel: ast.NewIdent(name)}
		return Callee{Kind: Conversion, Type: index.Ty{Expr: qualified, File: e.File}}
	}
	return Callee{}
}

func (e *Env) methodOnVariable(variable, name string) Callee {
	owner := e.identifierType(variable).Project()
	if owner == nil {
		return Callee{}
	}
	member, found := e.Index.Method(owner, name)
	if !found || (member.Func != nil && member.Func.Decl.Body == nil) {
		return Callee{}
	}
	return Callee{Kind: Method, Member: member, Receiver: ast.NewIdent(variable)}
}

func (c Callee) Target() string {
	switch c.Kind {
	case Function:
		return c.Func.ID()
	case Method:
		return c.Member.ID()
	}
	return ""
}

func (c Callee) Signature() *ast.FuncType {
	switch c.Kind {
	case Function:
		return c.Func.Decl.Type
	case Method:
		return c.Member.Sig
	}
	return nil
}

func (e *Env) FuncValue(expression ast.Expr) string {
	switch typed := expression.(type) {
	case *ast.ParenExpr:
		return e.FuncValue(typed.X)
	case *ast.Ident:
		if function := e.File.Pkg.Funcs[typed.Name]; function != nil && !e.Declared(typed.Name) && function.Decl.Body != nil {
			return function.ID()
		}
	case *ast.SelectorExpr:
		return e.selectorCallee(typed).Target()
	}
	return ""
}

func (e *Env) PackageVar(name string) *index.VarInfo {
	if e.Declared(name) {
		return nil
	}
	return e.File.Pkg.Vars[name]
}

func ForFile(file *index.FileCtx) *Env {
	return &Env{Index: file.Index, File: file, Vars: map[string]*Binding{}, Reassigned: map[string]int{}}
}
