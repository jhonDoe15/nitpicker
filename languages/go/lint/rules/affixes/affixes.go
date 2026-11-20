package affixes

import "golang.org/x/tools/go/analysis"

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{PrefixAnalyzer, ReplaceAnalyzer}
}
