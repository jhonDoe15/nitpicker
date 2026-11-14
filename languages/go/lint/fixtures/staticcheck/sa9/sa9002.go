package sa9

import "os"

func Decimal(name string) error {
	return os.Chmod(name, 644) // want SA9002 G302
}

func Octal(name string) error {
	return os.Chmod(name, 0o600)
}
