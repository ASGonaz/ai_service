// starter.js
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function startProcess(name, script) {
  const proc = spawn('node', [path.join(__dirname, script)], { stdio: 'inherit' });
  proc.on('close', code => {
    console.log(`[${name}] exited with code ${code}`);
  });
  return proc;
}

const server = startProcess('SERVER', 'server.js');
const worker = startProcess('WORKER', 'worker.js');

process.on('SIGTERM', () => {
  server.kill('SIGTERM');
  worker.kill('SIGTERM');
});
process.on('SIGINT', () => {
  server.kill('SIGINT');
  worker.kill('SIGINT');
  process.exit(0);
});
console.log('All processes started successfully!');