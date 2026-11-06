// mammoth ships a browser build without its own type file.
declare module 'mammoth/mammoth.browser.js' {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>;
}
