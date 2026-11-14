package index

import (
	"go/ast"
	"go/types"
	"strings"
)

type Ty struct {
	Expr ast.Expr
	File *FileCtx
}

func (t Ty) Known() bool {
	return t.Expr != nil && t.File != nil
}

func strip(expression ast.Expr) ast.Expr {
	for {
		switch typed := expression.(type) {
		case *ast.ParenExpr:
			expression = typed.X
		case *ast.StarExpr:
			expression = typed.X
		case *ast.IndexExpr:
			expression = typed.X
		case *ast.IndexListExpr:
			expression = typed.X
		case *ast.Ellipsis:
			expression = typed.Elt
		default:
			return expression
		}
	}
}

func (t Ty) Project() *TypeInfo {
	if !t.Known() {
		return nil
	}
	switch typed := strip(t.Expr).(type) {
	case *ast.Ident:
		return t.File.Pkg.Types[typed.Name]
	case *ast.SelectorExpr:
		qualifier, ok := typed.X.(*ast.Ident)
		if !ok {
			return nil
		}
		dir, project := t.File.Imports[qualifier.Name]
		if !project {
			return nil
		}
		return t.File.Index.Packages[dir].Types[typed.Sel.Name]
	}
	return nil
}

func (t Ty) Underlying() Ty {
	if project := t.Project(); project != nil {
		return Ty{Expr: project.Spec.Type, File: project.File}
	}
	return t
}

func (t Ty) IsPointer() bool {
	for {
		switch typed := t.Expr.(type) {
		case *ast.ParenExpr:
			t.Expr = typed.X
		case *ast.StarExpr:
			return true
		default:
			return false
		}
	}
}

func (t Ty) Elem() Ty {
	under := t.Underlying()
	if !under.Known() {
		return Ty{}
	}
	switch typed := stripPointer(under.Expr).(type) {
	case *ast.ArrayType:
		return Ty{Expr: typed.Elt, File: under.File}
	case *ast.MapType:
		return Ty{Expr: typed.Value, File: under.File}
	case *ast.ChanType:
		return Ty{Expr: typed.Value, File: under.File}
	case *ast.Ellipsis:
		return Ty{Expr: typed.Elt, File: under.File}
	}
	return Ty{}
}

func stripPointer(expression ast.Expr) ast.Expr {
	for {
		switch typed := expression.(type) {
		case *ast.ParenExpr:
			expression = typed.X
		case *ast.StarExpr:
			expression = typed.X
		default:
			return expression
		}
	}
}

func (t Ty) IsReference() bool {
	if t.IsPointer() {
		return true
	}
	under := t.Underlying()
	if !under.Known() {
		return false
	}
	switch typed := under.Expr.(type) {
	case *ast.StarExpr, *ast.MapType:
		return true
	case *ast.ArrayType:
		return typed.Len == nil
	}
	return false
}

func (t Ty) Text() string {
	if !t.Known() {
		return ""
	}
	if project := t.Project(); project != nil {
		return project.ID()
	}
	return strings.Join(strings.Fields(types.ExprString(t.Expr)), "")
}
