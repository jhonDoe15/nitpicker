package database

import "golang.org/x/tools/go/analysis"

func Analyzers() []*analysis.Analyzer {
	return []*analysis.Analyzer{splitAnalyzer, outerAnalyzer}
}
