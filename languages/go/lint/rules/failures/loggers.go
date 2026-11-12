package failures

import (
	"go/ast"
	"go/types"
	"strings"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/types/typeutil"
)

var loggerPackages = []string{
	"log", "log/slog", "go.uber.org/zap", "github.com/rs/zerolog", "github.com/sirupsen/logrus",
	"github.com/go-kit/log", "k8s.io/klog", "github.com/go-logr/logr", "github.com/hashicorp/go-hclog",
	"github.com/charmbracelet/log", "github.com/apex/log",
}

func loggerPackage(path string) bool {
	for _, each := range loggerPackages {
		if path == each || strings.HasPrefix(path, each+"/") {
			return true
		}
	}
	return false
}

func exits(name string) bool {
	return strings.HasPrefix(name, "Fatal") || strings.HasPrefix(name, "Panic") || strings.HasPrefix(name, "Exit")
}

func calleePackage(callee *types.Func) string {
	if signature, ok := callee.Type().(*types.Signature); ok && signature.Recv() != nil {
		if named, isNamed := types.Unalias(support.Deref(signature.Recv().Type())).(*types.Named); isNamed {
			if named.Obj().Pkg() != nil {
				return named.Obj().Pkg().Path()
			}
		}
	}
	if callee.Pkg() == nil {
		return ""
	}
	return callee.Pkg().Path()
}

func logs(info *types.Info, statement ast.Stmt) bool {
	expression, ok := statement.(*ast.ExprStmt)
	if !ok {
		return false
	}
	found, exited := false, false
	ast.Inspect(expression.X, func(node ast.Node) bool {
		call, isCall := node.(*ast.CallExpr)
		if !isCall {
			return true
		}
		if callee, isFunc := typeutil.Callee(info, call).(*types.Func); isFunc && loggerPackage(calleePackage(callee)) {
			found = true
			exited = exited || exits(callee.Name())
		}
		return true
	})
	return found && !exited
}
