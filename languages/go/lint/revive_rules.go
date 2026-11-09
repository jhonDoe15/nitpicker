package main

import (
	"fmt"

	"github.com/mgechev/revive/lint"
	"github.com/mgechev/revive/rule"
)

const fileNameFormat = `^[a-z0-9]+(_[a-z0-9]+)*\.go$`

func reviveSettings() map[string]lint.Arguments {
	return map[string]lint.Arguments{
		"enforce-map-style":               {"literal"},
		"enforce-slice-style":             {"literal"},
		"enforce-repeated-arg-type-style": {"short"},
		"enforce-switch-style":            {"allowNoDefault"},
		"filename-format":                 {fileNameFormat},
	}
}

func reviveRules() []lint.Rule {
	return []lint.Rule{
		&rule.BareReturnRule{}, &rule.BlankImportsRule{}, &rule.BoolLiteralRule{}, &rule.CallToGCRule{},
		&rule.CommentSpacingsRule{}, &rule.ConfusingResultsRule{}, &rule.ContextAsArgumentRule{},
		&rule.DataRaceRule{}, &rule.DeepExitRule{}, &rule.DeferRule{}, &rule.EarlyReturnRule{},
		&rule.EmptyBlockRule{}, &rule.EnforceMapStyleRule{}, &rule.EnforceRepeatedArgTypeStyleRule{},
		&rule.EnforceSliceStyleRule{}, &rule.EnforceSwitchStyleRule{}, &rule.EpochNamingRule{},
		&rule.FilenameFormatRule{}, &rule.FlagParamRule{}, &rule.ForbiddenCallInWgGoRule{}, &rule.GetReturnRule{},
		&rule.IdenticalBranchesRule{}, &rule.IdenticalIfElseIfBranchesRule{}, &rule.IdenticalSwitchBranchesRule{},
		&rule.IdenticalSwitchConditionsRule{}, &rule.IfReturnRule{}, &rule.ImportAliasNamingRule{},
		&rule.ImportShadowingRule{}, &rule.IncrementDecrementRule{}, &rule.IndentErrorFlowRule{},
		&rule.InefficientMapLookupRule{}, &rule.MarshalReceiverRule{}, &rule.ModifiesValRecRule{},
		&rule.MultilineIfInitRule{}, &rule.NestedStructs{}, &rule.PackageDirectoryMismatchRule{},
		&rule.PackageNamingRule{}, &rule.RangeValAddress{}, &rule.RedefinesBuiltinIDRule{},
		&rule.RedundantImportAlias{}, &rule.RedundantTestMainExitRule{}, &rule.StructTagRule{},
		&rule.SuperfluousElseRule{}, &rule.TimeDateRule{}, &rule.TimeEqualRule{}, &rule.UnexportedNamingRule{},
		&rule.UnexportedReturnRule{}, &rule.UnnecessaryFormatRule{}, &rule.UnnecessaryIfRule{},
		&rule.UnnecessaryStmtRule{}, &rule.UnusedParamRule{}, &rule.UnusedReceiverRule{}, &rule.UseFmtPrintRule{},
		&rule.UselessBreak{}, &rule.UselessFallthroughRule{}, &rule.VarDeclarationsRule{},
	}
}

func reviveSuperseded() map[string][]string {
	return map[string][]string{
		"bool-literal-in-expr":    {"S1002"},
		"defer":                   {"SA5003", "SA9001", "SA9010"},
		"empty-block":             {"SA5002", "SA9003"},
		"enforce-switch-style":    {"ST1015"},
		"modifies-value-receiver": {"SA4005"},
		"time-equal":              {"QF1009"},
		"unnecessary-format":      {"S1039"},
		"unnecessary-stmt":        {"S1023", "SA4011"},
		"useless-break":           {"S1023", "SA4011"},
		"var-declaration":         {"QF1011"},
	}
}

func configuredRules() ([]lint.Rule, error) {
	settings := reviveSettings()
	rules := reviveRules()
	for _, each := range rules {
		configurable, ok := each.(lint.ConfigurableRule)
		if !ok {
			continue
		}
		if err := configurable.Configure(settings[each.Name()]); err != nil {
			return nil, fmt.Errorf("revive %s: %w", each.Name(), err)
		}
	}
	return rules, nil
}
