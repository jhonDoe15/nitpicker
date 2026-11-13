package g4

import (
	"crypto/cipher"
	"crypto/rand"
)

func FixedNonce(aead cipher.AEAD, plain []byte) []byte {
	return aead.Seal(nil, []byte("fixed-nonce!"), plain, nil) // want G407
}

func RandomNonce(aead cipher.AEAD, plain []byte) ([]byte, error) {
	nonce := make([]byte, aead.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	return aead.Seal(nonce, nonce, plain, nil), nil
}
