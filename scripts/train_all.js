const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function extractSymbolsFromTs(filePath) {
  const txt = fs.readFileSync(filePath, 'utf8');
  const re = /\{\s*symbol:\s*"([A-Z0-9\.\/-]+)"/g;
  const syms = [];
  let m;
  while ((m = re.exec(txt)) !== null) syms.push(m[1]);
  return syms;
}

async function trainSymbol(symbol) {
  return new Promise((resolve) => {
    console.log('Training', symbol);
    const python = process.env.PYTHON_CMD || path.join(process.cwd(), '.venv', 'Scripts', 'python.exe');
    const args = ['ml/train.py', '--symbol', symbol + '.NS'];
    const p = spawn(python, args, { cwd: process.cwd(), stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => process.stdout.write(`[${symbol}] ${d.toString()}`));
    p.stderr.on('data', (d) => process.stderr.write(`[${symbol}-err] ${d.toString()}`));
    p.on('close', (code) => {
      if (code === 0) console.log('Completed', symbol);
      else console.warn('Train failed', symbol, 'code', code);
      resolve();
    });
  });
}

async function main() {
  const niftyTs = path.join(process.cwd(), 'data', 'nifty50.ts');
  if (!fs.existsSync(niftyTs)) {
    console.error('nifty50.ts not found at', niftyTs);
    process.exit(1);
  }
  const symbols = extractSymbolsFromTs(niftyTs).map(s => s.replace(/\.NS$/,'')).slice(0, 50);
  console.log('Found symbols:', symbols.join(', '));
  for (const s of symbols) {
    try {
      await trainSymbol(s);
    } catch (e) {
      console.error('Error training', s, e && e.message ? e.message : e);
    }
  }
  console.log('All done');
}

main();
