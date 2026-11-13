package index

import (
	"go/ast"
	"go/token"
	"path"
	"strconv"
	"strings"
)

type Source struct {
	Path   string
	Syntax *ast.File
	Set    *token.FileSet
}

type Index struct {
	Module   string
	Packages map[string]*Package
	Files    []*FileCtx
}

type Package struct {
	Dir   string
	Name  string
	Files []*FileCtx
	Types map[string]*TypeInfo
	Funcs map[string]*FuncInfo
	Vars  map[string]*VarInfo
	Order []*TypeInfo
}

type FileCtx struct {
	Path    string
	Dir     string
	Syntax  *ast.File
	Set     *token.FileSet
	Index   *Index
	Pkg     *Package
	Imports map[string]string
	Paths   map[string]string
}

type TypeInfo struct {
	Name    string
	File    *FileCtx
	Spec    *ast.TypeSpec
	Methods map[string]*FuncInfo
	Cases   []string
}

type FuncInfo struct {
	Name string
	File *FileCtx
	Decl *ast.FuncDecl
	Recv *TypeInfo
}

type VarInfo struct {
	Name  string
	File  *FileCtx
	Spec  *ast.ValueSpec
	Slot  int
	Const bool
}

func directoryOf(file string) string {
	dir := path.Dir(file)
	if dir == "." {
		return ""
	}
	return dir
}

func New(module string, sources []Source) *Index {
	x := &Index{Module: module, Packages: map[string]*Package{}}
	for _, source := range sources {
		x.addFile(source)
	}
	for _, file := range x.Files {
		file.declare()
	}
	for _, file := range x.Files {
		file.attachMethods()
		x.resolveImports(file)
	}
	for _, pkg := range x.Packages {
		pkg.collectCases()
	}
	return x
}

func (x *Index) addFile(source Source) {
	dir := directoryOf(source.Path)
	pkg := x.Packages[dir]
	if pkg == nil {
		pkg = &Package{
			Dir: dir, Name: source.Syntax.Name.Name,
			Types: map[string]*TypeInfo{}, Funcs: map[string]*FuncInfo{}, Vars: map[string]*VarInfo{},
		}
		x.Packages[dir] = pkg
	}
	file := &FileCtx{
		Path: source.Path, Dir: dir, Syntax: source.Syntax, Set: source.Set, Index: x, Pkg: pkg,
		Imports: map[string]string{}, Paths: map[string]string{},
	}
	pkg.Files = append(pkg.Files, file)
	x.Files = append(x.Files, file)
}

func (file *FileCtx) declare() {
	for _, declaration := range file.Syntax.Decls {
		switch typed := declaration.(type) {
		case *ast.FuncDecl:
			if typed.Recv == nil && typed.Name.Name != "_" && typed.Name.Name != "init" {
				file.Pkg.Funcs[typed.Name.Name] = &FuncInfo{Name: typed.Name.Name, File: file, Decl: typed}
			}
		case *ast.GenDecl:
			file.declareGeneral(typed)
		}
	}
}

func (file *FileCtx) declareGeneral(declaration *ast.GenDecl) {
	for _, spec := range declaration.Specs {
		switch typed := spec.(type) {
		case *ast.TypeSpec:
			if !typed.Assign.IsValid() && typed.Name.Name != "_" {
				info := &TypeInfo{Name: typed.Name.Name, File: file, Spec: typed, Methods: map[string]*FuncInfo{}}
				file.Pkg.Types[info.Name] = info
				file.Pkg.Order = append(file.Pkg.Order, info)
			}
		case *ast.ValueSpec:
			for slot, name := range typed.Names {
				if name.Name != "_" {
					file.Pkg.Vars[name.Name] = &VarInfo{
						Name: name.Name, File: file, Spec: typed, Slot: slot, Const: declaration.Tok == token.CONST,
					}
				}
			}
		}
	}
}

func (file *FileCtx) attachMethods() {
	for _, declaration := range file.Syntax.Decls {
		function, ok := declaration.(*ast.FuncDecl)
		if !ok || function.Recv == nil || len(function.Recv.List) == 0 {
			continue
		}
		owner := file.Pkg.Types[ReceiverName(function.Recv.List[0].Type)]
		if owner != nil {
			owner.Methods[function.Name.Name] = &FuncInfo{Name: function.Name.Name, File: file, Decl: function, Recv: owner}
		}
	}
}

func (x *Index) resolveImports(file *FileCtx) {
	for _, spec := range file.Syntax.Imports {
		target, err := strconv.Unquote(spec.Path.Value)
		if err != nil {
			continue
		}
		alias := path.Base(target)
		if spec.Name != nil {
			alias = spec.Name.Name
		}
		dir, project := x.projectDirectory(target)
		if project && spec.Name == nil {
			alias = x.Packages[dir].Name
		}
		file.Paths[alias] = target
		if project {
			file.Imports[alias] = dir
		}
	}
}

func (x *Index) projectDirectory(target string) (string, bool) {
	if x.Module == "" {
		return "", false
	}
	dir := ""
	switch {
	case target == x.Module:
	case strings.HasPrefix(target, x.Module+"/"):
		dir = target[len(x.Module)+1:]
	default:
		return "", false
	}
	_, found := x.Packages[dir]
	return dir, found
}

func ReceiverName(expression ast.Expr) string {
	switch typed := expression.(type) {
	case *ast.StarExpr:
		return ReceiverName(typed.X)
	case *ast.ParenExpr:
		return ReceiverName(typed.X)
	case *ast.IndexExpr:
		return ReceiverName(typed.X)
	case *ast.IndexListExpr:
		return ReceiverName(typed.X)
	case *ast.SelectorExpr:
		return typed.Sel.Name
	case *ast.Ident:
		return typed.Name
	}
	return ""
}

func (file *FileCtx) Line(position token.Pos) int {
	return file.Set.Position(position).Line
}
