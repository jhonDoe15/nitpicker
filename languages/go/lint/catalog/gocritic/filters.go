package gocritic

import (
	"strings"

	"github.com/go-critic/go-critic/linter"
)

const rootJoin = `"/" contains a path separator`

func kept(checker string, warning linter.Warning) bool {
	return checker != "filepathJoin" || !strings.HasPrefix(warning.Text, rootJoin)
}
