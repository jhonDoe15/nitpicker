package simple

import "regexp"

var Escaped = regexp.MustCompile("\\d+") // want S1007

var Raw = regexp.MustCompile(`\d+`)
