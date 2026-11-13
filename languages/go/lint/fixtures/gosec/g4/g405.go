package g4

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/des" // want G502
)

func Legacy(key []byte) (cipher.Block, error) {
	return des.NewCipher(key) // want G405
}

func Modern(key []byte) (cipher.Block, error) {
	return aes.NewCipher(key)
}
