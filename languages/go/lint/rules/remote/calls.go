package remote

import (
	"go/ast"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/types/typeutil"
)

type client struct {
	path    string
	types   []string
	methods []string
}

var queries = []string{
	"Query", "QueryContext", "QueryRow", "QueryRowContext", "Exec", "ExecContext", "Prepare", "PrepareContext",
}

var clients = []client{
	{path: "database/sql", types: []string{"DB", "Tx", "Conn", "Stmt"}, methods: queries},
	{path: "net/http", types: []string{"Client"}, methods: []string{"Do", "Get", "Post", "Head", "PostForm"}},
	{path: "github.com/jackc/pgx", methods: []string{"Query", "QueryRow", "Exec", "CopyFrom"}},
	{path: "github.com/jmoiron/sqlx", methods: append([]string{
		"Get", "GetContext", "Select", "SelectContext", "Queryx", "QueryRowx", "NamedExec", "NamedExecContext",
		"NamedQuery", "NamedQueryContext",
	}, queries...)},
	{path: "gorm.io/gorm", types: []string{"DB"}, methods: []string{
		"First", "Find", "Take", "Last", "Create", "Save", "Update", "Updates", "Delete", "Exec", "Scan", "Count", "Pluck",
	}},
}

func remoteCall(info *types.Info, call *ast.CallExpr) bool {
	for _, name := range defaultClientFunctions {
		if support.IsFunc(info, call, "net/http", name) {
			return true
		}
	}
	method, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || method.Signature().Recv() == nil {
		return false
	}
	named, isNamed := types.Unalias(support.Deref(method.Signature().Recv().Type())).(*types.Named)
	if !isNamed || named.Obj().Pkg() == nil {
		return false
	}
	return slices.ContainsFunc(clients, func(each client) bool {
		return each.matches(named.Obj(), method.Name())
	})
}

func (each client) matches(object *types.TypeName, method string) bool {
	path := object.Pkg().Path()
	if path != each.path && !strings.HasPrefix(path, each.path+"/") {
		return false
	}
	if each.types != nil && !slices.Contains(each.types, object.Name()) {
		return false
	}
	return slices.Contains(each.methods, method)
}
