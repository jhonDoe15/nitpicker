// Package s3 stands in for github.com/aws/aws-sdk-go-v2/service/s3 in the fixtures.
package s3

import "context"

type ListObjectsV2Input struct {
	Bucket            *string
	MaxKeys           *int32
	ContinuationToken *string
}

type Object struct{ Key *string }

type ListObjectsV2Output struct {
	Contents              []Object
	IsTruncated           *bool
	NextContinuationToken *string
}

type Client struct{}

func (*Client) ListObjectsV2(ctx context.Context, input *ListObjectsV2Input) (*ListObjectsV2Output, error) {
	truncated := input.MaxKeys == nil
	return &ListObjectsV2Output{IsTruncated: &truncated, NextContinuationToken: input.ContinuationToken}, ctx.Err()
}

type ListObjectsV2Paginator struct{ input *ListObjectsV2Input }

func NewListObjectsV2Paginator(_ *Client, input *ListObjectsV2Input) *ListObjectsV2Paginator {
	return &ListObjectsV2Paginator{input: input}
}

func (paginator *ListObjectsV2Paginator) HasMorePages() bool { return paginator.input.MaxKeys == nil }

func (paginator *ListObjectsV2Paginator) NextPage(ctx context.Context) (*ListObjectsV2Output, error) {
	return &ListObjectsV2Output{NextContinuationToken: paginator.input.ContinuationToken}, ctx.Err()
}
