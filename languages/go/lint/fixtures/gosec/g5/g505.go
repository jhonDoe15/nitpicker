package g5

import "crypto/sha1" // want G505

func Digest(data []byte) [20]byte {
	return sha1.Sum(data) // want G401
}
