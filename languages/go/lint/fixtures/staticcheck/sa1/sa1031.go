package sa1

import "encoding/hex"

func EncodeInPlace(data []byte) {
	hex.Encode(data, data) // want SA1031
}

func EncodeCopy(data []byte) []byte {
	out := make([]byte, hex.EncodedLen(len(data)))
	hex.Encode(out, data)
	return out
}
