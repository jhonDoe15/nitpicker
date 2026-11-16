package requests

import (
	"go/ast"
	"go/types"
	"regexp"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
	"golang.org/x/tools/go/types/typeutil"
)

const message = "%s comes from the request untrimmed and reaches a lookup, so a padded value finds nothing: " +
	"wrap the read in `strings.TrimSpace(...)`, in one helper that reads every query value. " +
	"An exception fits only when the exact bytes of the text matter"

var Analyzer = &analysis.Analyzer{
	Name:     "untrimmed_request_text",
	Doc:      "reports request text that reaches a lookup without strings.TrimSpace",
	Requires: support.Requires,
	Run:      run,
}

var identifierName = regexp.MustCompile(
	`(?i)(?:^|_)(?:id|ids|uuid|guid|key|token|code|slug|hash|status|type|role|kind|sort|order|page|limit|offset|cursor)$` +
		`|[a-z](?:Id|Ids|Uuid|Guid|Key|Token|Code|Slug|Hash|Status|Type|Role|Kind)$`)

var finderPrefix = regexp.MustCompile(`^(?:Find\w*By|Search|Lookup|Get\w*By|List\w*By|Count\w*By)`)

var predicateName = regexp.MustCompile(`(?:Contains|ContainsFold|HasPrefix|HasSuffix|EqualFold|EQ)$`)

var queryMethods = map[string]bool{
	"Query": true, "QueryContext": true, "QueryRow": true, "QueryRowContext": true, "Queryx": true,
	"QueryRowx": true, "Get": true, "GetContext": true, "Select": true, "SelectContext": true, "Where": true,
	"Or": true, "Not": true, "First": true, "Find": true, "Take": true,
}

var databasePackages = []string{"database/sql", "github.com/jmoiron/sqlx", "github.com/jackc/pgx", "gorm.io/gorm"}

var requestReaders = map[string][]string{
	"net/http":                    {"FormValue", "PostFormValue"},
	"net/url":                     {"Get"},
	"github.com/gin-gonic/gin":    {"Query", "DefaultQuery", "PostForm", "DefaultPostForm"},
	"github.com/labstack/echo/v4": {"QueryParam", "FormValue"},
	"github.com/gofiber/fiber/v2": {"Query", "FormValue"},
}

type read struct {
	name string
	node ast.Node
}

func run(pass *analysis.Pass) (any, error) {
	for cursor := range support.Root(pass).Preorder((*ast.FuncDecl)(nil), (*ast.FuncLit)(nil)) {
		body := bodyOf(cursor.Node())
		if body == nil || support.InTestFile(pass, cursor.Node()) {
			continue
		}
		checkBody(pass, body)
	}
	return nil, nil
}

func bodyOf(node ast.Node) *ast.BlockStmt {
	switch function := node.(type) {
	case *ast.FuncDecl:
		return function.Body
	case *ast.FuncLit:
		return function.Body
	}
	return nil
}

type scan struct {
	pass     *analysis.Pass
	declared map[types.Object]read
	trimmed  map[types.Object]bool
	reported map[types.Object]bool
}

func checkBody(pass *analysis.Pass, body *ast.BlockStmt) {
	state := &scan{
		pass:     pass,
		declared: map[types.Object]read{},
		trimmed:  map[types.Object]bool{},
		reported: map[types.Object]bool{},
	}
	ast.Inspect(body, func(node ast.Node) bool {
		if assignment, ok := node.(*ast.AssignStmt); ok {
			state.record(assignment)
		}
		return true
	})
	ast.Inspect(body, func(node ast.Node) bool {
		if call, ok := node.(*ast.CallExpr); ok {
			for _, argument := range lookupArguments(pass, call) {
				state.report(argument)
			}
		}
		return true
	})
}

func (state *scan) record(assignment *ast.AssignStmt) {
	if len(assignment.Lhs) != len(assignment.Rhs) {
		return
	}
	for index, left := range assignment.Lhs {
		identifier, ok := left.(*ast.Ident)
		if !ok || identifier.Name == "_" {
			continue
		}
		object := state.pass.TypesInfo.ObjectOf(identifier)
		if name, raw := rawRead(state.pass, assignment.Rhs[index]); raw {
			state.declared[object] = read{name: name, node: identifier}
		} else if isTrimming(assignment.Rhs[index]) {
			state.trimmed[object] = true
		}
	}
}

func isTrimming(expression ast.Expr) bool {
	call, ok := ast.Unparen(expression).(*ast.CallExpr)
	if !ok {
		return false
	}
	name := strings.ToLower(types.ExprString(call.Fun))
	return strings.Contains(name, "trim") || strings.Contains(name, "strip")
}

func (state *scan) report(argument ast.Expr) {
	argument = ast.Unparen(argument)
	if identifier, ok := argument.(*ast.Ident); ok {
		object := state.pass.TypesInfo.ObjectOf(identifier)
		entry, found := state.declared[object]
		fresh := found && !state.trimmed[object] && !state.reported[object]
		if fresh && !identifierName.MatchString(entry.name) {
			state.reported[object] = true
			state.pass.Reportf(entry.node.Pos(), message, identifier.Name)
		}
		return
	}
	if name, raw := rawRead(state.pass, argument); raw && !identifierName.MatchString(name) {
		state.pass.Reportf(argument.Pos(), message, types.ExprString(argument))
	}
}

func rawRead(pass *analysis.Pass, expression ast.Expr) (string, bool) {
	call, ok := ast.Unparen(expression).(*ast.CallExpr)
	if !ok || len(call.Args) == 0 {
		return "", false
	}
	callee, ok := typeutil.Callee(pass.TypesInfo, call).(*types.Func)
	if !ok || callee.Pkg() == nil || !readsRequest(callee) {
		return "", false
	}
	key := ""
	if literal, isLiteral := ast.Unparen(call.Args[0]).(*ast.BasicLit); isLiteral {
		key = strings.Trim(literal.Value, "\"`")
	}
	return key, true
}

func readsRequest(callee *types.Func) bool {
	for path, names := range requestReaders {
		if callee.Pkg().Path() == path {
			for _, name := range names {
				if callee.Name() == name {
					return true
				}
			}
		}
	}
	return false
}

func lookupArguments(pass *analysis.Pass, call *ast.CallExpr) []ast.Expr {
	callee, ok := typeutil.Callee(pass.TypesInfo, call).(*types.Func)
	if !ok {
		return nil
	}
	name := callee.Name()
	if finderPrefix.MatchString(name) || predicateName.MatchString(name) && !isStandard(callee) {
		if suffix := finderField(name); suffix != "" && identifierName.MatchString(suffix) {
			return nil
		}
		return call.Args
	}
	if queryMethods[name] && inDatabasePackage(callee) && len(call.Args) > 1 {
		return call.Args[1:]
	}
	return nil
}

func finderField(name string) string {
	if index := strings.Index(name, "By"); index >= 0 {
		return name[index+2:]
	}
	return ""
}

func isStandard(callee *types.Func) bool {
	return callee.Pkg() == nil || !strings.Contains(strings.Split(callee.Pkg().Path(), "/")[0], ".")
}

func inDatabasePackage(callee *types.Func) bool {
	for _, path := range databasePackages {
		if strings.HasPrefix(callee.Pkg().Path(), path) {
			return true
		}
	}
	return false
}
