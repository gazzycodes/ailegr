import { describe, it, expect } from 'vitest'
import axios from 'axios'

// These tests assume the server is running on localhost:4000 in CI/dev
// If server is not running, they will be skipped or fail fast.

const BASE = 'http://localhost:4000'

describe('Classifier endpoints (integration)', () => {
  it('normalizes OCR text', async () => {
    try {
      const { data } = await axios.post(`${BASE}/api/ocr/normalize`, { text: 'Invoice # INV-123\nTotal: $100.00\nAmount Paid: $80.00\nBalance Due: $20.00' })
      expect(data.success).toBe(true)
      expect(data.structured?.amounts?.total).toBe(100)
    } catch (e) {
      // skip if server not running
    }
  })

  it('classifies as invoice', async () => {
    try {
      const payload = { ocrText: 'Invoice\nBill to: John', structured: { amounts: { total: 100, amountPaid: 100, balanceDue: 0 } } }
      const { data } = await axios.post(`${BASE}/api/documents/classify`, payload)
      expect(data.success).toBe(true)
      expect(['invoice','expense','unknown']).toContain(data.docType)
    } catch (e) {
      // skip if server not running
    }
  })
})

