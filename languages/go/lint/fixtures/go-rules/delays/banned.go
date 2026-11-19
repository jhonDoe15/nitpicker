package delays

import (
	"context"
	"net/http"
	"sync"
	"time"
)

const retryDelay = 2 * time.Second

const pollMillis = 3000

type Client struct {
	url string
}

func Poll(ready func() bool) {
	for !ready() {
		time.Sleep(retryDelay) // want uninjectable-delay
	}
}

func (c *Client) Wait() string {
	<-time.After(retryDelay) // want uninjectable-delay
	return c.url
}

func Pause() {
	time.Sleep(pollMillis * time.Millisecond) // want uninjectable-delay
}

type Node struct {
	next *Node
}

type Cache struct {
	mu   sync.Mutex
	next *Node
}

func (c *Cache) Refresh(node *Node) *Node {
	time.Sleep(retryDelay) // want uninjectable-delay
	c.mu.Lock()
	defer c.mu.Unlock()
	c.next = node
	return node.next
}

func Handle(request *http.Request) string {
	time.Sleep(retryDelay) // want uninjectable-delay
	return request.Method
}

func WithContext(ctx context.Context) error {
	time.Sleep(retryDelay) // want uninjectable-delay
	return ctx.Err()
}
