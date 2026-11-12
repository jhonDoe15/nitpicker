package guards

import (
	"go/ast"
	"go/token"
	"regexp"
	"slices"
	"strings"
	"unicode"

	"github.com/jhonDoe15/nitpicker/languages/go/lint/rules/support"
	"golang.org/x/tools/go/analysis"
)

var markerAnalyzer = &analysis.Analyzer{
	Name:     "todo_without_issue",
	Doc:      "reports a TODO, FIXME, XXX or HACK comment without an issue reference",
	Requires: support.Requires,
	Run:      runMarkers,
}

const markerMessage = "a task marker without an issue is never picked up: file the issue and write " +
	"`TODO(#123): ...` (or the tracker's key, `TODO(PROJ-123)`), or do the work now"

var (
	taskMarker      = regexp.MustCompile(`TODO|FIXME|XXX|HACK`)
	directReference = regexp.MustCompile(`^(?:\(\s*(#\d+|[A-Z][A-Z0-9]+-\d+|https?://\S+)\s*\)|:?\s+` +
		`(#\d+|[A-Z][A-Z0-9]+-\d+|https?://\S+))`)
	notIssueKeys = []string{
		"SHA", "UTF", "ISO", "RFC", "MD", "AES", "RSA", "TLS", "SSL", "HTTP", "ES", "ECMA", "IEEE", "CVE",
	}
)

func runMarkers(pass *analysis.Pass) (any, error) {
	for _, file := range pass.Files {
		if ast.IsGenerated(file) {
			continue
		}
		for _, group := range file.Comments {
			for _, comment := range group.List {
				reportMarkers(pass, comment)
			}
		}
	}
	return nil, nil
}

func reportMarkers(pass *analysis.Pass, comment *ast.Comment) {
	offset := 0
	for line := range strings.SplitSeq(commentBody(comment.Text), "\n") {
		body := strings.TrimLeft(strings.TrimSpace(line), "* ")
		if unreferencedMarker(body) {
			pass.Reportf(lineStart(pass, comment.Slash, offset), "%s", markerMessage)
		}
		offset++
	}
}

func commentBody(text string) string {
	if body, found := strings.CutPrefix(text, "//"); found {
		return body
	}
	return strings.TrimSuffix(strings.TrimPrefix(text, "/*"), "*/")
}

func lineStart(pass *analysis.Pass, start token.Pos, offset int) token.Pos {
	if offset == 0 {
		return start
	}
	file := pass.Fset.File(start)
	return file.LineStart(file.Line(start) + offset)
}

func unreferencedMarker(line string) bool {
	for _, bounds := range taskMarker.FindAllStringIndex(line, -1) {
		if !standalone(line, bounds[0], bounds[1]) {
			continue
		}
		rest := line[bounds[1]:]
		follows := bounds[0] == 0 || strings.HasPrefix(rest, ":") || strings.HasPrefix(rest, "(")
		if follows && !referenced(rest) {
			return true
		}
	}
	return false
}

func standalone(line string, start, end int) bool {
	if start > 0 && (wordCharacter(rune(line[start-1])) || strings.ContainsRune("./-", rune(line[start-1]))) {
		return false
	}
	if end < len(line) && (wordCharacter(rune(line[end])) || line[end] == '-') {
		return false
	}
	return !(end+1 < len(line) && strings.ContainsRune("./", rune(line[end])) && wordCharacter(rune(line[end+1])))
}

func wordCharacter(character rune) bool {
	return character == '_' || unicode.IsLetter(character) || unicode.IsDigit(character)
}

func referenced(rest string) bool {
	match := directReference.FindStringSubmatch(rest)
	if match == nil {
		return false
	}
	reference := match[1] + match[2]
	return !slices.Contains(notIssueKeys, strings.Split(reference, "-")[0])
}
