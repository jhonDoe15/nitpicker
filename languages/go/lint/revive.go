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
	reviveTool        = "revive"
	reviveConfidence  = 0.8
	internalCategory  = "REVIVE_INTERNAL"
	validityCategory  = "validity"
	packageNamingRule = "package-naming"
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
			key := groupKey(file, pkg.Name)
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
	configured, err := configuredRules()
	if err != nil {
		return nil, err
	}
	rules, shared := withTypes(configured, loaded)
	linter := lint.New(withoutDirectives, 0)
	config := lint.Config{Confidence: reviveConfidence, Rules: lint.RulesConfig{}}
	files := reviveFiles(loaded)
	failures, err := linter.Lint(files, rules, config)
	if err != nil {
		return nil, err
	}
	first := firstFiles(files)
	findings := []Finding{}
	var problems []string
	for failure := range failures {
		switch failure.Category {
		case internalCategory:
			problems = append(problems, "revive: "+failure.Failure)
		case validityCategory:
		default:
			findings = append(findings, reviveFinding(failure, first))
		}
	}
	if len(problems) > 0 {
		return nil, errors.New(strings.Join(problems, "\n"))
	}
	if err := shared.err(); err != nil {
		return nil, err
	}
	return findings, nil
}

func firstFiles(groups [][]string) map[string]string {
	first := map[string]string{}
	for _, files := range groups {
		directory := filepath.Dir(files[0])
		if current, found := first[directory]; !found || files[0] < current {
			first[directory] = files[0]
		}
	}
	return first
}

func reviveFinding(failure lint.Failure, first map[string]string) Finding {
	start := failure.Position.Start
	found := Finding{
		Tool: reviveTool, Rule: failure.RuleName, File: start.Filename,
		Line: start.Line, Column: start.Column, Message: failure.Failure,
	}
	if found.Rule == packageNamingRule {
		found.File, found.Line, found.Column = first[filepath.Dir(found.File)], 1, 1
	}
	return found
}
