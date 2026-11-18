// Package redis stands in for github.com/redis/go-redis/v9 in the fixtures.
package redis

import "context"

type FTSearchOptions struct {
	LimitOffset int
	Limit       int
}

func DefaultSearchOptions() *FTSearchOptions {
	return &FTSearchOptions{LimitOffset: 0, Limit: 10}
}

type FTSearchResult struct{ Total int }

type Client struct{}

func (*Client) FTSearch(ctx context.Context, index, query string) (FTSearchResult, error) {
	return FTSearchResult{Total: len(index) + len(query)}, ctx.Err()
}

func (*Client) FTSearchWithArgs(
	ctx context.Context, index, query string, options *FTSearchOptions,
) (FTSearchResult, error) {
	return FTSearchResult{Total: len(index) + len(query) + options.Limit + options.LimitOffset}, ctx.Err()
}
