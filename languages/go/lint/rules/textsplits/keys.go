package textsplits

import (
	"go/ast"
	"go/token"
	"go/types"
	"regexp"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var keyAnalyzer = &analysis.Analyzer{
	Name:     "delimited_lookup_key",
	Doc:      "reports a map key built by joining strings with a delimiter",
	Requires: support.Requires,
	Run:      runKey,
}

const keyMessage = "this map key joins two strings with `%s`, so `\"a-b\"` with `\"c\"` and `\"a\"` with `\"b-c\"` " +
	"give the same key and one entry overwrites or finds the other: use a struct key (`type key " +
	"struct{ a, b string }`) or an array (`[2]string{a, b}`), or escape the parts first"

var identifierDelimiter = map[string]bool{".": true, "@": true, "#": true}

var (
	delimiter = regexp.MustCompile(`^[^\p{L}\p{N}\s%]{1,2}$`)
	idName    = regexp.MustCompile(`(?i)(?:id|uuid|hash|index|idx|count|len|size)$`)
	identName = regexp.MustCompile(`(?i)(?:name|path|pkg|package|version|ident|method|func|module|recv)$`)
	verbs     = regexp.MustCompile(`%[-+# 0]*[0-9]*(?:\.[0-9]+)?[a-zA-Z%]`)
)

func keyParts(info *types.Info, expr ast.Expr) ([]ast.Expr, string) {
	switch typed := ast.Unparen(expr).(type) {
	case *ast.BinaryExpr:
		return concatParts(info, typed)
	case *ast.CallExpr:
		if call, ok := isCall(info, typed, "fmt", "Sprintf"); ok {
			return sprintfParts(info, call)
		}
		if call, ok := isCall(info, typed, "strings", "Join"); ok && len(call.Args) == 2 {
			return joinParts(info, call)
		}
	}
	return nil, ""
}

func sumOperands(expr ast.Expr) []ast.Expr {
	if binary, ok := ast.Unparen(expr).(*ast.BinaryExpr); ok && binary.Op == token.ADD {
		return append(sumOperands(binary.X), sumOperands(binary.Y)...)
	}
	return []ast.Expr{expr}
}

func concatParts(info *types.Info, binary *ast.BinaryExpr) ([]ast.Expr, string) {
	if binary.Op != token.ADD || !isString(info, binary) {
		return nil, ""
	}
	operands := sumOperands(binary)
	separator := ""
	var parts []ast.Expr
	for position, operand := range operands {
		if text, ok := constString(info, operand); !ok {
			parts = append(parts, operand)
		} else if delimiter.MatchString(text) && position > 0 && position < len(operands)-1 {
			_, before := constString(info, operands[position-1])
			_, after := constString(info, operands[position+1])
			if !before && !after {
				separator = text
			}
		}
	}
	return parts, separator
}

func sprintfParts(info *types.Info, call *ast.CallExpr) ([]ast.Expr, string) {
	format, ok := constString(info, call.Args[0])
	if !ok {
		return nil, ""
	}
	found := verbs.FindAllStringIndex(format, -1)
	if len(found) < 2 || len(found) != len(call.Args)-1 {
		return nil, ""
	}
	separator := ""
	for position := 1; position < len(found); position++ {
		between := format[found[position-1][1]:found[position][0]]
		if delimiter.MatchString(between) {
			separator = between
		}
	}
	var parts []ast.Expr
	for position, span := range found {
		if verb := format[span[0]:span[1]]; verb == "%s" || verb == "%v" {
			parts = append(parts, call.Args[position+1])
		}
	}
	return parts, separator
}

func joinParts(info *types.Info, call *ast.CallExpr) ([]ast.Expr, string) {
	literal, ok := ast.Unparen(call.Args[0]).(*ast.CompositeLit)
	separator, isConst := constString(info, call.Args[1])
	if !ok || !isConst || !delimiter.MatchString(separator) || len(literal.Elts) < 2 {
		return nil, ""
	}
	var parts []ast.Expr
	for _, element := range literal.Elts {
		if _, constant := constString(info, element); !constant {
			parts = append(parts, element)
		}
	}
	return parts, separator
}

func ambiguous(info *types.Info, expr ast.Expr) (string, bool) {
	parts, separator := keyParts(info, expr)
	if separator == "" {
		return "", false
	}
	texts, identifiers := 0, 0
	for _, part := range parts {
		if isString(info, part) && !idName.MatchString(nameOf(part)) && !escaped(info, part) {
			texts++
			if identName.MatchString(nameOf(part)) {
				identifiers++
			}
		}
	}
	return separator, texts >= 2 && !(identifiers == texts && identifierDelimiter[separator])
}

func escaped(info *types.Info, part ast.Expr) bool {
	call, ok := ast.Unparen(part).(*ast.CallExpr)
	if !ok {
		return false
	}
	callee, isFunc := typeutil.Callee(info, call).(*types.Func)
	if !isFunc || callee.Pkg() == nil {
		return false
	}
	switch callee.Pkg().Path() {
	case "strconv", "net/url", "encoding/hex", "encoding/base64", "crypto/sha256", "hash/fnv":
		return true
	}
	return false
}

func runKey(pass *analysis.Pass) (any, error) {
	info := pass.TypesInfo
	definitions := map[types.Object]ast.Expr{}
	assigned := map[types.Object]int{}
	for cursor := range support.Root(pass).Preorder((*ast.AssignStmt)(nil)) {
		statement := cursor.Node().(*ast.AssignStmt)
		for position, target := range statement.Lhs {
			ident, ok := target.(*ast.Ident)
			if !ok {
				continue
			}
			object := info.ObjectOf(ident)
			assigned[object]++
			if len(statement.Lhs) == len(statement.Rhs) && statement.Tok == token.DEFINE {
				definitions[object] = statement.Rhs[position]
			}
		}
	}
	resolve := func(expr ast.Expr) ast.Expr {
		if ident, ok := ast.Unparen(expr).(*ast.Ident); ok {
			if definition, found := definitions[info.Uses[ident]]; found && assigned[info.Uses[ident]] == 1 {
				return definition
			}
		}
		return expr
	}
	report := func(node ast.Node, key ast.Expr, container ast.Expr) {
		if support.InTestFile(pass, node) {
			return
		}
		if mapType, ok := types.Unalias(info.TypeOf(container)).Underlying().(*types.Map); !ok || !isString(info, key) ||
			!isStringType(mapType.Key()) {
			return
		}
		if separator, bad := ambiguous(info, resolve(key)); bad {
			pass.Reportf(node.Pos(), keyMessage, separator)
		}
	}
	for cursor := range support.Root(pass).Preorder((*ast.IndexExpr)(nil), (*ast.CallExpr)(nil)) {
		switch typed := cursor.Node().(type) {
		case *ast.IndexExpr:
			report(typed, typed.Index, typed.X)
		case *ast.CallExpr:
			if support.IsBuiltin(info, typed, "delete") && len(typed.Args) == 2 {
				report(typed, typed.Args[1], typed.Args[0])
			}
		}
	}
	return nil, nil
}

func isStringType(typ types.Type) bool {
	basic, ok := types.Unalias(typ).Underlying().(*types.Basic)
	return ok && basic.Info()&types.IsString != 0
}
