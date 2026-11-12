package concurrency

import (
	"context"
	"sync"

	"golang.org/x/sync/errgroup"
)

type Cache struct {
	mutex   sync.Mutex
	entries map[string]string
}

func (cache *Cache) Refresh() {
	cache.mutex.Lock()
	defer cache.mutex.Unlock()
	cache.entries = map[string]string{}
}

func (cache *Cache) Start() {
	go cache.Refresh() // want unowned-goroutine
}

func Fire(work func()) {
	go func() { // want unowned-goroutine
		work()
	}()
}

func Each(items []string, work func(string)) {
	var group sync.WaitGroup
	for _, item := range items {
		group.Go(func() { work(item) })
	}
	group.Wait()
}

func Collect(items []string, work func(string) string) []string {
	results := make(chan string, len(items))
	for _, item := range items {
		go func() { results <- work(item) }()
	}
	collected := make([]string, 0, len(items))
	for range items {
		collected = append(collected, <-results)
	}
	return collected
}

func Watch(ctx context.Context, events <-chan string, handle func(string)) {
	go watch(ctx, events, handle)
}

func watch(ctx context.Context, events <-chan string, handle func(string)) {
	for {
		select {
		case <-ctx.Done():
			return
		case event := <-events:
			handle(event)
		}
	}
}

type Worker struct {
	stop chan struct{}
	jobs []func()
}

func (worker *Worker) loop() {
	for _, job := range worker.jobs {
		select {
		case <-worker.stop:
			return
		default:
			job()
		}
	}
}

func (worker *Worker) Run() {
	go worker.loop()
}

func Fetch(ctx context.Context, urls []string, get func(context.Context, string) error) error {
	group, ctx := errgroup.WithContext(ctx)
	for _, url := range urls {
		group.Go(func() error { return get(ctx, url) })
	}
	return group.Wait()
}
