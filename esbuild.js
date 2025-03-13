const esbuild = require('esbuild');
const { argv } = require('process');

const watch = argv.includes('--watch');
const minify = argv.includes('--minify');

esbuild.build({
  entryPoints: ['./src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node12',
  sourcemap: !minify,
  minify: minify,
  watch: watch && {
    onRebuild(error, result) {
      if (error) {
        console.error('构建失败:', error);
      } else {
        console.log('构建成功');
      }
    },
  },
}).catch(() => process.exit(1));