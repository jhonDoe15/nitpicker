package markup

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"regexp"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

var Analyzer = &analysis.Analyzer{
	Name:     "unescaped_html_value",
	Doc:      "reports a value formatted into an HTML string without escaping",
	Requires: support.Requires,
	Run:      run,
}

const message = "`%s` goes into an HTML string without escaping, so a quote, `<` or `&` in it breaks the markup or " +
	"injects script: wrap it in `html.EscapeString` (or `template.HTMLEscapeString`), build the page with " +
	"`html/template`, which escapes by default, or leave the value out of the markup"

var tags = regexp.MustCompile(`(?i)(?:^|[^\w)\]])</?(?:a|b|body|br|button|code|div|em|form|h[1-6]|head|hr|html|i|` +
	`iframe|img|input|label|li|link|meta|ol|option|p|pre|script|section|select|small|span|strong|style|svg|table|` +
	`tbody|td|` +
	`textarea|th|thead|title|tr|u|ul)(?:[\s>/]|$)`)

var safeName = regexp.MustCompile(`(?i)escape|encode|sanitize|html|quote`)

var safeCall = regexp.MustCompile(`(?i:escape|encode|sanitize|html|quote)|Text$|ID$|LineNumber$`)

var textVerbs = regexp.MustCompile(`%(?:[-+# 0]*(?:\d+|\*)?(?:\.(?:\d+|\*))?)([a-zA-Z%])`)

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil), (*ast.BinaryExpr)(nil)) {
		if support.InTestFile(pass, cursor.Node()) {
			continue
		}
		switch node := cursor.Node().(type) {
		case *ast.CallExpr:
			checkFormat(pass, node)
		case *ast.BinaryExpr:
			if !nestedOrReplaced(pass, cursor.Parent().Node()) {
				checkConcat(pass, node)
			}
		}
	}
	return nil, nil
}

func nestedOrReplaced(pass *analysis.Pass, parent ast.Node) bool {
	switch typed := parent.(type) {
	case *ast.BinaryExpr:
		return true
	case *ast.CallExpr:
		callee, ok := typeutil.Callee(pass.TypesInfo, typed).(*types.Func)
		return ok && strings.HasPrefix(callee.Name(), "Replace")
	}
	return false
}

func writesToResponse(pass *analysis.Pass, call *ast.CallExpr) bool {
	return support.IsNamed(support.Deref(pass.TypesInfo.TypeOf(call.Args[0])), "net/http", "ResponseWriter")
}

func constantText(pass *analysis.Pass, expr ast.Expr) (string, bool) {
	value := pass.TypesInfo.Types[expr].Value
	if value == nil || value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(value), true
}

func checkFormat(pass *analysis.Pass, call *ast.CallExpr) {
	if !support.IsFunc(pass.TypesInfo, call, "fmt", "Sprintf") && !support.IsFunc(pass.TypesInfo, call, "fmt", "Fprintf") {
		return
	}
	index := 0
	if support.IsFunc(pass.TypesInfo, call, "fmt", "Fprintf") {
		index = 1
	}
	if len(call.Args) <= index+1 || (index == 1 && writesToResponse(pass, call)) {
		return
	}
	format, ok := constantText(pass, call.Args[index])
	if !ok || !tags.MatchString(format) {
		return
	}
	verbs := textVerbs.FindAllStringSubmatch(format, -1)
	position := 0
	for _, verb := range verbs {
		if verb[1] == "%" {
			continue
		}
		argument := index + 1 + position
		position++
		if argument >= len(call.Args) {
			return
		}
		if (verb[1] == "s" || verb[1] == "v" || verb[1] == "q") && unsafeValue(pass, call.Args[argument]) {
			pass.Reportf(call.Args[argument].Pos(), message, types.ExprString(call.Args[argument]))
		}
	}
}

func operands(expr ast.Expr) []ast.Expr {
	if binary, ok := ast.Unparen(expr).(*ast.BinaryExpr); ok && binary.Op == token.ADD {
		return append(operands(binary.X), operands(binary.Y)...)
	}
	return []ast.Expr{expr}
}

func checkConcat(pass *analysis.Pass, binary *ast.BinaryExpr) {
	if binary.Op != token.ADD || !isString(pass.TypesInfo.TypeOf(binary)) {
		return
	}
	parts := operands(binary)
	marked := false
	for _, part := range parts {
		if text, ok := constantText(pass, part); ok && tags.MatchString(text) {
			marked = true
		}
	}
	if !marked {
		return
	}
	for _, part := range parts {
		if _, ok := constantText(pass, part); !ok && unsafeValue(pass, part) {
			pass.Reportf(part.Pos(), message, types.ExprString(part))
		}
	}
}

func isString(typ types.Type) bool {
	basic, ok := typ.Underlying().(*types.Basic)
	return ok && basic.Info()&types.IsString != 0
}

func unsafeValue(pass *analysis.Pass, expr ast.Expr) bool {
	if _, ok := constantText(pass, expr); ok || !isString(pass.TypesInfo.TypeOf(expr)) {
		return false
	}
	switch typed := ast.Unparen(expr).(type) {
	case *ast.CallExpr:
		return !safeCall.MatchString(calleeName(typed)) && !isURLString(pass, typed) &&
			!strings.Contains(types.ExprString(typed.Fun), "Join")
	case *ast.BinaryExpr:
		return len(operands(typed)) < 2 || hasUnsafePart(pass, typed)
	case *ast.Ident:
		return !safeName.MatchString(typed.Name)
	case *ast.SelectorExpr:
		return !safeName.MatchString(typed.Sel.Name)
	}
	return true
}

func hasUnsafePart(pass *analysis.Pass, binary *ast.BinaryExpr) bool {
	for _, part := range operands(binary) {
		if unsafeValue(pass, part) {
			return true
		}
	}
	return false
}

func calleeName(call *ast.CallExpr) string {
	switch fun := ast.Unparen(call.Fun).(type) {
	case *ast.Ident:
		return fun.Name
	case *ast.SelectorExpr:
		return types.ExprString(fun.X) + "." + fun.Sel.Name
	}
	return ""
}

func isURLString(pass *analysis.Pass, call *ast.CallExpr) bool {
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	return ok && selector.Sel.Name == "String" && support.IsNamed(pass.TypesInfo.TypeOf(selector.X), "net/url", "URL")
}
