package design

import (
	"go/ast"
	"go/types"
	"slices"
	"unicode"
	"unicode/utf8"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var packageNameAnalyzer = &analysis.Analyzer{
	Name:     "generic_package_name",
	Doc:      "reports a package named util, common, misc or another name that says nothing",
	Requires: support.Requires,
	Run:      runPackageName,
}

var getterAnalyzer = &analysis.Analyzer{
	Name:     "get_prefixed_getter",
	Doc:      "reports an exported getter named GetX",
	Requires: support.Requires,
	Run:      runGetter,
}

const (
	packageNameMessage = "package name `%s` says nothing about what it provides, so everything ends up in it: " +
		"split it into packages named for what each provides, such as `money` or `retry`"
	getterMessage = "Go getters are named after the value without Get: `Owner()`, not `GetOwner()`"
)

var genericNames = []string{"util", "utils", "common", "misc", "helper", "helpers", "interfaces"}

func runPackageName(pass *analysis.Pass) (any, error) {
	if !slices.Contains(genericNames, pass.Pkg.Name()) {
		return nil, nil
	}
	var first *ast.File
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) || ast.IsGenerated(file) {
			continue
		}
		if first == nil || pass.Fset.Position(file.Pos()).Filename < pass.Fset.Position(first.Pos()).Filename {
			first = file
		}
	}
	if first != nil {
		pass.Reportf(first.Name.Pos(), packageNameMessage, pass.Pkg.Name())
	}
	return nil, nil
}

func runGetter(pass *analysis.Pass) (any, error) {
	foreign := support.ImportedInterfaceMethods(pass.Pkg)
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) {
			continue
		}
		for _, decl := range file.Decls {
			function, ok := decl.(*ast.FuncDecl)
			if !ok || function.Recv == nil || !getterName(function.Name.Name) {
				continue
			}
			method, isMethod := pass.TypesInfo.Defs[function.Name].(*types.Func)
			if isMethod && method.Signature().Params().Len() == 0 && method.Signature().Results().Len() == 1 &&
				!foreign.Implements(method) {
				pass.Reportf(function.Name.Pos(), "%s", getterMessage)
			}
		}
	}
	return nil, nil
}

func getterName(name string) bool {
	rest, found := cutPrefix(name, "Get")
	if !found || rest == "" {
		return false
	}
	first, _ := utf8.DecodeRuneInString(rest)
	return unicode.IsUpper(first)
}

func cutPrefix(name, prefix string) (string, bool) {
	if len(name) < len(prefix) || name[:len(prefix)] != prefix {
		return name, false
	}
	return name[len(prefix):], true
}
