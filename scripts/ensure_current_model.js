const fs = require('fs');
const path = require('path');

function ensureCurrentModel() {
  const workspace = process.cwd();
  const targetDir = path.join(workspace, 'models');
  const targetFile = path.join(targetDir, 'current_model.joblib');
  if (fs.existsSync(targetFile)) {
    console.log('current_model.joblib already exists');
    return;
  }

  const mlModelsDir = path.join(workspace, 'ml', 'models');
  try {
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    const files = fs.existsSync(mlModelsDir) ? fs.readdirSync(mlModelsDir).filter(f => f.endsWith('.joblib')) : [];
    if (files.length === 0) {
      console.warn('No joblib files found under ml/models to copy as current_model');
      return;
    }
    const src = path.join(mlModelsDir, files[0]);
    fs.copyFileSync(src, targetFile);
    console.log('Copied', src, 'to', targetFile);
  } catch (e) {
    console.error('ensure_current_model failed', e);
  }
}

ensureCurrentModel();

// allow running as module
module.exports = { ensureCurrentModel };
