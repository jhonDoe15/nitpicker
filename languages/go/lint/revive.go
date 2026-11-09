package main

import (
	"errors"
	"maps"
	"os"
	"path/filepath"
	"regexp"
	"slices"
	"strings"

	"github.com/mgechev/revive/lint"
	"golang.org/x/tools/go/packages"
)

const (
	reviveTool       = "revive"
	reviveConfidence = 0.8
	internalCategory = "REVIVE_INTERNAL"
	validityCategory = "validity"
)

var reviveDirective = regexp.MustCompile(`//([ \t]*)revive:`)

func withoutDirectives(path string) ([]byte, error) {
	content, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	return reviveDirective.ReplaceAll(content, []byte("//${1}review:")), nil
}

func reviveFiles(loaded []*packages.Package) [][]string {
	groups := map[string]map[string]bool{}
	for _, pkg := range loaded {
		if strings.HasSuffix(pkg.PkgPath, ".test") {
			continue
		}
		for _, file := range pkg.GoFiles {
			key := filepath.Dir(file) + "\x00" + pkg.Name
			if groups[key] == nil {
				groups[key] = map[string]bool{}
			}
			groups[key][file] = true
		}
	}
	files := [][]string{}
	for _, key := range slices.Sorted(maps.Keys(groups)) {
		files = append(files, slices.Sorted(maps.Keys(groups[key])))
	}
	return files
}

func reviveFindings(loaded []*packages.Package) ([]Finding, error) {
	rules, err := configuredRules()
	if err != nil {
		return nil, err
	}
	linter := lint.New(withoutDirectives, 0)
	config := lint.Config{Confidence: reviveConfidence, Rules: lint.RulesConfig{}}
	failures, err := linter.Lint(reviveFiles(loaded), rules, config)
	if err != nil {
		return nil, err
	}
	findings := []Finding{}
	var problems []string
	for failure := range failures {
		switch failure.Category {
		case internalCategory:
			problems = append(problems, "revive: "+failure.Failure)
		case validityCategory:
		default:
			findings = append(findings, reviveFinding(failure))
		}
	}
	if len(problems) > 0 {
		return nil, errors.New(strings.Join(problems, "\n"))
	}
	return findings, nil
}

func reviveFinding(failure lint.Failure) Finding {
	start := failure.Position.Start
	return Finding{
		Tool: reviveTool, Rule: failure.RuleName, File: start.Filename,
		Line: start.Line, Column: start.Column, Message: failure.Failure,
	}
}
