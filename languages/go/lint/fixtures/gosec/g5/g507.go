package g5

import (
	"hash"

	"golang.org/x/crypto/ripemd160" // want G507
)

func Ripe() hash.Hash {
	return ripemd160.New() // want G406
}
