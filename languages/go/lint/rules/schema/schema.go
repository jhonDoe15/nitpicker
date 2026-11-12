package schema

import (
	"go/ast"
	"go/token"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{foreignKeyAnalyzer}
}

var foreignKeyAnalyzer = &analysis.Analyzer{
	Name:     "unindexed_foreign_key",
	Doc:      "reports a GORM or ent foreign key that no index starts with",
	Requires: support.Requires,
	Run:      runForeignKeys,
}

const why = "Only MySQL indexes a foreign-key column by itself; PostgreSQL, SQL Server and SQLite do not, " +
	"so every delete of a referenced row, and every join or lookup by the column, scans the whole table once it grows. " +
	"An exception fits only when the table is known to stay small"

type finding struct {
	pos     token.Pos
	message string
}

func runForeignKeys(pass *analysis.Pass) (any, error) {
	seen := map[token.Pos]bool{}
	for _, found := range append(gormFindings(pass), entFindings(pass)...) {
		if seen[found.pos] || inTestFile(pass, found.pos) {
			continue
		}
		seen[found.pos] = true
		pass.Reportf(found.pos, "%s. %s", found.message, why)
	}
	return nil, nil
}

func inTestFile(pass *analysis.Pass, pos token.Pos) bool {
	return strings.HasSuffix(pass.Fset.Position(pos).Filename, "_test.go")
}

func sourceFiles(pass *analysis.Pass) []*ast.File {
	var files []*ast.File
	for _, file := range pass.Files {
		if !support.InTestFile(pass, file) {
			files = append(files, file)
		}
	}
	return files
}
