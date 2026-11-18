package listings

import (
	"context"

	"github.com/aws/aws-sdk-go-v2/service/s3"
	"github.com/redis/go-redis/v9"
)

func Load(ctx context.Context, client *s3.Client, bucket string) ([]s3.Object, error) {
	output, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: &bucket}) // want unpaged-listing
	if err != nil {
		return nil, err
	}
	return output.Contents, nil
}

func Paged(ctx context.Context, client *s3.Client, bucket string) ([]s3.Object, error) {
	var all []s3.Object
	paginator := s3.NewListObjectsV2Paginator(client, &s3.ListObjectsV2Input{Bucket: &bucket})
	for paginator.HasMorePages() {
		page, err := paginator.NextPage(ctx)
		if err != nil {
			return nil, err
		}
		all = append(all, page.Contents...)
	}
	return all, nil
}

func Followed(ctx context.Context, client *s3.Client, bucket string) ([]s3.Object, error) {
	var all []s3.Object
	var token *string
	for {
		output, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: &bucket, ContinuationToken: token})
		if err != nil {
			return nil, err
		}
		all = append(all, output.Contents...)
		if output.IsTruncated == nil || !*output.IsTruncated {
			return all, nil
		}
		token = output.NextContinuationToken
	}
}

func Exists(ctx context.Context, client *s3.Client, bucket string) (bool, error) {
	one := int32(1)
	output, err := client.ListObjectsV2(ctx, &s3.ListObjectsV2Input{Bucket: &bucket, MaxKeys: &one})
	return err == nil && len(output.Contents) > 0, err
}

func Clear(ctx context.Context, client *redis.Client, index string) (redis.FTSearchResult, error) {
	return client.FTSearch(ctx, index, "*") // want unpaged-listing
}

func Limited(ctx context.Context, client *redis.Client, index string) (redis.FTSearchResult, error) {
	return client.FTSearchWithArgs(ctx, index, "*", &redis.FTSearchOptions{LimitOffset: 0, Limit: 1000})
}
