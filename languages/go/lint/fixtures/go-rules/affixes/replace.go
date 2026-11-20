package affixes

import (
	"net/url"
	"strings"
)

func RepositoryName(part string) string {
	return strings.Replace(part, ".git", "", 1) // want unanchored-affix-replace
}

func Shorten(path, homeDir string) string {
	return strings.Replace(path, homeDir, "~", 1) // want unanchored-affix-replace
}

func Move(raw string, parsed *url.URL, next string) string {
	return strings.Replace(raw, parsed.Port(), next, 1) // want unanchored-affix-replace
}

func Trimmed(part string) string {
	return strings.TrimSuffix(part, ".git")
}

func Guarded(part string) string {
	if strings.HasSuffix(part, ".git") {
		return strings.Replace(part, ".git", "", 1)
	}
	return part
}

func Everywhere(part string) string {
	return strings.ReplaceAll(part, ".git", "")
}

func Renamed(part string) string {
	return strings.Replace(part, ".", "_", 1)
}
