package database

import (
	"go/ast"
	"go/types"
	"slices"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/types/typeutil"
)

type driver struct {
	path    string
	methods []string
}

var drivers = []driver{
	{"database/sql", []string{"Exec", "ExecContext"}},
	{"github.com/jmoiron/sqlx", []string{
		"Exec", "ExecContext", "NamedExec", "NamedExecContext", "MustExec", "MustExecContext",
	}},
	{"github.com/jackc/pgx", []string{"Exec", "CopyFrom"}},
	{"gorm.io/gorm", []string{
		"Create", "CreateInBatches", "Save", "Update", "Updates", "UpdateColumn", "UpdateColumns", "Delete", "Exec",
	}},
}

var openers = []string{
	"Begin", "BeginTx", "BeginTxx", "Beginx", "MustBegin", "MustBeginTx", "Transaction", "BeginFunc", "BeginTxFunc",
}

type write struct {
	call  *ast.CallExpr
	table string
	tx    bool
	gorm  bool
	root  ast.Expr
}

func inPackage(path, base string) bool {
	return path == base || strings.HasPrefix(path, base+"/")
}

func writeOf(info *types.Info, call *ast.CallExpr) (write, bool) {
	selector, isSelector := ast.Unparen(call.Fun).(*ast.SelectorExpr)
	method, isFunc := typeutil.Callee(info, call).(*types.Func)
	if !isSelector || !isFunc || method.Pkg() == nil || method.Signature().Recv() == nil {
		return write{}, false
	}
	index := slices.IndexFunc(drivers, func(each driver) bool {
		return inPackage(method.Pkg().Path(), each.path) && slices.Contains(each.methods, method.Name())
	})
	if index < 0 {
		return write{}, false
	}
	if drivers[index].path != "gorm.io/gorm" && !handle(method.Signature().Recv().Type()) {
		return write{}, false
	}
	found := write{call: call, tx: isTx(method.Signature().Recv().Type()), gorm: drivers[index].path == "gorm.io/gorm"}
	if found.gorm {
		found.root, found.table = gormChain(info, call, selector.X)
		return found, true
	}
	found.table = statementTable(info, call.Args)
	return found, true
}

func handle(typ types.Type) bool {
	named, ok := types.Unalias(support.Deref(typ)).(*types.Named)
	return ok && slices.Contains([]string{"DB", "Conn", "Pool", "Tx"}, named.Obj().Name())
}

func isTx(typ types.Type) bool {
	named, ok := types.Unalias(support.Deref(typ)).(*types.Named)
	if !ok || named.Obj().Pkg() == nil || named.Obj().Name() != "Tx" {
		return false
	}
	path := named.Obj().Pkg().Path()
	return inPackage(path, "database/sql") || inPackage(path, "github.com/jmoiron/sqlx") ||
		inPackage(path, "github.com/jackc/pgx")
}

func opensTransaction(info *types.Info, call *ast.CallExpr) bool {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || callee.Pkg() == nil || !slices.Contains(openers, callee.Name()) {
		return false
	}
	path := callee.Pkg().Path()
	return slices.ContainsFunc(drivers, func(each driver) bool { return inPackage(path, each.path) })
}
