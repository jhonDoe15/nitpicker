package modernize

import "strings"

func Version(tag string) string {
	if strings.HasPrefix(tag, "v") { // want stringscutprefix
		return strings.TrimPrefix(tag, "v")
	}
	return ""
}

func VersionCut(tag string) string {
	if rest, ok := strings.CutPrefix(tag, "v"); ok {
		return rest
	}
	return ""
}
