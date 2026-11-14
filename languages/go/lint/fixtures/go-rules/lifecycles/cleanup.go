package lifecycles

import (
	"errors"
	"io"
)

type Client struct {
	producer io.Closer
	consumer io.Closer
	started  *int
}

func (c *Client) Close() error {
	if err := c.producer.Close(); err != nil { // want cleanup-skipped
		return err
	}
	return c.consumer.Close()
}

func (c *Client) Shutdown() error {
	err := c.producer.Close() // want cleanup-skipped
	if err != nil {
		return err
	}
	c.started = nil
	return nil
}

func (c *Client) Stop() error {
	return errors.Join(c.producer.Close(), c.consumer.Close())
}

func (c *Client) Disconnect() error {
	var failure error
	if err := c.producer.Close(); err != nil {
		failure = err
	}
	if err := c.consumer.Close(); err != nil {
		failure = errors.Join(failure, err)
	}
	return failure
}

func (c *Client) Dispose() (err error) {
	defer func() { err = errors.Join(err, c.consumer.Close()) }()
	return c.producer.Close()
}

func (c *Client) Reset() error {
	if err := c.producer.Close(); err != nil {
		return err
	}
	return c.consumer.Close()
}
