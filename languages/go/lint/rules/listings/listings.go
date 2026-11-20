package listings

import (
	"go/ast"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/ast/inspector"
	"golang.org/x/tools/go/types/typeutil"
)

var Analyzer = &analysis.Analyzer{
	Name:     "unpaged_listing",
	Doc:      "reports an object-store or search listing read once without following its page marker",
	Requires: support.Requires,
	Run:      run,
}

const (
	listingMessage = "An object-store listing returns one page (1000 keys), and the rest is silently ignored: use the " +
		"paginator (`s3.NewListObjectsV2Paginator`), or loop on `NextContinuationToken` and `IsTruncated`; an " +
		"existence check sets `MaxKeys` to 1"
	searchMessage = "RediSearch `FT.SEARCH` returns 10 documents by default, so the rest is ignored: pass " +
		"`FTSearchOptions{LimitOffset: 0, Limit: n}` and loop on the offset until a page comes back short"
)

var (
	listCalls     = []string{"ListObjects", "ListObjectsV2", "ListObjectVersions"}
	searchCalls   = []string{"FTSearch", "FTSearchWithArgs"}
	storePrefixes = []string{"github.com/aws/aws-sdk-go"}
	redisPrefixes = []string{"github.com/redis/go-redis", "github.com/go-redis/redis"}
	markers       = []string{"NextContinuationToken", "ContinuationToken", "IsTruncated", "NextMarker", "Marker",
		"KeyMarker", "NextKeyMarker", "NextVersionIdMarker", "StartAfter", "Paginator", "Pages", "LimitOffset"}
	limitFields = []string{"Limit", "LimitOffset", "Num"}
)

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.CallExpr)(nil)) {
		call := cursor.Node().(*ast.CallExpr)
		if support.InTestFile(pass, call) {
			continue
		}
		name, path := method(pass.TypesInfo, call)
		switch {
		case slices.Contains(listCalls, name) && hasPrefix(path, storePrefixes) && unpaged(cursor, call):
			pass.Reportf(call.Pos(), "%s", listingMessage)
		case slices.Contains(searchCalls, name) && hasPrefix(path, redisPrefixes) && unlimited(cursor, call):
			pass.Reportf(call.Pos(), "%s", searchMessage)
		}
	}
	return nil, nil
}

func method(info *types.Info, call *ast.CallExpr) (string, string) {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil {
		return "", ""
	}
	return callee.Name(), callee.Pkg().Path()
}

func hasPrefix(path string, prefixes []string) bool {
	return slices.ContainsFunc(prefixes, func(prefix string) bool { return strings.HasPrefix(path, prefix) })
}

func mentionsMarker(cursor inspector.Cursor) bool {
	function, ok := support.EnclosingFunc(cursor)
	root := ast.Node(nil)
	if ok {
		root = function.Node()
	} else {
		root = cursor.Node()
	}
	found := false
	ast.Inspect(root, func(node ast.Node) bool {
		name := ""
		switch typed := node.(type) {
		case *ast.Ident:
			name = typed.Name
		case *ast.SelectorExpr:
			name = typed.Sel.Name
		}
		found = found || slices.ContainsFunc(markers, func(marker string) bool { return strings.Contains(name, marker) })
		return !found
	})
	return found
}

func hasField(call *ast.CallExpr, fields []string) bool {
	found := false
	for _, argument := range call.Args {
		ast.Inspect(argument, func(node ast.Node) bool {
			pair, ok := node.(*ast.KeyValueExpr)
			if key, isIdent := pairKey(pair, ok); isIdent {
				found = found || slices.Contains(fields, key)
			}
			return true
		})
	}
	return found
}

func pairKey(pair *ast.KeyValueExpr, ok bool) (string, bool) {
	if !ok {
		return "", false
	}
	key, isIdent := pair.Key.(*ast.Ident)
	if !isIdent {
		return "", false
	}
	return key.Name, true
}

func unpaged(cursor inspector.Cursor, call *ast.CallExpr) bool {
	return !hasField(call, []string{"MaxKeys"}) && !mentionsMarker(cursor)
}

func unlimited(cursor inspector.Cursor, call *ast.CallExpr) bool {
	options := call.Args[len(call.Args)-1]
	if len(call.Args) >= 4 {
		literal, isLiteral := ast.Unparen(options).(*ast.UnaryExpr)
		if !isLiteral {
			return false
		}
		if _, composite := literal.X.(*ast.CompositeLit); !composite {
			return false
		}
	}
	return !hasField(call, limitFields) && !mentionsMarker(cursor)
}
