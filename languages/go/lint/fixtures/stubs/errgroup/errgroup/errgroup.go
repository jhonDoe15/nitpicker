// Package errgroup stands in for golang.org/x/sync/errgroup in the fixtures.
package errgroup

import "context"

type Group struct{}

func (group *Group) Go(run func() error) {
	_ = run
}

func (group *Group) Wait() error {
	return nil
}

func WithContext(ctx context.Context) (*Group, context.Context) {
	return &Group{}, ctx
}
