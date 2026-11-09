// Package gocritic runs go-critic's checkers as one go/analysis analyzer that reports each
// finding under the checker's name in the diagnostic's category.
package gocritic

import (
	"fmt"
	"go/version"
	"path/filepath"
	"slices"
	"sync"

	"github.com/go-critic/go-critic/checkers"
	"github.com/go-critic/go-critic/linter"
	"golang.org/x/tools/go/analysis"
)

// Analyzer runs every enabled go-critic checker.
var Analyzer = &analysis.Analyzer{
	Name: "gocritic",
	Doc:  "reports go-critic's checks, each under the checker's name",
	Run:  run,
}

var registered = sync.OnceValues(func() ([]*linter.CheckerInfo, error) {
	if err := checkers.InitEmbeddedRules(); err != nil {
		return nil, err
	}
	return linter.GetCheckersInfo(), nil
})

var selected []*linter.CheckerInfo

// Configure picks the enabled checkers and sets the parameters that differ from go-critic's
// defaults. It fails when go-critic registers a checker this preset has not decided on, or
// no longer registers one it has.
func Configure() error {
	all, err := registered()
	if err != nil {
		return err
	}
	if err := decided(all); err != nil {
		return err
	}
	selected = selected[:0]
	for _, info := range all {
		if !slices.Contains(Enabled, info.Name) {
			continue
		}
		for name, value := range parameters[info.Name] {
			info.Params[name].Value = value
		}
		selected = append(selected, info)
	}
	return nil
}

func decided(all []*linter.CheckerInfo) error {
	names := make([]string, 0, len(all))
	for _, info := range all {
		names = append(names, info.Name)
		if !slices.Contains(Enabled, info.Name) && !slices.Contains(Disabled, info.Name) {
			return fmt.Errorf("go-critic checker %s is neither enabled nor disabled", info.Name)
		}
	}
	for _, name := range slices.Concat(Enabled, Disabled) {
		if !slices.Contains(names, name) {
			return fmt.Errorf("go-critic no longer has the checker %s", name)
		}
	}
	return nil
}

func run(pass *analysis.Pass) (any, error) {
	context := linter.NewContext(pass.Fset, pass.TypesSizes)
	context.SetGoVersion(version.Lang(pass.Pkg.GoVersion()))
	context.SetPackageInfo(pass.TypesInfo, pass.Pkg)
	running := make([]*linter.Checker, 0, len(selected))
	for _, info := range selected {
		checker, err := linter.NewChecker(context, info)
		if err != nil {
			return nil, fmt.Errorf("%s: %w", info.Name, err)
		}
		running = append(running, checker)
	}
	for _, file := range pass.Files {
		context.SetFileInfo(filepath.Base(pass.Fset.Position(file.Pos()).Filename), file)
		for _, checker := range running {
			for _, warning := range checker.Check(file) {
				pass.Report(analysis.Diagnostic{
					Pos: warning.Pos, Category: checker.Info.Name, Message: warning.Text,
				})
			}
		}
	}
	return nil, nil
}
