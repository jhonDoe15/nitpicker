package guards

import "golang.org/x/tools/go/analysis"

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{swallowedAnalyzer, literalAnalyzer, nameAnalyzer, markerAnalyzer, aliasAnalyzer}
}
