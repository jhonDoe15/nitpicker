package g1

import "net"

func ListenEverywhere() (net.Listener, error) {
	return net.Listen("tcp", "0.0.0.0:8080") // want G102
}

func ListenLocally() (net.Listener, error) {
	return net.Listen("tcp", "127.0.0.1:8080")
}
