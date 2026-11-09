export const LOOKUP = `package shop

import (
	"fmt"
	"os"
	"strings"
)

func HasDash(name string) bool {
	return strings.Index(name, "-") != -1
}

func Forget(name string) {
	os.Remove(name)
}

func Describe(value interface{}) string {
	return fmt.Sprint(value)
}
`;

export const SKIP_S1003 = 'checks = ["all", "-S1003"]\n';

export const PROJECT_STATICCHECK = JSON.stringify({
  preset: 'go',
  tools: { staticcheck: { precedence: ['project'] } },
});

export const OWN_RULES = `package shop

import (
	"log"
	"os"
	"strconv"
)

func Quantity(text string) int {
	value, err := strconv.Atoi(text)
	if err != nil {
		panic(err)
	}
	return value
}

func Read(name string) ([]byte, error) {
	data, err := os.ReadFile(name)
	if err != nil {
		log.Printf("read %s: %v", name, err)
		return nil, err
	}
	return data, nil
}
`;
