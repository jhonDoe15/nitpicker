package design

import (
	"go/ast"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/calls"
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/chain"
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/scope"
	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/uses"
)

var frameworkMethods = map[string]bool{
	"String": true, "Error": true, "ServeHTTP": true, "MarshalJSON": true, "UnmarshalJSON": true,
	"MarshalText": true, "UnmarshalText": true, "Len": true, "Less": true, "Swap": true,
	"Unwrap": true, "Is": true, "As": true, "Format": true,
}

func hasExportDirective(declaration *ast.FuncDecl) bool {
	if declaration.Doc == nil {
		return false
	}
	for _, comment := range declaration.Doc.List {
		if strings.HasPrefix(comment.Text, "//export ") || strings.HasPrefix(comment.Text, "//go:linkname ") {
			return true
		}
	}
	return false
}

func isEntry(info *index.FuncInfo, h *hierarchy) bool {
	if info.Recv != nil {
		return frameworkMethods[info.Name] || h.implements[info.Recv][info.Name]
	}
	return (info.Name == "main" && info.File.Pkg.Name == "main") || hasExportDirective(info.Decl)
}

func signatureParams(signature *ast.FuncType, file *index.FileCtx) []Param {
	var params []Param
	if signature.Params == nil {
		return params
	}
	for _, field := range signature.Params.List {
		param := Param{}
		expression := field.Type
		if ellipsis, ok := field.Type.(*ast.Ellipsis); ok {
			param.Variadic = true
			expression = ellipsis.Elt
		}
		param.Type = index.Ty{Expr: expression, File: file}.Text()
		names := []string{"_"}
		if len(field.Names) > 0 {
			names = nil
			for _, name := range field.Names {
				names = append(names, name.Name)
			}
		}
		for _, name := range names {
			param.Name = name
			params = append(params, param)
		}
	}
	return params
}

func signatureReturns(signature *ast.FuncType, file *index.FileCtx) string {
	if signature.Results == nil {
		return ""
	}
	var texts []string
	for _, field := range signature.Results.List {
		for range max(1, len(field.Names)) {
			texts = append(texts, index.Ty{Expr: field.Type, File: file}.Text())
		}
	}
	if len(texts) == 1 || (len(texts) == 2 && texts[1] == "error") {
		return texts[0]
	}
	return "(" + strings.Join(texts, ",") + ")"
}

func ownerID(info *index.FuncInfo) string {
	if info.Recv != nil {
		return info.Recv.ID()
	}
	return info.File.Path
}

func functionFact(info *index.FuncInfo, h *hierarchy, known func(string) bool) Callable {
	kind, exported := "function", ast.IsExported(info.Name)
	if info.Recv != nil {
		kind, exported = "method", exported && ast.IsExported(info.Recv.Name)
	}
	env := scope.New(info.File, info)
	return Callable{
		ID: info.ID(), File: info.File.Path, Name: info.Name, Line: info.File.Line(info.Decl.Name.Pos()),
		Kind: kind, Exported: exported, Owner: ownerID(info), Entry: isEntry(info, h),
		Params:       signatureParams(info.Decl.Type, info.File),
		Returns:      signatureReturns(info.Decl.Type, info.File),
		Forward:      chain.Of(env, info.Decl, known),
		Calls:        calls.Collect(env, info.Decl.Body, known),
		ParamUses:    uses.Params(env, info.Decl, hasMembers, known),
		OwnFields:    uses.OwnFields(env, info),
		ReturnsField: returnedField(env, info),
		References:   uses.References(env, info.Decl.Body, known),
	}
}

func memberFact(member index.Member) Callable {
	file := member.Owner.File
	return Callable{
		ID: member.ID(), File: file.Path, Name: member.Name, Line: file.Line(member.Sig.Pos()), Kind: "method", Owner: member.Owner.ID(),
		Exported: ast.IsExported(member.Name) && ast.IsExported(member.Owner.Name),
		Params:   signatureParams(member.Sig, file), Returns: signatureReturns(member.Sig, file),
	}
}

func returnedField(env *scope.Env, info *index.FuncInfo) string {
	if info.Recv == nil || env.Receiver == "" || info.Decl.Body == nil {
		return ""
	}
	found := ""
	ast.Inspect(info.Decl.Body, func(node ast.Node) bool {
		if _, nested := node.(*ast.FuncLit); nested {
			return false
		}
		if statement, ok := node.(*ast.ReturnStmt); ok && found == "" {
			for _, value := range statement.Results {
				if name := ownField(env, info.Recv, value); name != "" && found == "" {
					found = name
				}
			}
		}
		return found == ""
	})
	return found
}

func ownField(env *scope.Env, owner *index.TypeInfo, expression ast.Expr) string {
	for {
		switch typed := expression.(type) {
		case *ast.ParenExpr:
			expression = typed.X
			continue
		case *ast.SliceExpr:
			expression = typed.X
			continue
		case *ast.SelectorExpr:
			base, ok := typed.X.(*ast.Ident)
			if !ok || base.Name != env.Receiver {
				return ""
			}
			for _, field := range owner.Fields() {
				if field.Name == typed.Sel.Name {
					return field.Name
				}
			}
		}
		return ""
	}
}

func hasMembers(info *index.TypeInfo) bool {
	kind := typeKind(info)
	return kind == "class" || kind == "data" || kind == "interface"
}
