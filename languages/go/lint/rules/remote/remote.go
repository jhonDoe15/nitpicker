package remote

import "golang.org/x/tools/go/analysis"

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{timeoutAnalyzer, loopAnalyzer}
}
