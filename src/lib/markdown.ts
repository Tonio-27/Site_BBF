// Renders Markdown stored in JSON fields (e.g. event descriptions) with the
// same processor and safety rules as Markdown files.
import { unified, type MarkdownRenderer } from '@astrojs/markdown-remark';
import { remarkSafeContent } from './remark-safe-content.mjs';

let rendu: Promise<MarkdownRenderer> | undefined;

export async function renderMarkdown(source: string): Promise<string> {
  rendu ??= unified({ remarkPlugins: [remarkSafeContent] }).createRenderer({ syntaxHighlight: false });
  return (await (await rendu).render(source)).code;
}
