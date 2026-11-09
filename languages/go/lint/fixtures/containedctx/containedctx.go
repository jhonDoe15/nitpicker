package containedctx

import "context"

type Worker struct {
	ctx  context.Context // want containedctx
	Name string
}

func (worker Worker) Run() error {
	return worker.ctx.Err()
}

type Job struct {
	Name string
}

func (job Job) Run(ctx context.Context) error {
	return ctx.Err()
}
