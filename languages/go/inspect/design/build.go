package design

import (
	"go/ast"

	"github.com/jhonDoe15/nitpicker/languages/go/inspect/design/index"
)

type Source = index.Source

func Build(module string, sources []Source) Facts {
	x := index.New(module, sources)
	functions, members := declared(x)
	known := map[string]bool{}
	for _, function := range functions {
		known[function.ID()] = true
	}
	for _, member := range members {
		known[member.ID()] = true
	}
	isKnown := func(id string) bool { return known[id] }
	facts := Facts{Types: []Type{}, Callables: []Callable{}}
	modules := map[*index.FileCtx]bool{}
	for _, function := range functions {
		if function.Recv == nil && !modules[function.File] {
			modules[function.File] = true
			facts.Types = append(facts.Types, moduleFact(function.File))
		}
	}
	for _, file := range x.Files {
		for _, info := range file.Pkg.Order {
			if info.File != file {
				continue
			}
			if fact, ok := typeFact(info); ok {
				facts.Types = append(facts.Types, fact)
			}
		}
	}
	for _, function := range functions {
		facts.Callables = append(facts.Callables, functionFact(function, isKnown))
	}
	for _, member := range members {
		facts.Callables = append(facts.Callables, memberFact(member))
	}
	return facts
}

func declared(x *index.Index) ([]*index.FuncInfo, []index.Member) {
	var functions []*index.FuncInfo
	var members []index.Member
	for _, file := range x.Files {
		for _, declaration := range file.Syntax.Decls {
			if function := declaredFunction(file, declaration); function != nil {
				functions = append(functions, function)
			}
		}
		for _, info := range file.Pkg.Order {
			if info.File == file && typeKind(info) == "interface" {
				members = append(members, info.InterfaceMethods()...)
			}
		}
	}
	return functions, members
}

func declaredFunction(file *index.FileCtx, declaration ast.Decl) *index.FuncInfo {
	function, ok := declaration.(*ast.FuncDecl)
	if !ok || function.Body == nil {
		return nil
	}
	if function.Recv == nil {
		if info := file.Pkg.Funcs[function.Name.Name]; info != nil && info.Decl == function {
			return info
		}
		return nil
	}
	if len(function.Recv.List) == 0 {
		return nil
	}
	owner := file.Pkg.Types[index.ReceiverName(function.Recv.List[0].Type)]
	if owner == nil || typeKind(owner) == "" {
		return nil
	}
	if info := owner.Methods[function.Name.Name]; info != nil && info.Decl == function {
		return info
	}
	return nil
}
