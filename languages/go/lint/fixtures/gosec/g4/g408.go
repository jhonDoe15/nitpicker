package g4

import "golang.org/x/crypto/ssh"

func Remembering(config *ssh.ServerConfig, last *ssh.PublicKey) {
	config.PublicKeyCallback = func(_ ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) { // want G408
		*last = key
		return &ssh.Permissions{}, nil
	}
}

func Stateless(config *ssh.ServerConfig, allowed func(ssh.PublicKey) bool) {
	config.PublicKeyCallback = func(_ ssh.ConnMetadata, key ssh.PublicKey) (*ssh.Permissions, error) {
		if !allowed(key) {
			return nil, errUnknownKey
		}
		return &ssh.Permissions{Extensions: map[string]string{"key": string(key.Marshal())}}, nil
	}
}
