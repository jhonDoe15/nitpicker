package lifecycles

import (
	"errors"
	"sync"
)

type Dialer struct {
	once sync.Once
	conn string
	err  error
}

func (d *Dialer) Conn() (string, error) {
	d.once.Do(func() { // want once-keeps-error
		d.conn, d.err = dial()
	})
	return d.conn, d.err
}

var loadConfig = sync.OnceValues(dial) // want once-keeps-error

type Catalog struct {
	once  sync.Once
	items map[string]string
}

func (r *Catalog) Items() map[string]string {
	r.once.Do(func() {
		r.items = map[string]string{"a": "b"}
	})
	return r.items
}

type Guarded struct {
	mutex sync.Mutex
	conn  string
}

func (g *Guarded) Conn() (string, error) {
	g.mutex.Lock()
	defer g.mutex.Unlock()
	if g.conn != "" {
		return g.conn, nil
	}
	conn, err := dial()
	if err != nil {
		return "", err
	}
	g.conn = conn
	return conn, nil
}

func dial() (string, error) {
	return "", errors.New("down")
}

func Config() (string, error) {
	return loadConfig()
}
