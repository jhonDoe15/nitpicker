package passes

import (
	"bufio"
	"io"
)

func Lines(input io.Reader) []string {
	var lines []string
	scanner := bufio.NewScanner(input) // want scannererr
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines
}

func CheckedLines(input io.Reader) ([]string, error) {
	var lines []string
	scanner := bufio.NewScanner(input)
	for scanner.Scan() {
		lines = append(lines, scanner.Text())
	}
	return lines, scanner.Err()
}
