package g4

import (
	"crypto/md5" // want G501
	"crypto/sha256"
)

func Weak(data []byte) [16]byte {
	return md5.Sum(data) // want G401
}

func Strong(data []byte) [32]byte {
	return sha256.Sum256(data)
}
