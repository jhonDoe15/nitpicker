export function messageLines(onLine: (line: string) => void): (chunk: string) => void {
  let pending = '';
  return (chunk) => {
    const lines = `${pending}${chunk}`.split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      if (line.trim() !== '') {
        onLine(line);
      }
    }
  };
}
