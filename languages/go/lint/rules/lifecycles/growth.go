package lifecycles

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var growthAnalyzer = &analysis.Analyzer{
	Name:     "map_only_grows",
	Doc:      "reports a map field of a shared struct that is written to and never deleted from",
	Requires: support.Requires,
	Run:      runGrowth,
}

const growthMessage = "%s only gains entries (written in %s), so memory grows for the life of the process: " +
	"`delete` the entry when its request, session or run ends, bound the map (check `len` before the write), " +
	"or use a cache with eviction. An exception fits only for a registry filled at startup"

type growth struct {
	field  *types.Var
	writer string
	pos    token.Pos
}

func runGrowth(pass *analysis.Pass) (any, error) {
	shared := sharedFields(pass)
	loaders := startupCallers(pass)
	writes := map[*types.Var]growth{}
	removed := map[*types.Var]bool{}
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil)) {
		declaration := cursor.Node().(*ast.FuncDecl)
		if declaration.Body == nil || support.InTestFile(pass, declaration) {
			continue
		}
		collect(pass, declaration, shared, writes, removed, loaders)
	}
	for field, found := range writes {
		if !removed[field] {
			pass.Reportf(field.Pos(), growthMessage, field.Name(), found.writer+"()")
		}
	}
	return nil, nil
}

func sharedFields(pass *analysis.Pass) map[*types.Var]bool {
	shared := map[*types.Var]bool{}
	for cursor := range support.Root(pass).Preorder((*ast.TypeSpec)(nil)) {
		spec := cursor.Node().(*ast.TypeSpec)
		structure, ok := spec.Type.(*ast.StructType)
		if !ok || !hasMutex(pass, structure) {
			continue
		}
		for _, field := range structure.Fields.List {
			if _, isMap := pass.TypesInfo.TypeOf(field.Type).Underlying().(*types.Map); !isMap {
				continue
			}
			for _, name := range field.Names {
				if variable, ok := pass.TypesInfo.Defs[name].(*types.Var); ok {
					shared[variable] = true
				}
			}
		}
	}
	return shared
}

func hasMutex(pass *analysis.Pass, structure *ast.StructType) bool {
	for _, field := range structure.Fields.List {
		typ := support.Deref(pass.TypesInfo.TypeOf(field.Type))
		if support.IsNamed(typ, "sync", "Mutex") || support.IsNamed(typ, "sync", "RWMutex") {
			return true
		}
	}
	return false
}

func fieldOf(pass *analysis.Pass, expression ast.Expr, shared map[*types.Var]bool) *types.Var {
	selector, ok := ast.Unparen(expression).(*ast.SelectorExpr)
	if !ok {
		return nil
	}
	variable, _ := pass.TypesInfo.Uses[selector.Sel].(*types.Var)
	if variable == nil || !shared[variable] {
		return nil
	}
	return variable
}

var startupPrefixes = []string{"New", "new", "init", "Init", "register", "Register", "setup", "Setup"}

var loaderPrefixes = []string{"load", "Load"}

func hasPrefix(name string, prefixes []string) bool {
	for _, prefix := range prefixes {
		if strings.HasPrefix(name, prefix) {
			return true
		}
	}
	return false
}

func startupCallers(pass *analysis.Pass) map[string]bool {
	callers := map[string][]string{}
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil)) {
		declaration := cursor.Node().(*ast.FuncDecl)
		if declaration.Body == nil {
			continue
		}
		ast.Inspect(declaration.Body, func(node ast.Node) bool {
			if call, ok := node.(*ast.CallExpr); ok {
				if callee := calleeOf(pass, call); callee != nil {
					callers[callee.Name()] = append(callers[callee.Name()], declaration.Name.Name)
				}
			}
			return true
		})
	}
	loaders := map[string]bool{}
	for name, from := range callers {
		loaders[name] = hasPrefix(name, loaderPrefixes) && onlyStartup(from)
	}
	return loaders
}

func onlyStartup(names []string) bool {
	for _, name := range names {
		if !hasPrefix(name, startupPrefixes) {
			return false
		}
	}
	return true
}

func aliasesIn(pass *analysis.Pass, body *ast.BlockStmt, shared map[*types.Var]bool) map[types.Object]*types.Var {
	aliases := map[types.Object]*types.Var{}
	ast.Inspect(body, func(node ast.Node) bool {
		assign, ok := node.(*ast.AssignStmt)
		if !ok || len(assign.Lhs) != len(assign.Rhs) {
			return true
		}
		for index, right := range assign.Rhs {
			if field := fieldOf(pass, right, shared); field != nil {
				if object := objectOf(pass, assign.Lhs[index]); object != nil {
					aliases[object] = field
				}
			}
		}
		return true
	})
	return aliases
}

func collect(pass *analysis.Pass, declaration *ast.FuncDecl, shared map[*types.Var]bool,
	writes map[*types.Var]growth, removed map[*types.Var]bool, loaders map[string]bool) {
	name := declaration.Name.Name
	aliases := aliasesIn(pass, declaration.Body, shared)
	resolve := func(expression ast.Expr) *types.Var {
		if identifier, ok := ast.Unparen(expression).(*ast.Ident); ok {
			if field := aliases[pass.TypesInfo.Uses[identifier]]; field != nil {
				return field
			}
		}
		return fieldOf(pass, expression, shared)
	}
	skipped := hasPrefix(name, startupPrefixes) || loaders[name]
	write := func(target ast.Expr) {
		index, ok := target.(*ast.IndexExpr)
		if !ok {
			return
		}
		if field := resolve(index.X); field != nil && !skipped && !literalKey(pass, index.Index) {
			writes[field] = growth{field: field, writer: name, pos: index.Pos()}
		}
	}
	ast.Inspect(declaration.Body, func(node ast.Node) bool {
		switch value := node.(type) {
		case *ast.AssignStmt:
			for _, left := range value.Lhs {
				write(left)
				if _, indexed := left.(*ast.IndexExpr); !indexed && resolve(left) != nil && !skipped {
					removed[resolve(left)] = true
				}
			}
		case *ast.IncDecStmt:
			write(value.X)
		case *ast.IfStmt:
			markBounded(pass, value.Cond, resolve, removed)
		case *ast.CallExpr:
			markRemoved(pass, value, resolve, removed)
		}
		return true
	})
}

var inspectingPackages = map[string]bool{
	"encoding/json": true, "fmt": true, "log": true, "log/slog": true, "reflect": true, "slices": true, "sort": true,
}

func inspecting(pass *analysis.Pass, call *ast.CallExpr) bool {
	for _, name := range []string{"len", "cap", "append", "copy"} {
		if support.IsBuiltin(pass.TypesInfo, call, name) {
			return true
		}
	}
	callee := calleeOf(pass, call)
	if callee == nil || callee.Pkg() == nil {
		return false
	}
	if callee.Pkg().Path() == "maps" {
		return callee.Name() != "DeleteFunc"
	}
	return inspectingPackages[callee.Pkg().Path()]
}

func markBounded(pass *analysis.Pass, condition ast.Expr, resolve func(ast.Expr) *types.Var,
	removed map[*types.Var]bool) {
	ast.Inspect(condition, func(node ast.Node) bool {
		call, ok := node.(*ast.CallExpr)
		if ok && support.IsBuiltin(pass.TypesInfo, call, "len") && len(call.Args) == 1 {
			if field := resolve(call.Args[0]); field != nil {
				removed[field] = true
			}
		}
		return true
	})
}

func markRemoved(pass *analysis.Pass, call *ast.CallExpr, resolve func(ast.Expr) *types.Var, removed map[*types.Var]bool) {
	if inspecting(pass, call) {
		return
	}
	for _, argument := range call.Args {
		if field := resolve(argument); field != nil {
			removed[field] = true
		}
	}
}

func literalKey(pass *analysis.Pass, key ast.Expr) bool {
	known := pass.TypesInfo.Types[key]
	return known.Value != nil
}
