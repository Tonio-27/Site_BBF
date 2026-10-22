// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';
import { unified } from '@astrojs/markdown-remark';
import { remarkSafeContent } from './src/lib/remark-safe-content.mjs';

export default defineConfig({
  site: 'https://brassbandfribourg.ch',
  output: 'static',
  trailingSlash: 'always',
  build: {
    format: 'directory',
    // Keep everything in external files so the strict CSP (style-src 'self') holds.
    inlineStylesheets: 'never',
  },
  integrations: [
    sitemap({
      filter: (page) => !page.includes('/admin/'),
    }),
  ],
  markdown: {
    processor: unified({ remarkPlugins: [remarkSafeContent] }),
    syntaxHighlight: false,
  },
  devToolbar: { enabled: false },
});
