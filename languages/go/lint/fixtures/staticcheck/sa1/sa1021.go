package sa1

import (
	"bytes"
	"net"
)

func SameBytes(left, right net.IP) bool {
	return bytes.Equal(left, right) // want SA1021
}

func SameAddress(left, right net.IP) bool {
	return left.Equal(right)
}
