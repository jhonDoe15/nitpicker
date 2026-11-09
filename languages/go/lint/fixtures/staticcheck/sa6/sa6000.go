package sa6

import "regexp"

func MatchEach(lines []string) int {
	count := 0
	for _, line := range lines {
		matched, err := regexp.MatchString(`^\d+$`, line) // want SA6000
		if err == nil && matched {
			count++
		}
	}
	return count
}

var digits = regexp.MustCompile(`^\d+$`)

func MatchCompiled(lines []string) int {
	count := 0
	for _, line := range lines {
		if digits.MatchString(line) {
			count++
		}
	}
	return count
}
