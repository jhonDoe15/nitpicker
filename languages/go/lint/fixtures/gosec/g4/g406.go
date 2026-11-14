package g4

import (
	"crypto/sha256"
	"hash"

	"golang.org/x/crypto/md4" // want G506
)

func Deprecated() hash.Hash {
	return md4.New() // want G406
}

func Current() hash.Hash {
	return sha256.New()
}
