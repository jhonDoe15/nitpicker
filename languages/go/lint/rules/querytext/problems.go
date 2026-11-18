package querytext

import (
	"fmt"
	"regexp"
	"strings"
)

const (
	opaque  = "\x01"
	snippet = 40
)

var (
	fullQuery = regexp.MustCompile(`(?i)^\s*(?:select|insert\s+into|update\s+\S+\s+set|delete\s+from|merge\s+into|` +
		`with\s+\S+\s+as)\b`)
	fragment = regexp.MustCompile(`(?i)^\s*(?:and|or|where|order\s+by|group\s+by|having|limit|set|on|` +
		`(?:left\s+|inner\s+|right\s+)?join)\b`)
	endOperator = regexp.MustCompile(`(?i)(<>|!=|<=|>=|[=<>]|\b(?:not\s+)?(?:i?like|in|between))\s*$`)
	midOperator = regexp.MustCompile(`(?i)(?:<>|!=|<=|>=|(?:^|[^-=<>!])=|\b(?:i?like|in))\s+` +
		`(?:and|or|order|group|limit|having|union)\b`)
	structure   = regexp.MustCompile(`(?i)\b(?:from|where|set|values|join|and|or|on|having)\b`)
	insertQuery = regexp.MustCompile(`(?i)insert\s+into\s+[^\s(]+\s*\(([^)]*)\)\s*values\s*\(`)
	scriptCall  = regexp.MustCompile(`redis\.call\(`)
	wordEnd     = regexp.MustCompile(`[A-Za-z0-9_]$`)
	wordStart   = regexp.MustCompile(`^[A-Za-z0-9_]`)
	firstWord   = regexp.MustCompile(`^([A-Za-z]+)`)
	lastWord    = regexp.MustCompile(`([A-Za-z]+)$`)
	spaces      = regexp.MustCompile(`\s+`)
	keywords    = map[string]bool{"select": true, "from": true, "where": true, "and": true, "or": true, "on": true,
		"set": true, "values": true, "join": true, "group": true, "order": true, "by": true, "having": true,
		"limit": true, "offset": true, "union": true, "then": true, "else": true, "end": true, "local": true}
)

func isFullQuery(text string) bool { return fullQuery.MatchString(text) }

func isQueryText(text string) bool { return isFullQuery(text) || fragment.MatchString(text) }

func topLevelCount(text string) int {
	depth, count := 0, 0
	quote := rune(0)
	if strings.TrimSpace(text) != "" {
		count = 1
	}
	for _, character := range text {
		switch {
		case quote != 0:
			if character == quote {
				quote = 0
			}
		case character == '\'' || character == '"':
			quote = character
		case strings.ContainsRune("([{", character):
			depth++
		case strings.ContainsRune(")]}", character):
			depth--
		case character == ',' && depth == 0:
			count++
		}
	}
	return count
}

func valuesList(text string, start int) (string, bool) {
	depth := 1
	quote := byte(0)
	for index := start; index < len(text); index++ {
		character := text[index]
		switch {
		case quote != 0:
			if character == quote {
				quote = 0
			}
		case character == '\'' || character == '"':
			quote = character
		case character == '(':
			depth++
		case character == ')':
			depth--
		}
		if depth == 0 {
			return text[start:index], true
		}
	}
	return "", false
}

func columnCountProblem(text string) string {
	match := insertQuery.FindStringSubmatchIndex(text)
	if match == nil {
		return ""
	}
	values, ok := valuesList(text, match[1])
	columnList := text[match[2]:match[3]]
	if !ok || strings.Contains(values, opaque) || strings.Contains(columnList, opaque) {
		return ""
	}
	columns, given := topLevelCount(columnList), topLevelCount(values)
	if columns == given {
		return ""
	}
	return fmt.Sprintf("The INSERT lists %d columns but %d values, so the statement fails: give each column one "+
		"value or bind placeholder", columns, given)
}

func around(text string, index int) string {
	window := text[max(0, index-snippet):min(len(text), index+snippet)]
	return strings.TrimSpace(spaces.ReplaceAllString(strings.ReplaceAll(window, opaque, "?"), " "))
}

func operandMessage(text string, index int) string {
	return fmt.Sprintf("The query text `...%s...` has a comparison operator with no operand after it, so the "+
		"statement fails on the path that uses this fragment: add a bind placeholder (`LIKE ?`) or the value",
		around(text, index))
}

func textProblem(text string, complete bool) string {
	if !isQueryText(text) {
		return ""
	}
	structured := structure.MatchString(text)
	if structured {
		if middle := midOperator.FindStringIndex(text); middle != nil {
			return operandMessage(text, middle[0])
		}
	}
	if complete && structured {
		if end := endOperator.FindStringSubmatchIndex(text); end != nil && !singleAfterOperator(text, end) {
			return operandMessage(text, end[0])
		}
	}
	return columnCountProblem(text)
}

func singleAfterOperator(text string, match []int) bool {
	operator := text[match[2]:match[3]]
	return len(operator) == 1 && match[2] > 0 && strings.ContainsRune("-=<>!", rune(text[match[2]-1]))
}

func runTogether(left, right string) string {
	last, first := lastWord.FindString(left), firstWord.FindString(right)
	together := wordEnd.MatchString(left) && wordStart.MatchString(right)
	related := isQueryText(left) || isQueryText(right) || scriptCall.MatchString(left+right)
	if !together || !related || !(keywords[strings.ToLower(last)] || keywords[strings.ToLower(first)]) {
		return ""
	}
	half := snippet / 2
	joined := left[max(0, len(left)-half):] + right[:min(len(right), half)]
	return fmt.Sprintf("The query parts join into `...%s...`, which runs two words together: start each appended "+
		"fragment with a space", spaces.ReplaceAllString(joined, " "))
}
