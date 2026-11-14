package lifecycles

import "errors"

type Waiters struct {
	replies map[string]chan string // want pending-not-closed
}

func (w *Waiters) Close() error {
	clear(w.replies)
	return nil
}

type Router struct {
	replies map[string]chan string
}

func (r *Router) Close() error {
	for id, reply := range r.replies {
		close(reply)
		delete(r.replies, id)
	}
	return nil
}

type Sender struct {
	replies map[string]chan error
}

func (s *Sender) Stop() {
	for _, reply := range s.replies {
		reply <- errors.New("stopped")
	}
}

type Registry struct {
	replies map[string]chan string
}

func (r *Registry) Close() error {
	return failAll(r.replies)
}

func failAll(replies map[string]chan string) error {
	for _, reply := range replies {
		close(reply)
	}
	return nil
}

type Plain struct {
	names map[string]string
}

func (p *Plain) Close() error {
	clear(p.names)
	return nil
}

type Bridge struct {
	replies map[string]chan string
}

func (h *Bridge) Close() error {
	h.failAll()
	return nil
}

func (h *Bridge) failAll() {
	for _, reply := range h.replies {
		close(reply)
	}
}

type Aliased struct {
	replies map[string]chan string
}

func (a *Aliased) Close() error {
	replies := a.replies
	for _, reply := range replies {
		close(reply)
	}
	return nil
}

type Subscribers struct {
	subscribers map[string]chan string
}

func (s *Subscribers) Close() error {
	clear(s.subscribers)
	return nil
}
