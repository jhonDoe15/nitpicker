package resolvers

import (
	"go/ast"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var Analyzer = &analysis.Analyzer{
	Name:     "query_per_parent_resolver",
	Doc:      "reports a gqlgen field resolver of a list parent that queries once per parent without a dataloader",
	Requires: support.Requires,
	Run:      run,
}

const message = "this field resolver runs once per parent object and queries each time, so a list of N parents costs " +
	"N queries: load them through a dataloader (`Load`, `LoadMany`) batched per request, or read the data the " +
	"parent already carries. An exception fits only when the parent list is always tiny"

var rootResolvers = []string{"queryresolver", "mutationresolver", "subscriptionresolver"}

var loaderCalls = []string{"Load", "LoadMany", "LoadAll", "LoadThunk", "LoadManyThunk"}

func run(pass *analysis.Pass) (any, error) {
	if !usesGqlgen(pass.Pkg) {
		return nil, nil
	}
	lists := listParents(pass)
	for _, file := range pass.Files {
		for _, declaration := range file.Decls {
			function, ok := declaration.(*ast.FuncDecl)
			if !ok || function.Body == nil || support.InTestFile(pass, function) {
				continue
			}
			parent := fieldParent(pass.TypesInfo, function)
			if parent == nil || !lists[named(parent.Type())] {
				continue
			}
			if call := queryOf(pass.TypesInfo, function, parent); call != nil && !usesLoader(pass.TypesInfo, function) {
				pass.Reportf(call.Pos(), "%s", message)
			}
		}
	}
	return nil, nil
}

func usesGqlgen(pkg *types.Package) bool {
	return slices.ContainsFunc(pkg.Imports(), func(each *types.Package) bool {
		return strings.HasPrefix(each.Path()+"/", "github.com/99designs/gqlgen/") ||
			strings.HasSuffix(each.Path(), "/generated")
	})
}

func named(typ types.Type) types.Type {
	if result, ok := types.Unalias(support.Deref(typ)).(*types.Named); ok {
		return result
	}
	return nil
}

func fieldParent(info *types.Info, function *ast.FuncDecl) *types.Var {
	if function.Recv == nil || len(function.Recv.List) == 0 {
		return nil
	}
	receiver, ok := named(info.TypeOf(function.Recv.List[0].Type)).(*types.Named)
	if !ok || !strings.HasSuffix(receiver.Obj().Name(), "Resolver") ||
		slices.Contains(rootResolvers, strings.ToLower(receiver.Obj().Name())) {
		return nil
	}
	signature, isFunc := info.Defs[function.Name].Type().(*types.Signature)
	if !isFunc || signature.Params().Len() < 2 || !support.IsNamed(signature.Params().At(0).Type(), "context", "Context") {
		return nil
	}
	parent := signature.Params().At(1)
	if _, pointer := types.Unalias(parent.Type()).(*types.Pointer); !pointer || named(parent.Type()) == nil {
		return nil
	}
	return parent
}
