package copies

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

type contract struct{}

func (*contract) AFact() {}

func (*contract) String() string { return "contract" }

type candidate struct {
	object *types.Const
	name   string
	owner  string
	own    bool
}

type candidates []candidate

func exportContracts(pass *analysis.Pass) {
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) || ast.IsGenerated(file) {
			continue
		}
		for _, declaration := range file.Decls {
			group, ok := declaration.(*ast.GenDecl)
			if !ok || group.Tok != token.CONST || usesIota(pass.TypesInfo, group) {
				continue
			}
			exportGroup(pass, group)
		}
	}
}

func exportGroup(pass *analysis.Pass, group *ast.GenDecl) {
	for _, spec := range group.Specs {
		for _, name := range spec.(*ast.ValueSpec).Names {
			if object, ok := pass.TypesInfo.Defs[name].(*types.Const); ok && name.Name != "_" {
				pass.ExportObjectFact(object, new(contract))
			}
		}
	}
}

func usesIota(info *types.Info, group *ast.GenDecl) bool {
	found := false
	for _, spec := range group.Specs {
		for _, value := range spec.(*ast.ValueSpec).Values {
			ast.Inspect(value, func(node ast.Node) bool {
				ident, ok := node.(*ast.Ident)
				if ok && ident.Name == "iota" && info.Uses[ident] == types.Universe.Lookup("iota") {
					found = true
				}
				return !found
			})
		}
	}
	return found
}

func visibleContracts(pass *analysis.Pass, file *ast.File) candidates {
	var found candidates
	scope := pass.Pkg.Scope()
	for _, name := range scope.Names() {
		if object, ok := scope.Lookup(name).(*types.Const); ok && pass.ImportObjectFact(object, new(contract)) {
			found = append(found, candidate{object: object, name: name, owner: pass.Pkg.Path(), own: true})
		}
	}
	for _, imported := range moduleImports(pass, file) {
		found = append(found, exported(pass, imported)...)
	}
	return found
}

func moduleImports(pass *analysis.Pass, file *ast.File) []*types.PkgName {
	var found []*types.PkgName
	for _, spec := range file.Imports {
		name := pass.TypesInfo.PkgNameOf(spec)
		if name != nil && name.Name() != "_" && name.Name() != "." && inModule(pass, name.Imported().Path()) {
			found = append(found, name)
		}
	}
	return found
}

func inModule(pass *analysis.Pass, path string) bool {
	if pass.Module == nil || pass.Module.Path == "" {
		return false
	}
	return path == pass.Module.Path || strings.HasPrefix(path, pass.Module.Path+"/")
}

func exported(pass *analysis.Pass, imported *types.PkgName) candidates {
	var found candidates
	scope := imported.Imported().Scope()
	for _, name := range scope.Names() {
		object, ok := scope.Lookup(name).(*types.Const)
		if ok && object.Exported() && pass.ImportObjectFact(object, new(contract)) {
			found = append(found, candidate{object: object, name: imported.Name() + "." + name, owner: imported.Imported().Path()})
		}
	}
	return found
}

func (all candidates) matching(value constant.Value) candidates {
	var found candidates
	for _, each := range all {
		other := each.object.Val()
		if sameKind(value, other) && constant.Compare(value, token.EQL, other) {
			found = append(found, each)
		}
	}
	slices.SortStableFunc(found, func(left, right candidate) int {
		if left.own != right.own {
			if left.own {
				return -1
			}
			return 1
		}
		return strings.Compare(left.owner+"\x00"+left.name, right.owner+"\x00"+right.name)
	})
	return found
}

func sameKind(left, right constant.Value) bool {
	isString := func(value constant.Value) bool { return value.Kind() == constant.String }
	numeric := func(value constant.Value) bool {
		return value.Kind() == constant.Int || value.Kind() == constant.Float
	}
	return isString(left) && isString(right) || numeric(left) && numeric(right)
}
