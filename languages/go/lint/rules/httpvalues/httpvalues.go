package httpvalues

import (
	"go/ast"
	"go/constant"
	"go/token"
	"go/types"
	"net/textproto"
	"regexp"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var caseAnalyzer = &analysis.Analyzer{
	Name:     "http_value_case",
	Doc:      "reports a header value, host, cookie prefix or file extension compared by exact case",
	Requires: support.Requires,
	Run:      runCase,
}

var splitAnalyzer = &analysis.Analyzer{
	Name:     "hand_split_http_header",
	Doc:      "reports a structured header value split by hand instead of parsed",
	Requires: support.Requires,
	Run:      runSplit,
}

const caseMessage = "this compares exact text, but media types, charsets, encodings, hosts, cookie name prefixes " +
	"and file extensions are case-insensitive, so `Application/JSON` or `photo.PNG` is missed: compare with " +
	"`strings.EqualFold(value, \"...\")`, lowercase it first (`strings.ToLower`), or parse it " +
	"(`mime.ParseMediaType(value)` for a media type)"

const nameMessage = "`Header` is a map keyed by the canonical form of the name (`Content-Type`), so this key finds " +
	"nothing: use `Header.Get(name)` or `Header.Values(name)`, which canonicalise the name, or " +
	"`http.CanonicalHeaderKey`"

const splitMessage = "this splits a structured header by hand, which breaks on quoted values, whitespace around " +
	"separators and quality weights: parse it with `mime.ParseMediaType(value)` for Content-Type and " +
	"Content-Disposition, `http.ParseCookie(value)` for Cookie, or a negotiation package for Accept; a library " +
	"that is itself the parser takes an exceptions entry"

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{caseAnalyzer, splitAnalyzer}
}

var (
	valueHeaders = regexp.MustCompile(`^(?:accept(?:-(?:charset|encoding|language))?|content-(?:type|encoding|` +
		`language|disposition)|transfer-encoding|connection|upgrade|cache-control|pragma|authorization|` +
		`proxy-authorization|www-authenticate|expect|te|host|origin|forwarded|x-forwarded-(?:proto|host|scheme)|` +
		`sec-fetch-\w+|vary)$`)
	structuredHeaders = regexp.MustCompile(`^(?:accept(?:-(?:charset|encoding|language))?|content-(?:type|` +
		`disposition|language)|cache-control|if-none-match|if-match|cookie|set-cookie|forwarded|vary|prefer|link)$`)
	separators  = regexp.MustCompile(`^[\s,;]*[,;][\s,;]*$`)
	letters     = regexp.MustCompile(`[A-Za-z]`)
	cookiePrefx = regexp.MustCompile(`^__(?:Host|Secure)-`)
	mimeTable   = regexp.MustCompile(`(?i)mime|content_?type`)
)

func constString(info *types.Info, expr ast.Expr) (string, bool) {
	value := info.Types[expr].Value
	if value == nil || value.Kind() != constant.String {
		return "", false
	}
	return constant.StringVal(value), true
}

func hasLetters(info *types.Info, expr ast.Expr) bool {
	text, ok := constString(info, expr)
	return ok && letters.MatchString(text)
}

func isHeaderMap(typ types.Type) bool {
	return support.IsNamed(typ, "net/http", "Header") || support.IsNamed(typ, "net/textproto", "MIMEHeader")
}

func nameLookups(pass *analysis.Pass, index *ast.IndexExpr) bool {
	key, ok := constString(pass.TypesInfo, index.Index)
	return ok && isHeaderMap(pass.TypesInfo.TypeOf(index.X)) && textproto.CanonicalMIMEHeaderKey(key) != key
}

func isLowering(info *types.Info, expr ast.Expr) bool {
	call, ok := ast.Unparen(expr).(*ast.CallExpr)
	return ok && (support.IsFunc(info, call, "strings", "ToLower") || support.IsFunc(info, call, "strings", "ToUpper"))
}

func cookiePrefixCall(pass *analysis.Pass, call *ast.CallExpr) bool {
	if !support.IsFunc(pass.TypesInfo, call, "strings", "HasPrefix") || len(call.Args) != 2 {
		return false
	}
	prefix, ok := constString(pass.TypesInfo, call.Args[1])
	return ok && cookiePrefx.MatchString(prefix) && !isLowering(pass.TypesInfo, call.Args[0])
}

func runCase(pass *analysis.Pass) (any, error) {
	found := newFinder(pass)
	for cursor := range support.Root(pass).Preorder((*ast.BinaryExpr)(nil), (*ast.CallExpr)(nil),
		(*ast.SwitchStmt)(nil), (*ast.IndexExpr)(nil)) {
		node := cursor.Node()
		if support.InTestFile(pass, node) {
			continue
		}
		switch typed := node.(type) {
		case *ast.IndexExpr:
			if nameLookups(pass, typed) {
				pass.Reportf(typed.Pos(), "%s", nameMessage)
			} else if found.valueKey(typed) {
				pass.Reportf(typed.Pos(), "%s", caseMessage)
			}
		case *ast.CallExpr:
			if cookiePrefixCall(pass, typed) || found.comparesCall(typed) {
				pass.Reportf(typed.Pos(), "%s", caseMessage)
			}
		case *ast.BinaryExpr:
			if found.comparesBinary(typed) {
				pass.Reportf(typed.Pos(), "%s", caseMessage)
			}
		case *ast.SwitchStmt:
			if found.switchesOn(typed) {
				pass.Reportf(typed.Pos(), "%s", caseMessage)
			}
		}
	}
	return nil, nil
}

func runSplit(pass *analysis.Pass) (any, error) {
	found := newFinder(pass)
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if !support.InTestFile(pass, call) && found.splitsByHand(call) {
			pass.Reportf(call.Pos(), "%s", splitMessage)
		}
	}
	return nil, nil
}

func (found *finder) comparesBinary(binary *ast.BinaryExpr) bool {
	if binary.Op != token.EQL && binary.Op != token.NEQ {
		return false
	}
	for _, pair := range [][2]ast.Expr{{binary.X, binary.Y}, {binary.Y, binary.X}} {
		if flagged(found.pass.TypesInfo, found.originOf(pair[0], 0), pair[1]) {
			return true
		}
	}
	return false
}

func (found *finder) comparesCall(call *ast.CallExpr) bool {
	info := found.pass.TypesInfo
	for _, name := range []string{"HasPrefix", "HasSuffix", "Contains", "Index"} {
		if support.IsFunc(info, call, "strings", name) && len(call.Args) == 2 {
			return flagged(info, found.originOf(call.Args[0], 0), call.Args[1])
		}
	}
	if support.IsFunc(info, call, "slices", "Contains") && len(call.Args) == 2 {
		return isValue(found.originOf(call.Args[1], 0))
	}
	return false
}

func (found *finder) switchesOn(statement *ast.SwitchStmt) bool {
	if statement.Tag == nil || !isValue(found.originOf(statement.Tag, 0)) {
		return false
	}
	for _, clause := range statement.Body.List {
		for _, expr := range clause.(*ast.CaseClause).List {
			if hasLetters(found.pass.TypesInfo, expr) {
				return true
			}
		}
	}
	return false
}

func (found *finder) valueKey(index *ast.IndexExpr) bool {
	if _, isMap := found.pass.TypesInfo.TypeOf(index.X).Underlying().(*types.Map); !isMap {
		return false
	}
	origin := found.originOf(index.Index, 0)
	if origin.kind == extensionOrigin {
		return mimeTable.MatchString(identName(index.X))
	}
	return !isHeaderMap(found.pass.TypesInfo.TypeOf(index.X)) && isValue(origin)
}

func (found *finder) splitsByHand(call *ast.CallExpr) bool {
	info := found.pass.TypesInfo
	for _, name := range []string{"Split", "SplitN", "Cut"} {
		if support.IsFunc(info, call, "strings", name) && len(call.Args) >= 2 {
			separator, ok := constString(info, call.Args[1])
			origin := found.originOf(call.Args[0], 0)
			return ok && separators.MatchString(separator) && origin.kind == headerOrigin &&
				structuredHeaders.MatchString(origin.header)
		}
	}
	return false
}

func identName(expr ast.Expr) string {
	switch typed := ast.Unparen(expr).(type) {
	case *ast.Ident:
		return typed.Name
	case *ast.SelectorExpr:
		return typed.Sel.Name
	}
	return ""
}

func flagged(info *types.Info, found origin, literal ast.Expr) bool {
	if found.kind == schemeOrigin {
		text, ok := constString(info, literal)
		return ok && text != strings.ToLower(text)
	}
	return hasLetters(info, literal) && isValue(found)
}

func isValue(found origin) bool {
	switch found.kind {
	case headerOrigin:
		return valueHeaders.MatchString(found.header)
	case hostOrigin:
		return true
	}
	return false
}
