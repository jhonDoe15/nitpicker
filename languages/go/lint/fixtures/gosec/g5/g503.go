package g5

import "crypto/rc4" // want G503

func Stream(key []byte) (*rc4.Cipher, error) {
	return rc4.NewCipher(key) // want G405
}
