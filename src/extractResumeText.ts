import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'
import pdfWorkerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url'

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerSrc

export async function extractTextFromDocx(
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  const { value } = await mammoth.extractRawText({ arrayBuffer })
  return value
}

export async function extractTextFromPdf(
  arrayBuffer: ArrayBuffer,
): Promise<string> {
  const data = new Uint8Array(arrayBuffer)
  const loadingTask = pdfjsLib.getDocument({ data })
  const pdf = await loadingTask.promise
  const parts: string[] = []
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum)
    const content = await page.getTextContent()
    for (const item of content.items) {
      if (typeof item === 'object' && item !== null && 'str' in item) {
        const s = (item as { str?: string }).str
        if (s) parts.push(s)
      }
    }
    parts.push('\n')
  }
  return parts.join(' ')
}
