import * as pty from "node-pty";

const proc = pty.spawn("/bin/bash", ["-i"], {
  name: "xterm-256color",
  cols: 80,
  rows: 24,
  cwd: process.env.HOME || "/",
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TERM: "xterm-256color" },
});

proc.onData((data) => {
  process.stdout.write(data);
});

proc.onExit(({ exitCode }) => {
  console.log("\n[exited with code", exitCode + "]");
});

setTimeout(() => {
  console.log("\n--- typing 'echo hi' ---");
  proc.write("echo hi\r");
}, 1000);

setTimeout(() => {
  proc.kill();
}, 3000);
