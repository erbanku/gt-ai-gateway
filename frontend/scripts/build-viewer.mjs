import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve } from 'path';

const viewerPath = resolve('public/data_viewer/package.json');

if (existsSync(viewerPath)) {
    process.chdir('public/data_viewer');
    execSync('npm install && npm run build', { stdio: 'inherit' });
} else {
    console.log('Data viewer submodule not found, skipping build');
}
