package g3

import "os"

func Predictable(data []byte) error {
	return os.WriteFile("/tmp/report.txt", data, 0o600) // want G303
}

func Unique(data []byte) (err error) {
	file, err := os.CreateTemp("", "report-*.txt")
	if err != nil {
		return err
	}
	defer func() { err = closeWith(err, file) }()
	_, err = file.Write(data)
	return err
}
