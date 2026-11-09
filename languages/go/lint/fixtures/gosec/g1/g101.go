package g1

import "os"

func Hardcoded() string {
	password := "f62e5bcda4fae4f82370da0c6f20697b8f8447ef" // want G101
	return password
}

func FromEnvironment() string {
	return os.Getenv("SERVICE_PASSWORD")
}
