package calls

import "fixtures/revive/calls/clock"

func Stamp() int64 {
	stamp := clock.Now().Unix() // want epoch-naming
	return stamp
}

func StampSec() int64 {
	stampSec := clock.Now().Unix()
	return stampSec
}
