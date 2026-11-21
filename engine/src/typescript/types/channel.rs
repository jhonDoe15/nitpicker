//! The pipe to the API server: MessagePack tuples `[kind, method, payload]` with a JSON or binary payload.
use std::io::{BufReader, BufWriter, Read, Write};
use std::path::Path;
use std::process::{Child, ChildStdin, ChildStdout, Command, Stdio};
use std::time::{Duration, Instant};

const REQUEST: u8 = 1;
const RESPONSE: u8 = 4;
const ERROR: u8 = 5;
const GOGC_NAME: &str = "GOGC";
const GOGC_DEFAULT: &str = "50";

fn collector_setting(current: Option<std::ffi::OsString>) -> Option<(&'static str, &'static str)> {
    current.is_none().then_some((GOGC_NAME, GOGC_DEFAULT))
}

pub struct Channel {
    child: Child,
    input: BufWriter<ChildStdin>,
    output: BufReader<ChildStdout>,
    pub requests: u64,
    pub sent: u64,
    pub received: u64,
    pub waited: Duration,
}

impl Channel {
    pub fn start(executable: &Path, directory: &Path) -> std::io::Result<Channel> {
        let mut command = Command::new(executable);
        if let Some((name, value)) = collector_setting(std::env::var_os(GOGC_NAME)) {
            command.env(name, value);
        }
        let mut child = command
            .arg("--api")
            .arg("--cwd")
            .arg(directory)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::inherit())
            .spawn()?;
        let input = BufWriter::with_capacity(1 << 16, child.stdin.take().expect("stdin"));
        let output = BufReader::with_capacity(1 << 16, child.stdout.take().expect("stdout"));
        Ok(Channel { child, input, output, requests: 0, sent: 0, received: 0, waited: Duration::ZERO })
    }

    pub fn process_id(&self) -> u32 {
        self.child.id()
    }

    pub fn request(&mut self, method: &str, payload: &[u8]) -> Result<Vec<u8>, String> {
        let started = Instant::now();
        let answer = self.exchange(method, payload).map_err(|error| format!("{method}: {error}"))?;
        self.requests += 1;
        self.sent += payload.len() as u64;
        self.waited += started.elapsed();
        match answer {
            (RESPONSE, body) => {
                self.received += body.len() as u64;
                Ok(body)
            }
            (ERROR, body) => Err(format!("{method}: {}", String::from_utf8_lossy(&body))),
            (kind, _) => Err(format!("{method}: unexpected message kind {kind}")),
        }
    }

    fn exchange(&mut self, method: &str, payload: &[u8]) -> std::io::Result<(u8, Vec<u8>)> {
        self.input.write_all(&[0x93, REQUEST])?;
        write_bin(&mut self.input, method.as_bytes())?;
        write_bin(&mut self.input, payload)?;
        self.input.flush()?;
        let mut head = [0u8; 2];
        self.output.read_exact(&mut head)?;
        let kind = if head[1] == 0xcc {
            let mut byte = [0u8; 1];
            self.output.read_exact(&mut byte)?;
            byte[0]
        } else {
            head[1]
        };
        read_bin(&mut self.output)?;
        Ok((kind, read_bin(&mut self.output)?))
    }
}

impl Drop for Channel {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn write_bin(out: &mut impl Write, bytes: &[u8]) -> std::io::Result<()> {
    let length = bytes.len();
    if length < 0x100 {
        out.write_all(&[0xc4, length as u8])?;
    } else if length < 0x10000 {
        out.write_all(&[0xc5, (length >> 8) as u8, length as u8])?;
    } else {
        out.write_all(&[0xc6])?;
        out.write_all(&(length as u32).to_be_bytes())?;
    }
    out.write_all(bytes)
}

fn read_bin(input: &mut impl Read) -> std::io::Result<Vec<u8>> {
    let mut marker = [0u8; 1];
    input.read_exact(&mut marker)?;
    let length = match marker[0] {
        0xc4 => {
            let mut size = [0u8; 1];
            input.read_exact(&mut size)?;
            size[0] as usize
        }
        0xc5 => {
            let mut size = [0u8; 2];
            input.read_exact(&mut size)?;
            u16::from_be_bytes(size) as usize
        }
        0xc6 => {
            let mut size = [0u8; 4];
            input.read_exact(&mut size)?;
            u32::from_be_bytes(size) as usize
        }
        other => return Err(std::io::Error::other(format!("expected binary data, got 0x{other:x}"))),
    };
    let mut bytes = vec![0u8; length];
    input.read_exact(&mut bytes)?;
    Ok(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sets_a_collector_target_unless_the_caller_chose_one() {
        assert_eq!(collector_setting(None), Some(("GOGC", "50")));
        assert_eq!(collector_setting(Some("200".into())), None);
        assert_eq!(collector_setting(Some("".into())), None);
    }
}
