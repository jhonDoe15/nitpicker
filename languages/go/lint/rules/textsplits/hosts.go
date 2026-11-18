package textsplits

import (
	"go/ast"
	"go/types"
	"regexp"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var hostAnalyzer = &analysis.Analyzer{
	Name:     "host_port_colon_split",
	Doc:      "reports a host value split on a colon, which breaks IPv6 literals",
	Requires: support.Requires,
	Run:      runHost,
}

const hostMessage = "this splits a host on `:`, but an IPv6 literal (`[::1]:3000`) has colons of its own, so the " +
	"host becomes `[` and the port is lost or wrong: use `net.SplitHostPort(host)` (and treat a " +
	"missing port as no port), `url.Hostname()` and `url.Port()`, or `netip.ParseAddrPort`"

var (
	hostName   = regexp.MustCompile(`^(?i:host|hostname|authority|origin)$|[a-z]Host$`)
	hostHeader = regexp.MustCompile(`(?i)^(?:host|x-forwarded-host)$`)
)

func isHostValue(info *types.Info, expr ast.Expr) bool {
	if hostName.MatchString(nameOf(expr)) && isString(info, expr) {
		return true
	}
	call, ok := ast.Unparen(expr).(*ast.CallExpr)
	if !ok || len(call.Args) != 1 {
		return false
	}
	selector, isSelector := call.Fun.(*ast.SelectorExpr)
	name, isConst := constString(info, call.Args[0])
	return isSelector && selector.Sel.Name == "Get" && isConst && hostHeader.MatchString(name) &&
		isString(info, call)
}

func splitsOnColon(info *types.Info, call *ast.CallExpr) bool {
	for _, name := range []string{"Split", "SplitN", "Cut", "Index"} {
		if !support.IsFunc(info, call, "strings", name) || len(call.Args) < 2 {
			continue
		}
		separator, ok := constString(info, call.Args[1])
		return ok && separator == ":" && isHostValue(info, call.Args[0])
	}
	return false
}

func ipv6Aware(pass *analysis.Pass, body ast.Node) bool {
	return calls(body, pass.TypesInfo, "net", "SplitHostPort", "JoinHostPort", "ParseIP") ||
		calls(body, pass.TypesInfo, "net/netip", "ParseAddr", "ParseAddrPort", "MustParseAddr") ||
		mentionsLiteral(body, pass.TypesInfo, func(text string) bool { return strings.ContainsAny(text, "[]") })
}

func runHost(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) || !splitsOnColon(pass.TypesInfo, call) ||
			ipv6Aware(pass, functionBody(cursor)) {
			continue
		}
		pass.Reportf(call.Pos(), "%s", hostMessage)
	}
	return nil, nil
}
