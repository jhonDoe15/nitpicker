package g1

import "golang.org/x/crypto/ssh"

func Trusting(user string) *ssh.ClientConfig {
	return &ssh.ClientConfig{User: user, HostKeyCallback: ssh.InsecureIgnoreHostKey()} // want G106
}

func Pinned(user string, host ssh.PublicKey) *ssh.ClientConfig {
	return &ssh.ClientConfig{User: user, HostKeyCallback: ssh.FixedHostKey(host)}
}
