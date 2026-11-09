package simple

import (
	"errors"
	"fmt"
)

func WrappedError(name string) error {
	return errors.New(fmt.Sprintf("missing %s", name)) // want S1028
}

func FormattedError(name string) error {
	return fmt.Errorf("missing %s", name)
}
