package lifecycles

import (
	"fmt"
	"sync"
)

type Sessions struct {
	mutex    sync.Mutex
	sessions map[string]string // want map-only-grows
	ended    map[string]string
	limited  map[string]string
	handlers map[string]string
}

func NewSessions() *Sessions {
	return &Sessions{
		sessions: map[string]string{},
		ended:    map[string]string{},
		limited:  map[string]string{},
		handlers: map[string]string{},
	}
}

func (s *Sessions) Open(id, value string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.sessions[id] = value
	s.ended[id] = value
}

func (s *Sessions) End(id string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	delete(s.ended, id)
}

func (s *Sessions) Limit(id, value string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	if len(s.limited) < 100 {
		s.limited[id] = value
	}
}

func (s *Sessions) RegisterHandler(name, handler string) {
	s.mutex.Lock()
	defer s.mutex.Unlock()
	s.handlers[name] = handler
}

type Names struct {
	names map[string]string
}

func (p *Names) Name(id, name string) {
	p.names[id] = name
}

type Counters struct {
	mutex  sync.Mutex
	counts map[string]int // want map-only-grows
	drop   map[string]int
	shown  map[string]int // want map-only-grows
	loaded map[string]int
}

func NewCounters() *Counters {
	counters := &Counters{counts: map[string]int{}, drop: map[string]int{}, shown: map[string]int{}}
	counters.loadAll()
	return counters
}

func (c *Counters) loadAll() {
	c.loaded["start"] = 1
}

func (c *Counters) Count(id string) {
	c.mutex.Lock()
	defer c.mutex.Unlock()
	c.counts[id]++
	c.drop[id]++
	c.shown[id]++
}

func (c *Counters) Forget(id string) {
	drop := c.drop
	delete(drop, id)
}

func (c *Counters) Show() (string, int) {
	return fmt.Sprint(c.shown), len(c.counts)
}
