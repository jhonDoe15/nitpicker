package design

import (
	"go/ast"
	"path"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
)

func typeKind(info *index.TypeInfo) string {
	switch info.Spec.Type.(type) {
	case *ast.InterfaceType:
		return "interface"
	case *ast.StructType:
		if len(info.Methods) == 0 {
			return "data"
		}
		return "class"
	}
	switch {
	case len(info.Cases) > 0:
		return "enum"
	case len(info.Methods) > 0:
		return "class"
	}
	return ""
}

func typeFact(info *index.TypeInfo, h *hierarchy) (Type, bool) {
	kind := typeKind(info)
	if kind == "" {
		return Type{}, false
	}
	fact := Type{
		ID: info.ID(), File: info.File.Path, Name: info.Name, Line: info.File.Line(info.Spec.Name.Pos()),
		Kind: kind, Exported: ast.IsExported(info.Name),
	}
	if kind == "enum" {
		fact.Cases = info.Cases
	}
	for _, field := range info.Fields() {
		fact.Fields = append(fact.Fields, fieldFact(field))
	}
	for _, parent := range h.supertypes[info] {
		fact.Supertypes = append(fact.Supertypes, parent.ID())
	}
	return fact, true
}

func fieldFact(field index.Field) Field {
	return Field{Name: field.Name, Mutable: field.Type.IsReference(), Private: !ast.IsExported(field.Name)}
}

func moduleFact(file *index.FileCtx) Type {
	name := path.Base(file.Path)
	fact := Type{
		ID: file.Path, File: file.Path, Name: strings.TrimSuffix(name, path.Ext(name)),
		Line: 1, Kind: "module", Exported: true,
	}
	for _, declaration := range file.Syntax.Decls {
		general, ok := declaration.(*ast.GenDecl)
		if !ok || general.Tok.String() != "var" {
			continue
		}
		for _, spec := range general.Specs {
			fact.Fields = append(fact.Fields, variableFields(file, spec.(*ast.ValueSpec))...)
		}
	}
	return fact
}

func variableFields(file *index.FileCtx, spec *ast.ValueSpec) []Field {
	var fields []Field
	for _, name := range spec.Names {
		if name.Name == "_" {
			continue
		}
		fields = append(fields, Field{
			Name: name.Name, Private: !ast.IsExported(name.Name), Mutable: variableIsMutable(file, spec),
		})
	}
	return fields
}

func variableIsMutable(file *index.FileCtx, spec *ast.ValueSpec) bool {
	if spec.Type != nil {
		return index.Ty{Expr: spec.Type, File: file}.IsReference()
	}
	for _, value := range spec.Values {
		if composite, ok := unaddressed(value).(*ast.CompositeLit); ok && composite.Type != nil {
			return index.Ty{Expr: composite.Type, File: file}.IsReference() || isAddressed(value)
		}
	}
	return false
}

func unaddressed(expression ast.Expr) ast.Expr {
	if unary, ok := expression.(*ast.UnaryExpr); ok {
		return unary.X
	}
	return expression
}

func isAddressed(expression ast.Expr) bool {
	_, ok := expression.(*ast.UnaryExpr)
	return ok
}
