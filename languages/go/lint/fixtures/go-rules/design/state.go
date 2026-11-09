package design

import (
	"errors"
	"sync"
)

var ErrMissing = errors.New("missing")

var limits = map[string]int{"orders": 10}

var cache = map[string]string{} // want mutable-package-state

var hits int // want mutable-package-state

var lock sync.Mutex // want mutable-package-state

var buffers = sync.Pool{New: func() any { return new([]byte) }}

var settings = sync.OnceValue(func() map[string]string { return map[string]string{"mode": "fast"} })

func Remember(key, value string) {
	lock.Lock()
	defer lock.Unlock()
	cache[key] = value
	hits++
}

func Limit(name string) (int, error) {
	limit, found := limits[name]
	if !found {
		return 0, ErrMissing
	}
	return limit, nil
}

func Hits() int {
	lock.Lock()
	defer lock.Unlock()
	return hits
}

func Mode() string {
	return settings()["mode"]
}

func Borrow() any { // want any-in-exported-signature
	return buffers.Get()
}

type Store struct {
	mutex   sync.Mutex
	entries map[string]string
}

func (store *Store) Remember(key, value string) {
	store.mutex.Lock()
	defer store.mutex.Unlock()
	store.entries[key] = value
}
