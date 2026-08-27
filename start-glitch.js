const { spawn } = require("child_process");

const api = spawn("node", ["api/dist/index.js"], {
  stdio: "inherit",
  env: process.env,
});

const worker = spawn("node", ["worker/dist/index.js"], {
  stdio: "inherit",
  env: process.env,
});

api.on("exit", (code) => {
  console.log(`API exited with code ${code}`);
  process.exit(code ?? 0);
});

worker.on("exit", (code) => {
  console.log(`Worker exited with code ${code}`);
});