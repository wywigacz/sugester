import * as esbuild from 'esbuild';

// Bundle JS as IIFE with global SugesterWidget
await esbuild.build({
  entryPoints: ['src/sugester.js'],
  bundle: true,
  outfile: 'dist/sugester.min.js',
  format: 'iife',
  globalName: 'Sugester',
  minify: true,
  target: 'es2020',
  sourcemap: true,
});

// Copy CSS (simple build)
await esbuild.build({
  entryPoints: ['src/sugester.css'],
  outfile: 'dist/sugester.min.css',
  minify: true,
  sourcemap: true,
});

console.log('Frontend built successfully → dist/');
