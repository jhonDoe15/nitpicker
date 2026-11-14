package httpvalues

import (
	"go/ast"
	"go/token"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

type originKind int

const (
	noOrigin originKind = iota
	headerOrigin
	hostOrigin
	schemeOrigin
	extensionOrigin
)

type origin struct {
	kind   originKind
	header string
}

type finder struct {
	pass   *analysis.Pass
	locals map[types.Object]ast.Expr
}

const maxDepth = 4

func newFinder(pass *analysis.Pass) *finder {
	found := &finder{pass: pass, locals: map[types.Object]ast.Expr{}}
	rebound := map[types.Object]bool{}
	for _, file := range pass.Files {
		ast.Inspect(file, func(node ast.Node) bool {
			switch typed := node.(type) {
			case *ast.AssignStmt:
				found.assigned(typed, rebound)
			case *ast.ValueSpec:
				for index, name := range typed.Names {
					if index < len(typed.Values) && len(typed.Names) == len(typed.Values) {
						found.locals[pass.TypesInfo.Defs[name]] = typed.Values[index]
					}
				}
			case *ast.IncDecStmt:
				found.markRebound(typed.X, rebound)
			}
			return true
		})
	}
	for object := range rebound {
		delete(found.locals, object)
	}
	return found
}

func (found *finder) assigned(statement *ast.AssignStmt, rebound map[types.Object]bool) {
	paired := len(statement.Lhs) == len(statement.Rhs)
	for index, target := range statement.Lhs {
		ident, isIdent := target.(*ast.Ident)
		if statement.Tok == token.DEFINE && isIdent && paired && found.pass.TypesInfo.Defs[ident] != nil {
			found.locals[found.pass.TypesInfo.Defs[ident]] = statement.Rhs[index]
			continue
		}
		found.markRebound(target, rebound)
	}
}

func (found *finder) markRebound(target ast.Expr, rebound map[types.Object]bool) {
	if ident, ok := ast.Unparen(target).(*ast.Ident); ok {
		if object := found.pass.TypesInfo.ObjectOf(ident); object != nil {
			rebound[object] = true
		}
	}
}

func (found *finder) originOf(expr ast.Expr, depth int) origin {
	info := found.pass.TypesInfo
	if depth > maxDepth {
		return origin{}
	}
	switch typed := ast.Unparen(expr).(type) {
	case *ast.Ident:
		if init, ok := found.locals[info.Uses[typed]]; ok {
			return found.originOf(init, depth+1)
		}
	case *ast.SelectorExpr:
		if typed.Sel.Name == "Scheme" && support.IsNamed(info.TypeOf(typed.X), "net/url", "URL") {
			return origin{kind: schemeOrigin}
		}
		if typed.Sel.Name == "Host" && (support.IsNamed(info.TypeOf(typed.X), "net/url", "URL") ||
			support.IsNamed(info.TypeOf(typed.X), "net/http", "Request")) {
			return origin{kind: hostOrigin}
		}
	case *ast.CallExpr:
		return found.callOrigin(typed, depth)
	}
	return origin{}
}

func (found *finder) callOrigin(call *ast.CallExpr, depth int) origin {
	info := found.pass.TypesInfo
	if support.IsFunc(info, call, "strings", "TrimSpace") && len(call.Args) == 1 {
		return found.originOf(call.Args[0], depth+1)
	}
	if support.IsFunc(info, call, "path/filepath", "Ext") || support.IsFunc(info, call, "path", "Ext") {
		return origin{kind: extensionOrigin}
	}
	selector, ok := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	if ok && selector.Sel.Name == "Hostname" && support.IsNamed(info.TypeOf(selector.X), "net/url", "URL") {
		return origin{kind: hostOrigin}
	}
	if !ok || selector.Sel.Name != "Get" || len(call.Args) != 1 || !isHeaderMap(info.TypeOf(selector.X)) {
		return origin{}
	}
	name, named := constString(info, call.Args[0])
	if !named {
		return origin{}
	}
	return origin{kind: headerOrigin, header: strings.ToLower(name)}
}
