package g1

import (
	"crypto/tls"
	"crypto/x509"
)

func Resumed(check func([][]*x509.Certificate) error) *tls.Config {
	return &tls.Config{
		VerifyPeerCertificate: func(_ [][]byte, chains [][]*x509.Certificate) error { return check(chains) }, // want G123
	}
}

func Verified(check func([][]*x509.Certificate) error) *tls.Config {
	return &tls.Config{
		VerifyConnection: func(state tls.ConnectionState) error { return check(state.VerifiedChains) },
	}
}
