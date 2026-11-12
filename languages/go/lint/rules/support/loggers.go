package support

import (
	"go/ast"
	"go/types"
	"strings"

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

func Exits(name string) bool {
	return strings.HasPrefix(name, "Fatal") || strings.HasPrefix(name, "Panic") || strings.HasPrefix(name, "Exit")
}

func CalleePackage(callee *types.Func) string {
	if signature, ok := callee.Type().(*types.Signature); ok && signature.Recv() != nil {
		if named, isNamed := types.Unalias(Deref(signature.Recv().Type())).(*types.Named); isNamed {
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

func LoggerCall(info *types.Info, call *ast.CallExpr) (*types.Func, bool) {
	callee, ok := typeutil.Callee(info, call).(*types.Func)
	if !ok || !loggerPackage(CalleePackage(callee)) {
		return nil, false
	}
	return callee, true
}
