package g1

import (
	"context"
	"net"
)

func ListenEverywhere() (net.Listener, error) {
	return net.Listen("tcp", "0.0.0.0:8080") // want G102 noctx
}

func ListenLocally(ctx context.Context) (net.Listener, error) {
	var config net.ListenConfig
	return config.Listen(ctx, "tcp", "127.0.0.1:8080")
}
