package g4

import mathrand "math/rand/v2"

func Suppressed() uint64 {
	return mathrand.Uint64() // #nosec G404 // want G404
}
