package g4

import (
	"crypto/rand"
	"crypto/rsa"
)

func Short() (*rsa.PrivateKey, error) {
	return rsa.GenerateKey(rand.Reader, 1024) // want G403
}

func Long() (*rsa.PrivateKey, error) {
	return rsa.GenerateKey(rand.Reader, 3072)
}
