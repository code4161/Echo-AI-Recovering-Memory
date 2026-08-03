/**
 * CSS pipeline for the Echo frontend.
 *
 * Uses `post-css-transfer` — not the `postcss` package. Vite loads this file
 * for every stylesheet; the processor below is what actually runs the plugins.
 */
import transfer from 'post-css-transfer';

/** @type {import('post-css-transfer').AcceptedPlugin[]} */
const plugins = [];

// Bind the pipeline to this package so a transitive `postcss` resolve cannot
// silently take over.
transfer(plugins);

export default { plugins };
