package index

import "go/ast"

const embeddingDepth = 4

type Member struct {
	Owner *TypeInfo
	Name  string
	Func  *FuncInfo
	Sig   *ast.FuncType
}

type Field struct {
	Owner    *TypeInfo
	Name     string
	Type     Ty
	Embedded bool
	Line     int
}

func (t *TypeInfo) ID() string {
	return t.File.Path + "#" + t.Name
}

func (f *FuncInfo) ID() string {
	if f.Recv != nil {
		return f.Recv.ID() + "." + f.Name
	}
	return f.File.Path + "#" + f.Name
}

func (m Member) ID() string {
	return m.Owner.ID() + "." + m.Name
}

func (m Member) File() *FileCtx {
	if m.Func != nil {
		return m.Func.File
	}
	return m.Owner.File
}

func (t *TypeInfo) Fields() []Field {
	structure, ok := t.Spec.Type.(*ast.StructType)
	if !ok || structure.Fields == nil {
		return nil
	}
	var fields []Field
	for _, field := range structure.Fields.List {
		ty := Ty{Expr: field.Type, File: t.File}
		if len(field.Names) == 0 {
			fields = append(fields, Field{Owner: t, Name: ReceiverName(field.Type), Type: ty, Embedded: true, Line: t.File.Line(field.Pos())})
		}
		for _, name := range field.Names {
			fields = append(fields, Field{Owner: t, Name: name.Name, Type: ty, Line: t.File.Line(name.Pos())})
		}
	}
	return fields
}

func (t *TypeInfo) IsInterface() bool {
	_, ok := t.Spec.Type.(*ast.InterfaceType)
	return ok
}

func (t *TypeInfo) InterfaceMethods() []Member {
	contract, ok := t.Spec.Type.(*ast.InterfaceType)
	if !ok || contract.Methods == nil {
		return nil
	}
	var members []Member
	for _, method := range contract.Methods.List {
		signature, ok := method.Type.(*ast.FuncType)
		if !ok {
			continue
		}
		for _, name := range method.Names {
			members = append(members, Member{Owner: t, Name: name.Name, Sig: signature})
		}
	}
	return members
}

func (t *TypeInfo) Embedded() []*TypeInfo {
	var parents []*TypeInfo
	switch typed := t.Spec.Type.(type) {
	case *ast.StructType:
		for _, field := range t.Fields() {
			if parent := field.Type.Project(); field.Embedded && parent != nil {
				parents = append(parents, parent)
			}
		}
	case *ast.InterfaceType:
		for _, method := range typed.Methods.List {
			if parent := (Ty{Expr: method.Type, File: t.File}).Project(); len(method.Names) == 0 && parent != nil {
				parents = append(parents, parent)
			}
		}
	}
	return parents
}

func (x *Index) Method(t *TypeInfo, name string) (Member, bool) {
	return x.method(t, name, embeddingDepth)
}

func (x *Index) method(t *TypeInfo, name string, depth int) (Member, bool) {
	if function := t.Methods[name]; function != nil {
		return Member{Owner: t, Name: name, Func: function, Sig: function.Decl.Type}, true
	}
	for _, member := range t.InterfaceMethods() {
		if member.Name == name {
			return member, true
		}
	}
	if depth == 0 {
		return Member{}, false
	}
	for _, parent := range t.Embedded() {
		if member, found := x.method(parent, name, depth-1); found {
			return member, true
		}
	}
	return Member{}, false
}

func (x *Index) Field(t *TypeInfo, name string) (Field, bool) {
	return x.field(t, name, embeddingDepth)
}

func (x *Index) field(t *TypeInfo, name string, depth int) (Field, bool) {
	for _, field := range t.Fields() {
		if field.Name == name {
			return field, true
		}
	}
	if depth == 0 {
		return Field{}, false
	}
	for _, parent := range t.Embedded() {
		if field, found := x.field(parent, name, depth-1); found {
			return field, true
		}
	}
	return Field{}, false
}
