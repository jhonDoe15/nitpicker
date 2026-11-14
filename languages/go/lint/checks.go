package main

import (
	"path/filepath"
	"strings"
	"unicode"

	"honnef.co/go/tools/config"
)

type projectChecks map[string][]string

func (checks projectChecks) enabled(found Finding) (bool, error) {
	if found.Tool != staticcheckTool {
		return true, nil
	}
	directory := filepath.Dir(found.File)
	selection, cached := checks[directory]
	if !cached {
		loaded, err := config.Load(directory)
		if err != nil {
			return false, err
		}
		selection = loaded.Checks
		checks[directory] = selection
	}
	return selects(selection, found.Rule), nil
}

func selects(selection []string, rule string) bool {
	enabled := false
	for _, check := range selection {
		value := true
		if len(check) > 1 && check[0] == '-' {
			value = false
			check = check[1:]
		}
		if matches(check, rule) {
			enabled = value
		}
	}
	return enabled
}

func matches(check, rule string) bool {
	if check == "*" || check == "all" {
		return true
	}
	prefix, glob := strings.CutSuffix(check, "*")
	if !glob {
		return check == rule
	}
	if strings.IndexFunc(prefix, unicode.IsNumber) == -1 {
		return strings.TrimRightFunc(rule, unicode.IsNumber) == prefix
	}
	return strings.HasPrefix(rule, prefix)
}
