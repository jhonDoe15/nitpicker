package guards

import (
	"go/ast"
	"go/types"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var nameAnalyzer = &analysis.Analyzer{
	Name:     "generic_name",
	Doc:      "reports a type or file named util, helper, manager or another role that says nothing",
	Requires: support.Requires,
	Run:      runNames,
}

const nameMessage = "%s `%s` names a generic role, so unrelated code ends up in it: " +
	"name it for the job it does, such as `PriceRounding` or `order_repository.go`"

var (
	genericWords = []string{
		"util", "utils", "utility", "utilities", "helper", "helpers", "manager", "managers",
		"common", "commons", "misc", "miscellaneous",
	}
	containerWords = []string{"functions", "funcs", "methods", "module", "modules", "mixin", "mixins", "base", "classes"}
	acceptedOwners = []string{
		"authentication", "transaction", "cache", "entity", "session", "connection", "lock", "resource",
	}
	versionWord   = regexp.MustCompile(`^v?\d*$`)
	trailingDigit = regexp.MustCompile(`\d+$`)
	platformWords = []string{
		"aix", "android", "darwin", "dragonfly", "freebsd", "hurd", "illumos", "ios", "js", "linux", "nacl",
		"netbsd", "openbsd", "plan9", "solaris", "wasip1", "windows", "zos", "386", "amd64", "arm", "arm64",
		"loong64", "mips", "mipsle", "mips64", "mips64le", "ppc64", "ppc64le", "riscv64", "s390x", "wasm",
	}
)

func runNames(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if support.InTestFile(pass, file) {
			continue
		}
		stem := fileStem(pass.Fset.Position(file.Pos()).Filename)
		if generic(stem) && stem != pass.Pkg.Name() {
			pass.Reportf(file.Package, nameMessage, "file", stem+".go")
		}
		for _, declaration := range file.Decls {
			reportTypes(pass, declaration)
		}
	}
	return nil, nil
}

func reportTypes(pass *analysis.Pass, declaration ast.Decl) {
	general, ok := declaration.(*ast.GenDecl)
	if !ok {
		return
	}
	for _, spec := range general.Specs {
		typeSpec, isType := spec.(*ast.TypeSpec)
		if isType && generic(typeSpec.Name.Name) && !followsLibraryType(pass.TypesInfo, typeSpec) {
			pass.Reportf(typeSpec.Name.Pos(), nameMessage, "type", typeSpec.Name.Name)
		}
	}
}

func fileStem(path string) string {
	parts := strings.Split(strings.TrimSuffix(filepath.Base(path), ".go"), "_")
	for len(parts) > 1 && slices.Contains(platformWords, parts[len(parts)-1]) {
		parts = parts[:len(parts)-1]
	}
	return strings.Join(parts, "_")
}

func judgedWords(name string) []string {
	words := []string{}
	for _, word := range support.WordsOf(name) {
		word = trailingDigit.ReplaceAllString(word, "")
		if word == "" || versionWord.MatchString(word) {
			continue
		}
		if (word == "manager" || word == "managers") && len(words) > 0 && words[len(words)-1] == "context" {
			words = words[:len(words)-1]
			continue
		}
		words = append(words, word)
	}
	if len(words) > 1 && slices.Contains(containerWords, words[len(words)-1]) {
		return words[:len(words)-1]
	}
	return words
}

func lastWord(name string) string {
	words := judgedWords(name)
	if len(words) == 0 {
		return ""
	}
	return words[len(words)-1]
}

func generic(name string) bool {
	words := judgedWords(name)
	if len(words) == 0 || !slices.Contains(genericWords, words[len(words)-1]) {
		return false
	}
	last := words[len(words)-1]
	owned := len(words) > 1 && slices.Contains(acceptedOwners, words[len(words)-2])
	return !(owned && (last == "manager" || last == "managers"))
}

func followsLibraryType(info *types.Info, spec *ast.TypeSpec) bool {
	word := lastWord(spec.Name.Name)
	for _, base := range baseTypes(spec.Type) {
		if named, ok := types.Unalias(support.Deref(info.TypeOf(base))).(*types.Named); ok &&
			lastWord(named.Obj().Name()) == word {
			return true
		}
	}
	return false
}

func baseTypes(expression ast.Expr) []ast.Expr {
	structure, ok := expression.(*ast.StructType)
	if !ok {
		return []ast.Expr{expression}
	}
	bases := []ast.Expr{}
	for _, field := range structure.Fields.List {
		if len(field.Names) == 0 {
			bases = append(bases, field.Type)
		}
	}
	return bases
}
