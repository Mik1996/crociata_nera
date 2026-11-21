/**
 * Pages of a PDF as pictures, drawn in the browser by pdf.js (loaded only at the first use, like
 * pdfmake): the PDFs of the tables become JPEG files to send in a chat, with the very same look.
 */

/** Where the pdf.js worker is served (copied from `node_modules/pdfjs-dist/build` by `angular.json`). */
const WORKER_URL = 'assets/pdfjs/pdf.worker.min.mjs';
/** Pixels per PDF point: an A4 page (595 pt) becomes about 1,300 px wide, sharp on a phone. */
const SCALE = 2.2;
/** JPEG quality: the brushed iron would make a PNG several megabytes per page. */
const QUALITY = 0.9;

/** The pages of `pdf` as JPEG files, `<baseName>-1.jpg`, `<baseName>-2.jpg`… (no number for one page). */
export async function pdfPagesAsImages(pdf: Blob, baseName: string): Promise<File[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = WORKER_URL;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await pdf.arrayBuffer()),
  });
  const document = await task.promise;
  try {
    const files: File[] = [];
    for (let n = 1; n <= document.numPages; n++) {
      const page = await document.getPage(n);
      const viewport = page.getViewport({ scale: SCALE });
      const canvas = globalThis.document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await page.render({ canvas, viewport }).promise;
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob failed'))),
          'image/jpeg',
          QUALITY,
        ),
      );
      const name = document.numPages > 1 ? `${baseName}-${n}.jpg` : `${baseName}.jpg`;
      files.push(new File([blob], name, { type: 'image/jpeg' }));
      page.cleanup();
    }
    return files;
  } finally {
    await task.destroy();
  }
}
