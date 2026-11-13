package g4

import (
	"crypto/rand"
	mathrand "math/rand/v2"
)

func Guessable() uint64 {
	return mathrand.Uint64() // want G404
}

func Token() string {
	return rand.Text()
}
