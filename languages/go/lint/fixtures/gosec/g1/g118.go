package g1

import (
	"context"
	"net/http"
	"time"
)

func Leaked(ctx context.Context) context.Context {
	child, _ := context.WithTimeout(ctx, time.Second)
	return child
}

func Detached(request *http.Request, work func(context.Context)) {
	ctx := request.Context()
	go work(context.Background()) // want G118
	work(ctx)
}

func Attached(request *http.Request, work func(context.Context)) {
	go work(request.Context())
}
