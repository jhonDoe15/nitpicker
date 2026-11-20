package affixes

import (
	"go/ast"
	"go/token"
	"go/types"
	"regexp"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
)

var PrefixAnalyzer = &analysis.Analyzer{
	Name:     "prefix_without_boundary",
	Doc:      "reports a path, route, package or host matched by a text prefix, suffix or substring with no boundary",
	Requires: support.Requires,
	Run:      runPrefix,
}

const (
	prefixMessage = "A text prefix check also accepts siblings that only share the text (`/foo` matches `/foobar`): " +
		"compare whole segments (`x == base || strings.HasPrefix(x, base+\"/\")`) or use `filepath.Rel`"
	suffixMessage = "A host suffix check also accepts `evilexample.com` for `example.com`: compare " +
		"`host == domain || strings.HasSuffix(host, \".\"+domain)`"
	originMessage = "A URL prefix without a boundary also accepts `http://localhost.attacker.example`: " +
		"parse the value with `url.Parse` and compare the `Host` for equality"
)

var (
	originOnly   = regexp.MustCompile(`(?i)^https?://[^/]+$`)
	pathShaped   = regexp.MustCompile(`^(?:[/~@]|[\w.-]+/)`)
	alphanumeric = regexp.MustCompile(`[A-Za-z0-9]`)
	walkFunction = []string{"Walk", "WalkDir"}
)

func runPrefix(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) || len(call.Args) != 2 {
			continue
		}
		message := messageFor(pass.TypesInfo, call)
		if message != "" && !guarded(pass.TypesInfo, cursor, call) {
			pass.Reportf(call.Pos(), "%s", message)
		}
	}
	return nil, nil
}

func messageFor(info *types.Info, call *ast.CallExpr) string {
	receiver, arg := call.Args[0], call.Args[1]
	switch {
	case support.IsFunc(info, call, "strings", "HasPrefix"):
		return prefixKind(info, receiver, arg)
	case support.IsFunc(info, call, "strings", "HasSuffix"):
		literal, isLiteral := constString(info, arg)
		named := isLiteral && alphanumeric.MatchString(literal)
		if (isHostName(arg) || (isHostName(receiver) && named)) && !startsWithBoundary(info, arg) {
			return suffixMessage
		}
	}
	return ""
}

func prefixKind(info *types.Info, receiver, arg ast.Expr) string {
	if literal, ok := constString(info, arg); ok {
		if _, direct := ast.Unparen(arg).(*ast.BasicLit); direct && originOnly.MatchString(literal) {
			return originMessage
		}
		return ""
	}
	built, isBuilt := leadingText(info, arg)
	if isBuilt && pathShaped.MatchString(built) && isLocationName(receiver) {
		if endsWithBoundary(info, arg, 0) {
			return ""
		}
		return prefixMessage
	}
	if isDirectoryName(arg) && !endsWithBoundary(info, arg, 0) {
		return prefixMessage
	}
	return ""
}

func conditionRoot(cursor inspector.Cursor) ast.Node {
	current := cursor
	for {
		parent := current.Parent()
		switch typed := parent.Node().(type) {
		case *ast.ParenExpr, *ast.UnaryExpr:
			current = parent
			continue
		case *ast.BinaryExpr:
			if typed.Op == token.LAND || typed.Op == token.LOR {
				current = parent
				continue
			}
		}
		return current.Node()
	}
}

func guarded(info *types.Info, cursor inspector.Cursor, call *ast.CallExpr) bool {
	receiver, arg := text(call.Args[0]), text(call.Args[1])
	found := false
	ast.Inspect(conditionRoot(cursor), func(node ast.Node) bool {
		switch typed := node.(type) {
		case *ast.BinaryExpr:
			found = found || equalPair(typed, receiver, arg) || indexedBoundary(typed, receiver)
		case *ast.CallExpr:
			found = found || (typed != call && anchoredSibling(info, typed, receiver, arg))
		}
		return !found
	})
	if found {
		return true
	}
	if walkedRoot(cursor, arg) {
		return true
	}
	if function, ok := support.EnclosingFunc(cursor); ok {
		ast.Inspect(function.Node(), func(node ast.Node) bool {
			other, isCall := node.(*ast.CallExpr)
			found = found || (isCall && other != call && leadingCheck(info, other, arg)) ||
				boundaryAssignment(info, node, arg)
			return !found
		})
	}
	return found
}

func walkedRoot(cursor inspector.Cursor, arg string) bool {
	for ancestor := range cursor.Enclosing((*ast.CallExpr)(nil)) {
		walk := ancestor.Node().(*ast.CallExpr)
		if slices.Contains(walkFunction, nameOf(walk.Fun)) && len(walk.Args) > 0 && text(walk.Args[0]) == arg {
			return true
		}
	}
	return false
}

func boundaryAssignment(info *types.Info, node ast.Node, arg string) bool {
	assignment, ok := node.(*ast.AssignStmt)
	if !ok || len(assignment.Lhs) != len(assignment.Rhs) {
		return false
	}
	for index, left := range assignment.Lhs {
		if text(left) == arg && endsWithBoundary(info, assignment.Rhs[index], 0) {
			return true
		}
	}
	return false
}

func equalPair(binary *ast.BinaryExpr, receiver, arg string) bool {
	if binary.Op != token.EQL {
		return false
	}
	left, right := text(binary.X), text(binary.Y)
	return (left == receiver && right == arg) || (left == arg && right == receiver)
}

func indexedBoundary(binary *ast.BinaryExpr, receiver string) bool {
	if binary.Op != token.EQL && binary.Op != token.NEQ {
		return false
	}
	for _, pair := range [][2]ast.Expr{{binary.X, binary.Y}, {binary.Y, binary.X}} {
		index, isIndex := pair[0].(*ast.IndexExpr)
		if isIndex && text(index.X) == receiver {
			return true
		}
	}
	return false
}

func leadingCheck(info *types.Info, call *ast.CallExpr, arg string) bool {
	return len(call.Args) == 2 && support.IsFunc(info, call, "strings", "HasPrefix") && text(call.Args[0]) == arg &&
		startsWithBoundary(info, call.Args[1])
}

func anchoredSibling(info *types.Info, call *ast.CallExpr, receiver, arg string) bool {
	isCheck := len(call.Args) == 2 &&
		(support.IsFunc(info, call, "strings", "HasPrefix") || support.IsFunc(info, call, "strings", "HasSuffix"))
	return isCheck && text(call.Args[0]) == receiver && strings.Contains(text(call.Args[1]), arg) &&
		endsWithBoundary(info, call.Args[1], 0)
}
