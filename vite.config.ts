/*! Glimmer | Developed by jvz | MIT License */

import { readFile } from 'node:fs/promises';
import { defineConfig } from 'vite';

const signature = '/*! Glimmer | Developed by jvz | MIT License */';

export default defineConfig({
  esbuild: {
    legalComments: 'inline',
  },
  css: {
    postcss: {
      plugins: [
        {
          postcssPlugin: 'glimmer-attribution',
          OnceExit(root) {
            const first = root.first;
            if (first?.type !== 'comment' || !first.text.includes('Glimmer | Developed by jvz | MIT License')) {
              root.prepend(signature);
            }
          },
        },
      ],
    },
  },
  build: {
    rollupOptions: {
      output: {
        banner: signature,
      },
    },
  },
  plugins: [
    {
      name: 'glimmer-notices',
      apply: 'build',
      async generateBundle() {
        for (const fileName of ['README.md', 'LICENSE']) {
          this.emitFile({
            type: 'asset',
            fileName,
            source: await readFile(new URL(`./${fileName}`, import.meta.url), 'utf8'),
          });
        }
      },
    },
  ],
});
