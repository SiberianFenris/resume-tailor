const PDF_EXT = '.pdf'
const DOCX_EXT = '.docx'

export function isAllowedResumeFile(file: File): boolean {
  const name = file.name.toLowerCase()
  if (name.endsWith(PDF_EXT)) return true
  if (name.endsWith(DOCX_EXT)) return true
  const type = file.type.toLowerCase()
  if (type === 'application/pdf') return true
  if (
    type ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    return true
  }
  return false
}

export function isPdfFile(file: File): boolean {
  return (
    file.name.toLowerCase().endsWith(PDF_EXT) ||
    file.type.toLowerCase() === 'application/pdf'
  )
}
