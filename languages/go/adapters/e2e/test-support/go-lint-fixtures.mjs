export const LOOKUP = `package shop

import (
	"os"
	"strings"
)

func HasDash(name string) bool {
	return strings.Index(name, "-") != -1
}

func Forget(name string) {
	os.Remove(name)
}

func Anything() interface{} {
	return 1
}

func Counts(names []string) map[string]int {
	//revive:disable-next-line:enforce-map-style
	counts := make(map[string]int)
	for _, name := range names {
		counts[name]++
	}
	return counts
}
`;

export const SKIP_S1003 = 'checks = ["all", "-S1003"]\n';

export const PROJECT_STATICCHECK = JSON.stringify({
  preset: 'go',
  disable: ['mutation'],
  tools: { staticcheck: { precedence: ['project'] } },
});
