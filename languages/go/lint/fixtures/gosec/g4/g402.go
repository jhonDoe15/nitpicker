package g4

import "crypto/tls"

func Unverified() *tls.Config {
	return &tls.Config{InsecureSkipVerify: true} // want G402
}

func Verified() *tls.Config {
	return &tls.Config{MinVersion: tls.VersionTLS12}
}
