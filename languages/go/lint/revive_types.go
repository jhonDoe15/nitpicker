package main

import (
	"errors"
	"fmt"
	"go/ast"
	"go/parser"
	"go/token"
	"go/types"
	"maps"
	"path/filepath"
	"reflect"
	"slices"
	"strings"
	"sync"
	"unsafe"

	"github.com/mgechev/revive/lint"
	"golang.org/x/tools/go/packages"
)

type packageTypes struct {
	loaded   map[string]*packages.Package
	mu       sync.Mutex
	prepared map[*lint.Package]*sync.Once
	problems []error
}

type typedRule struct {
	lint.Rule
	types *packageTypes
}

func (rule typedRule) Apply(file *lint.File, arguments lint.Arguments) []lint.Failure {
	rule.types.prepare(file.Pkg)
	return rule.Rule.Apply(file, arguments)
}

func withTypes(rules []lint.Rule, loaded []*packages.Package) ([]lint.Rule, *packageTypes) {
	shared := &packageTypes{loaded: map[string]*packages.Package{}, prepared: map[*lint.Package]*sync.Once{}}
	for _, pkg := range loaded {
		if strings.HasSuffix(pkg.PkgPath, ".test") || len(pkg.GoFiles) == 0 {
			continue
		}
		key := groupKey(pkg.GoFiles[0], pkg.Name)
		if current := shared.loaded[key]; current == nil || len(pkg.GoFiles) > len(current.GoFiles) {
			shared.loaded[key] = pkg
		}
	}
	typed := make([]lint.Rule, 0, len(rules))
	for _, each := range rules {
		typed = append(typed, typedRule{Rule: each, types: shared})
	}
	return typed, shared
}

func groupKey(file, name string) string {
	return filepath.Dir(file) + "\x00" + name
}

func (shared *packageTypes) prepare(pkg *lint.Package) {
	shared.mu.Lock()
	once := shared.prepared[pkg]
	if once == nil {
		once = &sync.Once{}
		shared.prepared[pkg] = once
	}
	shared.mu.Unlock()
	once.Do(func() {
		if err := shared.check(pkg); err != nil {
			shared.mu.Lock()
			shared.problems = append(shared.problems, err)
			shared.mu.Unlock()
		}
	})
}

func (shared *packageTypes) err() error {
	return errors.Join(shared.problems...)
}

func (shared *packageTypes) check(pkg *lint.Package) error {
	files := pkg.Files()
	names := slices.Sorted(maps.Keys(files))
	if len(names) == 0 {
		return nil
	}
	loaded := shared.loaded[groupKey(names[0], files[names[0]].AST.Name.Name)]
	if loaded == nil {
		return nil
	}
	fileSet, err := unexported(pkg, "fset")
	if err != nil {
		return err
	}
	syntax, err := completeSyntax(fileSet.Interface().(*token.FileSet), files, loaded.GoFiles)
	if err != nil {
		return err
	}
	info := &types.Info{
		Types: map[ast.Expr]types.TypeAndValue{}, Defs: map[*ast.Ident]types.Object{},
		Uses: map[*ast.Ident]types.Object{}, Implicits: map[ast.Node]types.Object{},
		Selections: map[*ast.SelectorExpr]*types.Selection{}, Scopes: map[ast.Node]*types.Scope{},
		Instances: map[*ast.Ident]types.Instance{},
	}
	config := &types.Config{Importer: loadedImports(loaded.Imports), Error: func(error) {}, Sizes: loaded.TypesSizes}
	if loaded.Module != nil && loaded.Module.GoVersion != "" {
		config.GoVersion = "go" + loaded.Module.GoVersion
	}
	checked, _ := config.Check(loaded.PkgPath, fileSet.Interface().(*token.FileSet), syntax, info)
	return setTypes(pkg, checked, info)
}

func completeSyntax(fileSet *token.FileSet, files map[string]*lint.File, all []string) ([]*ast.File, error) {
	syntax := []*ast.File{}
	for _, name := range all {
		if file, found := files[name]; found {
			syntax = append(syntax, file.AST)
			continue
		}
		parsed, err := parser.ParseFile(fileSet, name, nil, parser.SkipObjectResolution)
		if err != nil {
			return nil, err
		}
		syntax = append(syntax, parsed)
	}
	return syntax, nil
}

func setTypes(pkg *lint.Package, checked *types.Package, info *types.Info) error {
	for name, value := range map[string]any{"typesPkg": checked, "typesInfo": info} {
		field, err := unexported(pkg, name)
		if err != nil {
			return err
		}
		field.Set(reflect.ValueOf(value))
	}
	return nil
}

func unexported(pkg *lint.Package, name string) (reflect.Value, error) {
	field := reflect.ValueOf(pkg).Elem().FieldByName(name)
	if !field.IsValid() {
		return reflect.Value{}, fmt.Errorf("revive: lint.Package has no field %s", name)
	}
	return reflect.NewAt(field.Type(), unsafe.Pointer(field.UnsafeAddr())).Elem(), nil
}

type loadedImports map[string]*packages.Package

func (imports loadedImports) Import(path string) (*types.Package, error) {
	if path == "unsafe" {
		return types.Unsafe, nil
	}
	if imported := imports[path]; imported != nil && imported.Types != nil {
		return imported.Types, nil
	}
	return nil, fmt.Errorf("%s was not loaded", path)
}
