package sa1

import "regexp"

var Broken = regexp.MustCompile(`ab\yef`) // want SA1000

var Valid = regexp.MustCompile(`ab\wef`)
