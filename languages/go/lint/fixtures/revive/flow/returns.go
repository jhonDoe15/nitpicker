package flow

import "errors"

var ErrEmpty = errors.New("empty")

func Nested(text string) (string, error) {
	if text != "" { // want early-return
		text += "!"
	} else {
		return "", ErrEmpty
	}
	return text, nil
}

func Outdented(text string) (string, error) {
	if text == "" {
		return "", ErrEmpty
	}
	return text, nil
}

func ElseAfterReturn(text string) string {
	if text == "" {
		return "empty"
	} else { // want indent-error-flow
		text += "!"
	}
	return text
}

func ElseAfterContinue(values []string) []string {
	var kept []string
	for _, value := range values {
		if value == "" {
			continue
		} else { // want superfluous-else
			kept = append(kept, value)
		}
	}
	return kept
}

func Kept(values []string) []string {
	var kept []string
	for _, value := range values {
		if value == "" {
			continue
		}
		kept = append(kept, value)
	}
	return kept
}

func check(text string) error {
	if text == "" {
		return ErrEmpty
	}
	return nil
}

func Redundant(text string) error {
	// want-below if-return
	if err := check(text); err != nil {
		return err
	}
	return nil
}

func Direct(text string) error {
	return check(text)
}

func Boolean(count int) bool {
	var positive bool
	// want-below unnecessary-if
	if count > 0 {
		positive = true
	} else {
		positive = false
	}
	return positive
}

func Compared(count int) bool {
	positive := count > 0
	return positive
}

func Bare(text string) (size int, err error) {
	size = len(text)
	return // want bare-return
}

func Explicit(text string) (int, error) {
	return len(text), nil
}

func Silenced(text string) (size int, err error) {
	size = len(text)
	//revive:disable-next-line:bare-return
	return // want bare-return
}
