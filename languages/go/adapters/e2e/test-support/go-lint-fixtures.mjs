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
`;

export const SKIP_S1003 = 'checks = ["all", "-S1003"]\n';

export const PROJECT_STATICCHECK = JSON.stringify({
  preset: 'go',
  tools: { staticcheck: { precedence: ['project'] } },
});

export const TOKEN = `package shop

import "math/rand/v2"

func Token() uint64 {
	return rand.Uint64() // #nosec G404
}
`;
