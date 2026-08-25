import { parseCsv } from '../../domain/controls/index.ts'

/*
 * Reading an uploaded spreadsheet (FR-CR-06, SEC-03).
 *
 * The I/O edge for bulk upload: it turns a File into rows and hands them to
 * the pure planner in the domain. Everything the change request asks for at
 * this boundary happens here —
 *
 *   - the type is decided by CONTENT, not by the file name: an .xlsx is a ZIP
 *     and must start with `PK`, so a renamed executable never parses;
 *   - a size limit is enforced before anything is read;
 *   - macro-bearing workbooks (.xlsm, .xlsb) are refused outright;
 *   - nothing in the file is ever executed — cells are read as text and, on
 *     the way back out, neutralised against formula injection (SEC-04).
 */

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024

export type ReadFailure = { kind: 'unsupported' } | { kind: 'tooLarge' } | { kind: 'unreadable' }

export type ReadResult = { ok: true; rows: string[][] } | { ok: false; failure: ReadFailure }

function isZip(bytes: Uint8Array): boolean {
  return bytes[0] === 0x50 && bytes[1] === 0x4b
}

/**
 * Inflates one stored part.
 *
 * Delegated to the platform's `DecompressionStream`, so no third-party parser
 * joins the dependency tree — the change request asks explicitly for the new
 * attack surface to stay small (SEC-11). Where the API is unavailable the
 * caller falls back to asking for a CSV.
 */
async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

interface ZipEntry {
  name: string
  data: Uint8Array
}

/** Walks the local file headers — enough for the two parts a workbook needs. */
async function readZipEntries(
  bytes: Uint8Array,
  wanted: (name: string) => boolean,
): Promise<ZipEntry[]> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  const decoder = new TextDecoder()
  const entries: ZipEntry[] = []
  let offset = 0

  while (offset + 30 <= bytes.length && view.getUint32(offset, true) === 0x04034b50) {
    const method = view.getUint16(offset + 8, true)
    const compressedSize = view.getUint32(offset + 18, true)
    const nameLength = view.getUint16(offset + 26, true)
    const extraLength = view.getUint16(offset + 28, true)
    const nameStart = offset + 30
    const dataStart = nameStart + nameLength + extraLength
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLength))

    // A streamed entry declares its size only in a trailing descriptor; those
    // are rare in .xlsx and not worth carrying a full ZIP reader for.
    if (compressedSize === 0 && method !== 0) break

    if (wanted(name)) {
      const raw = bytes.subarray(dataStart, dataStart + compressedSize)
      entries.push({ name, data: method === 0 ? raw : await inflateRaw(raw) })
    }

    offset = dataStart + compressedSize
  }

  return entries
}

function xmlText(value: string): string {
  return value
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
}

function columnIndex(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? 'A'
  let index = 0
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64)
  return index - 1
}

async function parseXlsx(bytes: Uint8Array): Promise<string[][]> {
  const entries = await readZipEntries(
    bytes,
    (name) => name === 'xl/sharedStrings.xml' || name === 'xl/worksheets/sheet1.xml',
  )
  const decoder = new TextDecoder()

  const sharedPart = entries.find((entry) => entry.name === 'xl/sharedStrings.xml')
  const shared = sharedPart
    ? [...decoder.decode(sharedPart.data).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((match) =>
        xmlText(match[1]),
      )
    : []

  const sheetPart = entries.find((entry) => entry.name === 'xl/worksheets/sheet1.xml')
  if (!sheetPart) return []

  const sheet = decoder.decode(sheetPart.data)
  const rows: string[][] = []

  for (const rowMatch of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = []
    for (const cellMatch of rowMatch[1].matchAll(/<c([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attributes = cellMatch[1]
      const body = cellMatch[2]
      const reference = /r="([A-Z]+\d+)"/.exec(attributes)?.[1] ?? ''
      const type = /t="([^"]+)"/.exec(attributes)?.[1] ?? ''
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? ''

      let value: string
      if (type === 's') value = shared[Number.parseInt(raw, 10)] ?? ''
      else if (type === 'inlineStr') value = xmlText(body)
      else value = xmlText(raw)

      const index = reference ? columnIndex(reference) : cells.length
      while (cells.length < index) cells.push('')
      cells[index] = value
    }
    rows.push(cells)
  }

  return rows.filter((row) => row.some((cell) => cell.trim().length > 0))
}

/** Reads a user-selected file into rows, or explains why it cannot. */
export async function readTabularFile(file: File): Promise<ReadResult> {
  const name = file.name.toLowerCase()

  if (name.endsWith('.xlsm') || name.endsWith('.xlsb')) {
    return { ok: false, failure: { kind: 'unsupported' } }
  }
  if (!name.endsWith('.csv') && !name.endsWith('.xlsx')) {
    return { ok: false, failure: { kind: 'unsupported' } }
  }
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, failure: { kind: 'tooLarge' } }

  const bytes = new Uint8Array(await file.arrayBuffer())

  if (isZip(bytes)) {
    if (typeof DecompressionStream !== 'function') {
      return { ok: false, failure: { kind: 'unreadable' } }
    }
    try {
      const rows = await parseXlsx(bytes)
      return rows.length > 0 ? { ok: true, rows } : { ok: false, failure: { kind: 'unreadable' } }
    } catch {
      return { ok: false, failure: { kind: 'unreadable' } }
    }
  }

  // Not a ZIP: it must be the CSV it claims to be, whatever the extension says.
  if (name.endsWith('.xlsx')) return { ok: false, failure: { kind: 'unsupported' } }

  const text = new TextDecoder().decode(bytes)
  // A binary masquerading as .csv carries NUL bytes; text never does.
  if (text.includes('\u0000')) return { ok: false, failure: { kind: 'unsupported' } }

  return { ok: true, rows: parseCsv(text) }
}
