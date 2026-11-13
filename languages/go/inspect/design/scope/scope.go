package scope

import (
	"go/ast"
	"go/token"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
)

type Binding struct {
	Ty       index.Ty
	Param    int
	Count    int
	Receiver bool
}

type Env struct {
	Index      *index.Index
	File       *index.FileCtx
	Decl       *ast.FuncDecl
	Owner      *index.TypeInfo
	Receiver   string
	Vars       map[string]*Binding
	Reassigned map[string]int
	depth      int
}

func New(file *index.FileCtx, function *index.FuncInfo) *Env {
	env := &Env{
		Index: file.Index, File: file, Decl: function.Decl, Owner: function.Recv,
		Vars: map[string]*Binding{}, Reassigned: map[string]int{},
	}
	if function.Decl.Recv != nil && len(function.Decl.Recv.List) > 0 {
		receiver := function.Decl.Recv.List[0]
		for _, name := range receiver.Names {
			env.Receiver = name.Name
			env.bind(name.Name, index.Ty{Expr: receiver.Type, File: file}, -1).Receiver = true
		}
	}
	env.bindFields(function.Decl.Type.Params, true)
	env.bindFields(function.Decl.Type.Results, false)
	if function.Decl.Body != nil {
		env.collect(function.Decl.Body)
	}
	return env
}

func (e *Env) bind(name string, ty index.Ty, param int) *Binding {
	if name == "_" {
		return &Binding{}
	}
	existing := e.Vars[name]
	if existing == nil {
		e.Vars[name] = &Binding{Ty: ty, Param: param, Count: 1}
		return e.Vars[name]
	}
	existing.Count++
	if existing.Ty.Text() != ty.Text() || !ty.Known() {
		existing.Ty = index.Ty{}
	}
	return existing
}

func (e *Env) bindFields(list *ast.FieldList, params bool) {
	if list == nil {
		return
	}
	position := 0
	for _, field := range list.List {
		ty := index.Ty{Expr: field.Type, File: e.File}
		if ellipsis, ok := field.Type.(*ast.Ellipsis); ok {
			ty = index.Ty{Expr: &ast.ArrayType{Elt: ellipsis.Elt}, File: e.File}
		}
		for _, name := range field.Names {
			index := -1
			if params {
				index = position
			}
			e.bind(name.Name, ty, index)
			position++
		}
		if len(field.Names) == 0 {
			position++
		}
	}
}

func (e *Env) Lookup(name string) *Binding {
	binding := e.Vars[name]
	if binding == nil || !binding.Ty.Known() {
		return nil
	}
	return binding
}

func (e *Env) Declared(name string) bool {
	_, found := e.Vars[name]
	return found
}

func (e *Env) collect(body ast.Node) {
	ast.Inspect(body, func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.FuncLit:
			e.bindFields(typed.Type.Params, false)
			e.bindFields(typed.Type.Results, false)
		case *ast.AssignStmt:
			e.assignment(typed)
		case *ast.IncDecStmt:
			e.reassign(typed.X)
		case *ast.DeclStmt:
			e.declaration(typed)
		case *ast.RangeStmt:
			e.ranged(typed)
		case *ast.TypeSwitchStmt:
			e.typeSwitch(typed)
		}
		return true
	})
}

func (e *Env) reassign(target ast.Expr) {
	if identifier, ok := target.(*ast.Ident); ok {
		e.Reassigned[identifier.Name]++
	}
}

func (e *Env) assignment(statement *ast.AssignStmt) {
	if statement.Tok != token.DEFINE {
		for _, target := range statement.Lhs {
			e.reassign(target)
		}
		return
	}
	types := e.resultTypes(statement.Rhs, len(statement.Lhs))
	for position, target := range statement.Lhs {
		identifier, ok := target.(*ast.Ident)
		if !ok {
			continue
		}
		if identifier.Obj != nil && identifier.Obj.Decl != statement {
			e.reassign(identifier)
			continue
		}
		e.bind(identifier.Name, types[position], -1)
	}
}

func (e *Env) resultTypes(values []ast.Expr, count int) []index.Ty {
	types := make([]index.Ty, count)
	switch {
	case len(values) == count:
		for position, value := range values {
			types[position] = e.TypeOf(value)
		}
	case len(values) == 1:
		copy(types, e.Results(values[0]))
	}
	return types
}

func (e *Env) declaration(statement *ast.DeclStmt) {
	general, ok := statement.Decl.(*ast.GenDecl)
	if !ok || general.Tok != token.VAR {
		return
	}
	for _, spec := range general.Specs {
		value := spec.(*ast.ValueSpec)
		types := e.resultTypes(value.Values, len(value.Names))
		for position, name := range value.Names {
			ty := types[position]
			if value.Type != nil {
				ty = index.Ty{Expr: value.Type, File: e.File}
			}
			e.bind(name.Name, ty, -1)
		}
	}
}

func (e *Env) ranged(statement *ast.RangeStmt) {
	if statement.Tok != token.DEFINE {
		return
	}
	element := e.TypeOf(statement.X).Elem()
	if value, ok := statement.Value.(*ast.Ident); ok {
		e.bind(value.Name, element, -1)
	}
	if key, ok := statement.Key.(*ast.Ident); ok {
		e.bind(key.Name, index.Ty{}, -1)
	}
}

func (e *Env) typeSwitch(statement *ast.TypeSwitchStmt) {
	assign, ok := statement.Assign.(*ast.AssignStmt)
	if !ok || len(assign.Lhs) != 1 {
		return
	}
	if identifier, ok := assign.Lhs[0].(*ast.Ident); ok {
		binding := e.bind(identifier.Name, index.Ty{}, -1)
		binding.Ty = index.Ty{}
		binding.Count++
	}
}
