package copies

import (
	"encoding/json"
	"go/ast"
	"go/constant"
	"go/token"
	"slices"
	"strconv"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var Analyzer = &analysis.Analyzer{
	Name:      "copied_constant_in_test",
	Doc:       "reports a test literal that copies the value of a production constant the test can see",
	Requires:  support.Requires,
	FactTypes: []analysis.Fact{new(contract)},
	Run:       run,
}

type Copy struct {
	Names []string `json:"names"`
	Owner string   `json:"owner"`
	Kind  string   `json:"kind"`
	Value string   `json:"value"`
}

func run(pass *analysis.Pass) (any, error) {
	exportContracts(pass)
	for cursor := range support.Root(pass).Preorder((*ast.BasicLit)(nil)) {
		literal := cursor.Node().(*ast.BasicLit)
		if !support.InTestFile(pass, literal) || !copyable(literal) || exempt(pass, cursor) {
			continue
		}
		report(pass, cursor)
	}
	return nil, nil
}

func copyable(literal *ast.BasicLit) bool {
	return literal.Kind == token.STRING || literal.Kind == token.INT || literal.Kind == token.FLOAT
}

func report(pass *analysis.Pass, cursor inspector.Cursor) {
	expression := signed(cursor)
	value := pass.TypesInfo.Types[expression].Value
	if value == nil || trivial(value) {
		return
	}
	file := enclosingFile(cursor)
	matches := visibleContracts(pass, file).matching(value)
	if len(matches) == 0 || pinned(pass, cursor, matches) {
		return
	}
	found := Copy{Owner: matches[0].owner, Kind: kindOf(value), Value: shown(value)}
	for _, match := range matches {
		if match.owner == found.Owner {
			found.Names = append(found.Names, match.name)
		}
	}
	message, _ := json.Marshal(found)
	pass.Reportf(expression.Pos(), "%s", message)
}

func signed(cursor inspector.Cursor) ast.Expr {
	literal := cursor.Node().(ast.Expr)
	if unary, ok := cursor.Parent().Node().(*ast.UnaryExpr); ok && unary.Op == token.SUB {
		return unary
	}
	return literal
}

func kindOf(value constant.Value) string {
	if value.Kind() == constant.String {
		return "string"
	}
	return "number"
}

func shown(value constant.Value) string {
	switch value.Kind() {
	case constant.String:
		return constant.StringVal(value)
	case constant.Float:
		number, _ := constant.Float64Val(value)
		return strconv.FormatFloat(number, 'g', -1, 64)
	}
	return value.ExactString()
}

func enclosingFile(cursor inspector.Cursor) *ast.File {
	for each := range cursor.Enclosing((*ast.File)(nil)) {
		return each.Node().(*ast.File)
	}
	return nil
}

func trivial(value constant.Value) bool {
	if value.Kind() == constant.String {
		text := constant.StringVal(value)
		return len([]rune(text)) < 3 || strings.TrimSpace(text) == ""
	}
	return slices.ContainsFunc([]int64{-1, 0, 1, 2}, func(small int64) bool {
		return constant.Compare(value, token.EQL, constant.MakeInt64(small))
	})
}
