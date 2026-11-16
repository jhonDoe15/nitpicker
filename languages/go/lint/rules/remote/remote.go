package remote

import (
	"go/ast"
	"go/types"

	"golang.org/x/tools/go/analysis"
)

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{timeoutAnalyzer, loopAnalyzer}
}

func IsCall(info *types.Info, call *ast.CallExpr) bool {
	return remoteCall(info, call)
}
