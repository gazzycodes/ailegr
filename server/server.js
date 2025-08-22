import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { PrismaClient } from '@prisma/client'
import ReportingService from './reportingService.js'
import multer from 'multer'
import fs from 'fs'
import path from 'path'
import axios from 'axios'
import { PostingService } from './src/services/posting.service.js'
import crypto from 'crypto'
import { ExpenseAccountResolver } from './src/services/expense-account-resolver.service.js'
import { AICategoryService } from './src/services/ai-category.service.js'
import { aiLimiter } from './src/services/ai-rate-limiter.js'

// Load env (development/local)
try {
  const dotenv = await import('dotenv')
  dotenv?.config?.()
} catch {}

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })
const prisma = new PrismaClient()
const PORT = process.env.PORT || 4000
const CLASSIFY_MODE = String(process.env.CLASSIFY_MODE || 'hybrid').toLowerCase() // heuristic|hybrid|ai
const CLASSIFY_AI_THRESHOLD = Math.min(1, Math.max(0, parseFloat(process.env.CLASSIFY_AI_THRESHOLD || '0.8')))
const CLASSIFY_CACHE_TTL_MS = 10 * 60 * 1000

// Lightweight in-memory cache for classification
const classifyCache = new Map()
const getCached = (key) => {
  try {
    const entry = classifyCache.get(key)
    if (!entry) return null
    if (Date.now() - entry.ts > CLASSIFY_CACHE_TTL_MS) { classifyCache.delete(key); return null }
    return entry.value
  } catch { return null }
}
const setCached = (key, value) => {
  try { classifyCache.set(key, { value, ts: Date.now() }) } catch {}
}

// Middlewares
app.use(cors())
app.use(express.json({ limit: '5mb' }))

// File upload (for OCR)
const uploadDir = path.resolve(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
const upload = multer({ dest: uploadDir, limits: { fileSize: 10 * 1024 * 1024 } })
// Serve uploaded files for previews
app.use('/uploads', express.static(uploadDir))

// WebSocket AI Chat (real-time)
wss.on('connection', (ws) => {
  console.log('New WebSocket connection established')
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString())
      if (data.type === 'chat') {
        const aiResponse = await processAIChat(data.message, data.context)
        ws.send(JSON.stringify({ type: 'chat_response', message: aiResponse.content, action: aiResponse.action }))
      }
    } catch (error) {
      console.error('WebSocket error:', error)
      ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' }))
    }
  })
  ws.on('close', () => { console.log('WebSocket connection closed') })
})

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT })
})

app.get('/api/health', async (req, res) => {
  try {
    const healthStatus = await ReportingService.healthCheck()
    res.json(healthStatus)
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message })
  }
})

// Company Profile endpoints (additive, non-breaking)
app.get('/api/company-profile', async (req, res) => {
  try {
    if (!(prisma && (prisma).companyProfile)) {
      // Prisma client not regenerated for new model yet
      return res.json({ legalName: '', aliases: [], email: '', addressLines: [], city: '', state: '', zipCode: '', country: 'US' })
    }
    const profile = await prisma.companyProfile.findFirst({ where: { workspaceId: 'default' } })
    if (!profile) {
      return res.json({
        legalName: '',
        aliases: [],
        email: '',
        addressLines: [],
        city: '', state: '', zipCode: '', country: 'US'
      })
    }
    // Mask nothing sensitive; we only store non-PII in this project
    res.json({
      legalName: profile.legalName,
      aliases: Array.isArray(profile.aliases) ? profile.aliases : [],
      email: profile.email || '',
      addressLines: Array.isArray(profile.addressLines) ? profile.addressLines : [],
      city: profile.city || '', state: profile.state || '', zipCode: profile.zipCode || '', country: profile.country || 'US'
    })
  } catch (e) {
    console.warn('company-profile get error (returning stub):', e?.message || e)
    // Graceful fallback (e.g., during migration before table exists)
    res.json({
      legalName: '',
      aliases: [],
      email: '',
      addressLines: [],
      city: '', state: '', zipCode: '', country: 'US'
    })
  }
})

app.put('/api/company-profile', async (req, res) => {
  try {
    if (!(prisma && (prisma).companyProfile)) {
      return res.status(503).json({ code: 'MIGRATION_REQUIRED', message: 'Prisma client is missing CompanyProfile. Run: npx prisma generate && npx prisma db push' })
    }
    const body = req.body || {}
    const legalName = String(body.legalName || '').trim()
    if (!legalName) return res.status(400).json({ error: 'legalName is required' })
    const aliases = Array.isArray(body.aliases) ? body.aliases.map((s) => String(s).trim()).filter(Boolean).slice(0, 20) : []
    const email = body.email ? String(body.email).trim() : null
    const addressLines = Array.isArray(body.addressLines) ? body.addressLines.map((s) => String(s)) : []
    const city = body.city ? String(body.city).trim() : null
    const state = body.state ? String(body.state).trim() : null
    const zipCode = body.zipCode ? String(body.zipCode).trim() : null
    const country = body.country ? String(body.country).trim() : 'US'

    // Normalization helpers
    const normalize = (s) => String(s || '').toLowerCase().replace(/\b(inc|llc|ltd|corp|co)\.?$/i, '').trim()
    const normalizedLegalName = normalize(legalName)
    const normalizedAliases = aliases.map((a) => normalize(a))

    const saved = await prisma.companyProfile.upsert({
      where: { workspaceId: 'default' },
      update: { legalName, aliases, email, addressLines, city, state, zipCode, country, normalizedLegalName, normalizedAliases },
      create: { workspaceId: 'default', legalName, aliases, email, addressLines, city, state, zipCode, country, normalizedLegalName, normalizedAliases }
    })
    res.json({ ok: true, legalName: saved.legalName })
  } catch (e) {
    const msg = (e && (e.code || e.name)) || (e && e.message) || String(e)
    // Graceful message when table doesn't exist yet
    if (/no such table/i.test(String(e)) || String(e?.code).startsWith('P2021')) {
      return res.status(503).json({ code: 'MIGRATION_REQUIRED', message: 'CompanyProfile table not found. Run: npx prisma generate && npx prisma db push' })
    }
    console.error('company-profile put error:', msg)
    res.status(500).json({ error: 'Failed to save company profile' })
  }
})

// Helper: AI chat processor used by WebSocket route
async function processAIChat(message, context = {}) {
  try {
    const dashboardData = await ReportingService.getDashboard()
    const financialData = dashboardData.metrics
    if (!financialData) {
      return { content: 'I need some financial data first. Try adding a few transactions then ask me again!', action: null }
    }

    const systemPrompt = `You are an AI accounting assistant for EZE Ledger. Be concise, friendly, and precise.\n\nCURRENT FINANCIAL DATA:\n- Total Revenue: $${financialData.totalRevenue.toLocaleString()}\n- Total Expenses: $${financialData.totalExpenses.toLocaleString()}\n- Net Profit: $${financialData.netProfit.toLocaleString()}\n- Total Assets: $${financialData.totalAssets.toLocaleString()}\n- Total Liabilities: $${financialData.totalLiabilities.toLocaleString()}\n- Total Equity: $${financialData.totalEquity.toLocaleString()}\n- Transaction Count: ${financialData.transactionCount}\n\nIf the user asks to create a transaction, include an ACTION at the end on a single line in this exact format:\nACTION: actionName(parameters)\n\nAvailable actions:\n- createExpense(vendor, amount, category, date, description)\n- createInvoice(customer, amount, description, dueDate)\n- getFinancialSummary()`

    const fullText = `${systemPrompt}\n\nContext: ${JSON.stringify(context)}\nUser message: ${message}`
    if (!process.env.GEMINI_API_KEY) {
      return { content: `Summary: Revenue $${financialData.totalRevenue.toLocaleString()}, Expenses $${financialData.totalExpenses.toLocaleString()}, Net Profit $${financialData.netProfit.toLocaleString()}.`, action: null }
    }
    const quota = aiLimiter.checkAndConsume(1)
    if (!quota.allowed) {
      return { content: `AI usage limit reached. Try again in ${quota.retryAfterSeconds}s.`, action: null }
    }
    const base = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    const url = `${base}?key=${process.env.GEMINI_API_KEY}`
    const { data } = await axios.post(url, { contents: [{ parts: [{ text: fullText }] }] }, { headers: { 'Content-Type': 'application/json' } })
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated'
    const actionMatch = content.match(/ACTION: (\w+)\((.*)\)/)
    let action = null
    let cleanContent = content
    if (actionMatch) {
      action = { type: actionMatch[1], parameters: actionMatch[2] }
      cleanContent = content.replace(/\n?ACTION: (\w+)\((.*)\)/, '').trim()
    }
    return { content: cleanContent, action }
  } catch (error) {
    console.error('AI chat processing error:', error)
    return { content: 'Sorry, I had trouble answering that. Try again in a bit.', action: null }
  }
}
// AI usage status
app.get('/api/ai/usage', (req, res) => {
  try {
    const status = aiLimiter.status()
    aiLimiter.attachHeaders(res)
    res.json({ success: true, status })
  } catch (e) {
    res.status(500).json({ success: false, error: 'Failed to read AI usage' })
  }
})

// Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const dashboardData = await ReportingService.getDashboard()
    res.json({
      metrics: dashboardData.metrics,
      sparklineData: dashboardData.sparklineData,
      aiInsights: [
        { id: 'rev-trend', category: 'Revenue', message: `Revenue $${dashboardData.metrics.totalRevenue.toLocaleString()} — steady upward trend. Consider upselling top clients.`, urgency: 'medium', icon: 'TrendingUp' },
        { id: 'expense-watch', category: 'Expense', message: `Expenses $${dashboardData.metrics.totalExpenses.toLocaleString()} — software subscriptions up 8% MoM. Review unused seats.`, urgency: 'low', icon: 'AlertTriangle' },
        { id: 'profit-health', category: 'Profit', message: `Net profit $${dashboardData.metrics.netProfit.toLocaleString()} — healthy margin this period.`, urgency: 'low', icon: 'Check' }
      ],
      healthChecks: dashboardData.healthChecks
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard data', details: error.message })
  }
})

// Reports
app.get('/api/reports/pnl', async (req, res) => {
  try {
    const asOfStr = (req.query.asOf || '').toString()
    const periodType = (req.query.period || '').toString().toLowerCase() // monthly|quarterly|ytd|annual
    const compare = String(req.query.compare || '').toLowerCase() === 'true' || String(req.query.compare || '').toLowerCase() === 'prev'
    const asOf = asOfStr ? new Date(asOfStr) : new Date()
    const asOfDate = !isNaN(asOf.getTime()) ? asOf : new Date()

    function startOfPeriod(d) {
      const dt = new Date(d)
      if (periodType === 'quarterly') {
        const q = Math.floor(dt.getMonth() / 3) // 0-based quarter
        return new Date(dt.getFullYear(), q * 3, 1)
      }
      if (periodType === 'ytd' || periodType === 'annual') {
        return new Date(dt.getFullYear(), 0, 1)
      }
      // monthly default
      return new Date(dt.getFullYear(), dt.getMonth(), 1)
    }

    function endOfPrevPeriod(currentStart) {
      return new Date(currentStart.getFullYear(), currentStart.getMonth(), currentStart.getDate() - 1)
    }

    function startOfPrevPeriod(prevEnd) {
      // Use same period length as current
      const currentStart = startOfPeriod(asOfDate)
      const lenDays = Math.ceil((asOfDate - currentStart) / (1000 * 60 * 60 * 24)) + 1
      const prevStart = new Date(prevEnd)
      prevStart.setDate(prevStart.getDate() - (lenDays - 1))
      // For quarterly/YTD/annual use calendar-aligned starts
      if (periodType === 'quarterly') {
        const q = Math.floor(prevEnd.getMonth() / 3)
        return new Date(prevEnd.getFullYear(), q * 3, 1)
      }
      if (periodType === 'ytd' || periodType === 'annual') {
        return new Date(prevEnd.getFullYear(), 0, 1)
      }
      return prevStart
    }

    const startDate = startOfPeriod(asOfDate)
    const current = await ReportingService.getProfitAndLoss(asOfDate, startDate)

    if (!compare) {
      return res.json(current)
    }

    const prevEnd = endOfPrevPeriod(startDate)
    const prevStart = startOfPrevPeriod(prevEnd)
    const previous = await ReportingService.getProfitAndLoss(prevEnd, prevStart)

    res.json({ ...current, previous })
  } catch (error) {
    console.error('P&L error:', error)
    res.status(500).json({ error: 'Failed to fetch P&L data', details: error.message })
  }
})

app.get('/api/reports/balance-sheet', async (req, res) => {
  try {
    const asOfStr = (req.query.asOf || '').toString()
    const asOf = asOfStr ? new Date(asOfStr) : null
    const asOfDate = asOf && !isNaN(asOf.getTime()) ? asOf : null
    const data = await ReportingService.getBalanceSheet(asOfDate)
    res.json(data)
  } catch (error) {
    console.error('Balance Sheet error:', error)
    res.status(500).json({ error: 'Failed to fetch balance sheet data', details: error.message })
  }
})

app.get('/api/reports/trial-balance', async (req, res) => {
  try {
    const asOfStr = (req.query.asOf || '').toString()
    const asOf = asOfStr ? new Date(asOfStr) : null
    const asOfDate = asOf && !isNaN(asOf.getTime()) ? asOf : null
    const data = await ReportingService.getTrialBalance(asOfDate)
    res.json(data)
  } catch (error) {
    console.error('Trial Balance error:', error)
    res.status(500).json({ error: 'Failed to fetch trial balance data', details: error.message })
  }
})

app.get('/api/reports/chart-of-accounts', async (req, res) => {
  try {
    const data = await ReportingService.getChartOfAccounts()
    res.json(data)
  } catch (error) {
    console.error('Chart of Accounts error:', error)
    res.status(500).json({ error: 'Failed to fetch chart of accounts', details: error.message })
  }
})

// COA: update account (name/type)
app.put('/api/accounts/:code', async (req, res) => {
  try {
    const code = req.params.code
    const { name, type } = req.body || {}
    if (!name && !type) return res.status(400).json({ error: 'nothing to update' })
    const account = await prisma.account.findFirst({ where: { code } })
    if (!account) return res.status(404).json({ error: 'Account not found' })
    const data = {}
    if (typeof name === 'string' && name.trim()) data.name = name.trim()
    if (typeof type === 'string' && ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].includes(type)) data.type = type
    const updated = await prisma.account.update({ where: { id: account.id }, data })
    res.json({ success: true, account: updated })
  } catch (e) {
    console.error('update account error:', e)
    res.status(500).json({ error: 'Failed to update account' })
  }
})

// COA: delete account with safety checks
app.delete('/api/accounts/:code', async (req, res) => {
  try {
    const code = req.params.code
    const account = await prisma.account.findFirst({ where: { code } })
    if (!account) return res.status(404).json({ error: 'Account not found' })

    // Prevent deletion of core accounts used by setup helpers
    const coreCodes = new Set(['1010','1200','1350','1400','3000','3200','4020','4010','4910','2050','2150','2010','5010','6020','6030','6040','6060','6080','6110'])
    if (coreCodes.has(code)) return res.status(422).json({ error: 'Cannot delete core system account' })

    const usageCount = await prisma.transactionEntry.count({
      where: { OR: [{ debitAccountId: account.id }, { creditAccountId: account.id }] }
    })
    if (usageCount > 0) return res.status(409).json({ error: 'Account has transactions and cannot be deleted' })

    await prisma.account.delete({ where: { id: account.id } })
    res.json({ success: true })
  } catch (e) {
    console.error('delete account error:', e)
    res.status(500).json({ error: 'Failed to delete account' })
  }
})

// Account transactions (ledger) for a specific account
app.get('/api/accounts/:accountCode/transactions', async (req, res) => {
  try {
    const { accountCode } = req.params
    const limit = parseInt(req.query.limit) || 50

    const account = await prisma.account.findFirst({
      where: { code: accountCode },
      select: { id: true, code: true, name: true, type: true, normalBalance: true }
    })

    if (!account) {
      return res.status(404).json({ error: `Account ${accountCode} not found` })
    }

    const entries = await prisma.transactionEntry.findMany({
      where: { OR: [{ debitAccountId: account.id }, { creditAccountId: account.id }] },
      include: {
        transaction: { select: { id: true, date: true, description: true, reference: true, amount: true } },
        debitAccount: { select: { code: true, name: true } },
        creditAccount: { select: { code: true, name: true } }
      },
      orderBy: { transaction: { date: 'desc' } },
      take: limit
    })

    // Compute running balance
    let runningBalance = 0
    const allEntries = await prisma.transactionEntry.findMany({
      where: { OR: [{ debitAccountId: account.id }, { creditAccountId: account.id }] },
      include: { transaction: { select: { date: true } } },
      orderBy: { transaction: { date: 'asc' } }
    })
    for (const entry of allEntries) {
      if (entry.debitAccountId === account.id) runningBalance += parseFloat(entry.amount)
      else runningBalance -= parseFloat(entry.amount)
    }
    let displayBalance = runningBalance
    if (account.normalBalance === 'CREDIT') displayBalance = -runningBalance

    let tempBalance = displayBalance
    const transactions = []
    for (const entry of entries) {
      const isDebit = entry.debitAccountId === account.id
      const amount = parseFloat(entry.amount)
      transactions.push({
        id: entry.transaction.id,
        date: entry.transaction.date.toISOString(),
        description: entry.description || entry.transaction.description,
        amount,
        type: isDebit ? 'debit' : 'credit',
        balance: tempBalance,
        reference: entry.transaction.reference,
        debitAmount: isDebit ? amount : 0,
        creditAmount: isDebit ? 0 : amount
      })
      if (account.normalBalance === 'DEBIT') {
        tempBalance -= isDebit ? amount : -amount
      } else {
        tempBalance -= isDebit ? -amount : amount
      }
    }

    const totalDebits = transactions.reduce((s, t) => s + t.debitAmount, 0)
    const totalCredits = transactions.reduce((s, t) => s + t.creditAmount, 0)
    const netChange = account.normalBalance === 'DEBIT' ? totalDebits - totalCredits : totalCredits - totalDebits

    res.json({
      account: {
        code: account.code,
        name: account.name,
        type: account.type,
        normalBalance: account.normalBalance,
        currentBalance: displayBalance
      },
      transactions,
      summary: {
        totalTransactions: transactions.length,
        totalDebits,
        totalCredits,
        netChange,
        currentBalance: displayBalance
      }
    })
  } catch (error) {
    console.error('Account transactions error:', error)
    res.status(500).json({ error: 'Failed to fetch account transactions', details: error.message })
  }
})

// OCR endpoint (PDF only here; images optional later)
app.post('/api/ocr', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })

    const { mimetype, path: filePath, originalname } = req.file
    const lowerName = (originalname || '').toLowerCase()
    let extractedText = ''

    const isPdf = mimetype === 'application/pdf' || lowerName.endsWith('.pdf')
    const isPng = mimetype === 'image/png' || lowerName.endsWith('.png')
    const isJpg = mimetype === 'image/jpeg' || lowerName.endsWith('.jpg') || lowerName.endsWith('.jpeg')
    const isCsv = mimetype === 'text/csv' || lowerName.endsWith('.csv')
    const isTxt = mimetype === 'text/plain' || lowerName.endsWith('.txt')
    const isDocx = mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || lowerName.endsWith('.docx')
    const isDoc = mimetype === 'application/msword' || lowerName.endsWith('.doc')

    if (isPdf) {
      const mod = await import('pdf-parse/lib/pdf-parse.js')
      const pdfParse = (mod && (mod.default || mod))
      const data = await pdfParse(fs.readFileSync(filePath))
      extractedText = data.text || ''
    } else if (isPng || isJpg) {
      const TesseractMod = await import('tesseract.js')
      const Tesseract = (TesseractMod && (TesseractMod.default || TesseractMod))
      const result = await Tesseract.recognize(filePath, 'eng')
      extractedText = (result && result.data && result.data.text) ? result.data.text : ''
    } else if (isDocx) {
      const mammoth = await import('mammoth')
      const out = await mammoth.extractRawText({ path: filePath })
      extractedText = (out && out.value) ? out.value : ''
    } else if (isCsv || isTxt) {
      extractedText = fs.readFileSync(filePath, 'utf8')
    } else if (isDoc) {
      // Legacy .doc not supported reliably without native deps; advise conversion
      return res.status(415).json({ error: 'Unsupported file type .doc. Please upload PDF, DOCX, PNG, JPG, or CSV.' })
    } else {
      // Fallback: attempt to read as UTF-8 text
      try {
        extractedText = fs.readFileSync(filePath, 'utf8')
      } catch {
        return res.status(415).json({ error: `Unsupported file type: ${mimetype}` })
      }
    }

    res.json({
      message: 'File processed',
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      text: extractedText
    })
  } catch (e) {
    console.error('OCR error:', e)
    res.status(500).json({ error: 'OCR failed', details: String(e) })
  }
})

// Normalize OCR text into structured amounts/labels (best-effort)
app.post('/api/ocr/normalize', async (req, res) => {
  try {
    const { text = '' } = req.body || {}
    const raw = String(text || '')
    if (!raw || raw.trim().length < 5) {
      return res.json({ structured: { amounts: {}, labels: {} } })
    }

    const normalized = raw.replace(/\u00A0/g, ' ')
    const number = '([0-9]+(?:[, .\']*[0-9]{3})*(?:[.,][0-9]{1,2})?)'
    const parseNum = (s) => {
      if (!s) return undefined
      let n = s
      if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '')
      else if (n.includes(' ')) n = n.replace(/\s/g, '').replace(',', '.')
      else if (n.includes(',') && !n.includes('.')) {
        const parts = n.split(',')
        n = parts[parts.length - 1].length <= 2 ? n.replace(',', '.') : n.replace(/,/g, '')
      }
      const v = parseFloat(n)
      return Number.isFinite(v) ? parseFloat(v.toFixed(2)) : undefined
    }

    const grab = (label) => {
      // Ensure we don't match inside words (e.g., avoid capturing from "Subtotal" when looking for "Total")
      const mm = normalized.match(new RegExp(`\\b(?:${label})\\b[\\s:]*\\$?\\s*([-0-9,\.]+)`, 'i'))
      return parseNum(mm?.[1] || null)
    }

    const amounts = {
      subtotal: grab('subtotal'),
      taxAmount: grab('tax|vat'),
      total: grab('total'),
      amountPaid: grab('amount\\s*paid'),
      balanceDue: grab('balance\\s*due')
    }
    // If Total wasn't found but we have Subtotal and Tax, compute Total = Subtotal + Tax
    if (amounts.total == null && typeof amounts.subtotal === 'number' && typeof amounts.taxAmount === 'number') {
      amounts.total = parseFloat((amounts.subtotal + amounts.taxAmount).toFixed(2))
    }

    const dateFrom = (s) => {
      if (!s || typeof s !== 'string') return ''
      const iso = s.match(/\d{4}-\d{2}-\d{2}/)
      if (iso) return iso[0]
      const mdy = s.match(/(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})/)
      if (mdy) { let m = +mdy[1], d = +mdy[2], y = +mdy[3]; if (y < 100) y = 2000 + y; return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}` }
      const cleaned = s.replace(/(\d+)(st|nd|rd|th)/i, '$1')
      const dt = new Date(cleaned)
      if (!isNaN(dt.getTime())) { const y = dt.getFullYear(); const m = String(dt.getMonth()+1).padStart(2,'0'); const d = String(dt.getDate()).padStart(2,'0'); return `${y}-${m}-${d}` }
      return ''
    }

    const labelGrab = (label) => {
      const mm = normalized.match(new RegExp(`${label}[^\n]*`, 'i'))
      return mm ? mm[0] : ''
    }
    // Heuristic block extraction for Vendor / Bill To
    let vendorName = null
    let billToName = null
    try {
      const lines = normalized.split('\n').map(l => (l || '').trim()).filter(Boolean)
      // Case 1: single line contains both labels
      const bothIdx = lines.findIndex(l => /vendor\s*bill\s*to/i.test(l))
      if (bothIdx >= 0) {
        if (lines[bothIdx + 1]) vendorName = lines[bothIdx + 1].replace(/\s{2,}.*/, '')
        if (lines[bothIdx + 2]) billToName = lines[bothIdx + 2].replace(/\s{2,}.*/, '')
      } else {
        // Case 2: separate blocks
        const idxVendor = lines.findIndex(l => /(^|\b)vendor(\b|\s*:)/i.test(l) && !/vendor\s*bill/i.test(l))
        if (idxVendor >= 0) {
          for (let i = idxVendor + 1; i < Math.min(lines.length, idxVendor + 5); i++) {
            const cand = lines[i].replace(/\s{2,}.*/, '')
            if (!cand || /^#/.test(cand) || /\bbill\s*to\b/i.test(cand)) continue
            vendorName = cand
            break
          }
        }
        const idxBill = lines.findIndex(l => /\bbill\s*to\b/i.test(l))
        if (idxBill >= 0) {
          for (let i = idxBill + 1; i < Math.min(lines.length, idxBill + 5); i++) {
            const cand = lines[i].replace(/\s{2,}.*/, '')
            if (!cand || /^#/.test(cand) || /(^|\b)vendor(\b|\s*:)/i.test(cand)) continue
            billToName = cand
            break
          }
        }
      }
    } catch {}

    const labels = {
      invoiceNumber: (normalized.match(/Invoice\s*(?:No\.?|#)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9\-\.\/]*)/i)?.[1]) || null,
      invoiceDate: dateFrom(labelGrab('invoice\s*date')),
      dueDate: dateFrom(labelGrab('due\s*date')),
      revenueRecognitionDate: dateFrom(labelGrab('revenue\s*recognition\s*date')),
      vendorName: vendorName,
      billToName: billToName
    }

    return res.json({ structured: { amounts, labels } })
  } catch (e) {
    console.error('normalize error:', e)
    res.status(500).json({ error: 'Normalization failed' })
  }
})

// Document classifier (expense vs invoice), lightweight heuristic + optional AI
app.post('/api/documents/classify', async (req, res) => {
  try {
    const { ocrText = '', structured = null, text: aliasText, mode } = req.body || {}
    const rawText = String(ocrText || aliasText || '')
    const text = rawText.toLowerCase()
    const requestedMode = String(mode || '').toLowerCase()
    const EFFECTIVE_MODE = requestedMode || CLASSIFY_MODE

    // 1) Heuristic pass
    const reasons = []
    let docType = 'expense'
    let ourRole = 'buyer'
    let policy = 'EXPENSE_MATCHING'
    let confidence = 0.6

    // Load company profile (cached minimal identity) for deterministic perspective detection
    let ourNames = []
    let companyHint = ''
    try {
      const profile = await prisma.companyProfile.findFirst({ where: { workspaceId: 'default' } })
      if (profile && profile.legalName) {
        const norm = (s) => String(s || '').toLowerCase().replace(/\b(inc|llc|ltd|corp|co)\.?$/i, '').trim()
        const aliasesArr = (Array.isArray(profile.normalizedAliases) ? profile.normalizedAliases : Array.isArray(profile.aliases) ? profile.aliases.map(norm) : [])
        ourNames = [norm(profile.legalName), ...aliasesArr].filter(Boolean)
        const emailLower = profile.email ? String(profile.email).toLowerCase().trim() : ''
        const domain = (emailLower && emailLower.includes('@')) ? emailLower.split('@')[1] : ''
        if (emailLower) ourNames.push(emailLower)
        if (domain) ourNames.push(domain)
        const dispAliases = Array.isArray(profile.aliases) ? profile.aliases.filter(Boolean).join(', ') : ''
        companyHint = `\nMY COMPANY: ${profile.legalName}${dispAliases ? `\nALIASES: ${dispAliases}` : ''}${emailLower ? `\nEMAIL: ${emailLower}` : ''}${domain ? `\nDOMAIN: ${domain}` : ''}`
      }
    } catch {}

    // Strong expense clues first (kept for AI hinting only)
    if (/vendor\s*bill\b/.test(text)) {
      docType = 'expense'
      ourRole = 'buyer'
      policy = 'EXPENSE_MATCHING'
      confidence = Math.max(confidence, 0.9)
      reasons.push('Detected "Vendor Bill" keyword → Expense')
    }
    // If "Bill To" matches our company or aliases, prefer Expense
    if (ourNames.length && /bill\s*to/i.test(text)) {
      const billToLine = (text.split('\n').find(l => /bill\s*to/i.test(l)) || '') + ' ' + (text.split('\n')[ (text.split('\n').findIndex(l => /bill\s*to/i.test(l)) + 1) ] || '')
      const matched = ourNames.some(n => billToLine.includes(n))
      if (matched) {
        docType = 'expense'
        ourRole = 'buyer'
        policy = 'EXPENSE_MATCHING'
        confidence = Math.max(confidence, 0.95)
        reasons.push('Bill To matches our company profile → Expense')
      }
    }

    // Conservative invoice signals (exclude generic billing terms)
    if (/\binvoice\b|net\s*\d+/.test(text)) {
      docType = 'invoice'
      ourRole = 'seller'
      policy = 'REVENUE_RECOGNITION'
      confidence = 0.75
      reasons.push('Found invoice-related keywords')
    }
    // No forced override here; AI will decide final type with company context
    if (/receipt\b|thank\s*you\s*for\s*your\s*purchase/.test(text)) {
      docType = 'expense'
      ourRole = 'buyer'
      policy = 'EXPENSE_MATCHING'
      confidence = Math.max(confidence, 0.7)
      reasons.push('Found receipt/purchase keywords')
    }
    try {
      const am = structured?.amounts || {}
      if (typeof am.total === 'number' && (typeof am.amountPaid === 'number' || typeof am.balanceDue === 'number')) {
        reasons.push('Found normalized amounts (total/paid/balance)')
        // Do not flip type based on amounts alone; just raise confidence
        confidence = Math.max(confidence, 0.7)
      }
    } catch {}

    const heuristic = { docType, ourRole, policy, confidence, reasons, source: 'heuristic' }
    const deterministicLock = false

    // Early return if mode forces heuristic or confidence high
    if (EFFECTIVE_MODE === 'heuristic') return res.json(heuristic)
    if (EFFECTIVE_MODE !== 'ai_first' && heuristic.confidence >= CLASSIFY_AI_THRESHOLD) return res.json(heuristic)

    // 2) Cache check
    const hash = crypto.createHash('sha256').update(rawText).digest('hex')
    const cacheKey = `classify:${EFFECTIVE_MODE}:${hash}`
    const cached = getCached(cacheKey)
    if (EFFECTIVE_MODE !== 'ai' && EFFECTIVE_MODE !== 'ai_first' && cached) {
      return res.json(cached)
    }

    // 3) AI fallback (strict schema)
    if (!process.env.GEMINI_API_KEY) {
      return res.json(heuristic)
    }

    try {
      const prompt = `You are classifying an accounting document based on OCR text. Return ONLY JSON.
Schema: {"docType":"invoice|expense|other","confidence":0..1,"reasons":["...","..."],"detectedVendor":"string|null","detectedCustomer":"string|null"}
Rules:
- docType: invoice if seller billing customer; expense if purchase/receipt/bill; other if statement/quote.
- Use the company hint to determine perspective (who is seller vs buyer).
- confidence reflects certainty from cues (headers, terms, amounts, labels).
Hints:${companyHint}
TEXT:\n${rawText.slice(0, 12000)}`

      // Direct call to Gemini (mirror /api/ai/generate)
      const base = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
      const url = `${base}?key=${process.env.GEMINI_API_KEY}`
      const { data } = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] }, { headers: { 'Content-Type': 'application/json' }, timeout: 60000 })
      let content = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
      content = content.trim()
      if (content.startsWith('```')) content = content.replace(/^```[a-zA-Z]*\s*/, '').replace(/\s*```$/, '')
      const aiJson = JSON.parse(content)
      let finalDocType = (aiJson.docType || heuristic.docType)
      let locked = false

      try {
        const hasVendorBill = /vendor\s*bill\b/i.test(rawText)
        const billToLower = String((structured && (structured.labels?.billToName || structured.billToName)) || '').toLowerCase()
        const fromLower = String((structured && (structured.labels?.vendorName || structured.vendorName)) || '').toLowerCase()
        const billToIsUs = billToLower && ourNames.some((n) => billToLower.includes(n))
        const fromIsUs = fromLower && ourNames.some((n) => fromLower.includes(n))
        if (hasVendorBill || billToIsUs) {
          finalDocType = 'expense'
          locked = true
        } else if (fromIsUs && /\binvoice\b/i.test(rawText)) {
          finalDocType = 'invoice'
          locked = true
        }
      } catch {}

      const merged = {
        docType: finalDocType,
        ourRole: (finalDocType === 'invoice' ? 'seller' : (finalDocType === 'expense' ? 'buyer' : heuristic.ourRole)),
        policy: (finalDocType === 'invoice' ? 'REVENUE_RECOGNITION' : (finalDocType === 'expense' ? 'EXPENSE_MATCHING' : heuristic.policy)),
        confidence: typeof aiJson.confidence === 'number' ? Math.max(heuristic.confidence, aiJson.confidence, locked ? 0.98 : 0) : (locked ? 0.98 : heuristic.confidence),
        reasons: Array.isArray(aiJson.reasons) ? [...heuristic.reasons, ...aiJson.reasons, ...(locked ? ['Identity lock applied'] : [])] : (locked ? [...heuristic.reasons, 'Identity lock applied'] : heuristic.reasons),
        detectedVendor: aiJson.detectedVendor || null,
        detectedCustomer: aiJson.detectedCustomer || null,
        locked,
        mode: EFFECTIVE_MODE,
        source: 'ai'
      }
      setCached(cacheKey, merged)
      return res.json(merged)
    } catch (e) {
      console.warn('AI classify fallback failed, using heuristic:', e?.message || e)
      return res.json(heuristic)
    }
  } catch (e) {
    console.error('classify error:', e)
    res.status(500).json({ error: 'Classification failed' })
  }
})
// AI Category endpoints (admin/workflow)
app.post('/api/categories/ai/suggest', async (req, res) => {
  try {
    const { description = '', vendorName = '' } = req.body || {}
    const result = await AICategoryService.findOrSuggestCategory(description, vendorName)
    aiLimiter.attachHeaders(res)
    res.json({ success: true, result })
  } catch (e) {
    console.error('AI category suggest error:', e)
    res.status(500).json({ success: false, error: 'Failed to suggest category' })
  }
})

app.get('/api/categories/pending', async (req, res) => {
  try {
    const list = await AICategoryService.getPendingApprovals()
    res.json({ success: true, pending: list })
  } catch (e) {
    console.error('AI category pending error:', e)
    res.status(500).json({ success: false, error: 'Failed to fetch pending approvals' })
  }
})

app.post('/api/categories/pending/:id/approve', async (req, res) => {
  try {
    const id = req.params.id
    const updated = await AICategoryService.approveCategory(id, req.body || {})
    res.json({ success: true, category: updated })
  } catch (e) {
    console.error('AI category approve error:', e)
    res.status(500).json({ success: false, error: 'Failed to approve category' })
  }
})

app.post('/api/categories/pending/:id/reject', async (req, res) => {
  try {
    const id = req.params.id
    const { existingCategoryId } = req.body || {}
    if (!existingCategoryId) return res.status(400).json({ success: false, error: 'existingCategoryId required' })
    await AICategoryService.rejectCategory(id, existingCategoryId)
    res.json({ success: true })
  } catch (e) {
    console.error('AI category reject error:', e)
    res.status(500).json({ success: false, error: 'Failed to reject category' })
  }
})

// Categories CRUD (admin)
app.get('/api/categories', async (req, res) => {
  try {
    const q = (req.query.query || '').toString().trim()
    const where = q
      ? {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { key: { contains: q, mode: 'insensitive' } },
          { accountCode: { contains: q, mode: 'insensitive' } }
        ]
      }
    : {}
    const categories = await prisma.category.findMany({ where, orderBy: { name: 'asc' } })
    res.json({ success: true, categories })
  } catch (e) {
    console.error('categories list error:', e)
    res.status(500).json({ success: false, error: 'Failed to fetch categories' })
  }
})

app.post('/api/categories', async (req, res) => {
  try {
    const { name, key, accountCode, description } = req.body || {}
    if (!name || !key || !accountCode) return res.status(400).json({ success: false, error: 'name, key, accountCode required' })
    const acc = await prisma.account.findFirst({ where: { code: accountCode } })
    if (!acc) return res.status(422).json({ success: false, error: `Account ${accountCode} not found` })
    const exists = await prisma.category.findFirst({ where: { OR: [{ name: name.trim() }, { key: key.trim().toUpperCase() }] } })
    if (exists) return res.status(409).json({ success: false, error: 'Category with same name or key exists' })
    const created = await prisma.category.create({
      data: {
        name: name.trim(),
        key: key.trim().toUpperCase(),
        accountCode: accountCode.trim(),
        description: description?.trim() || null,
        aiGenerated: false,
        isApproved: true
      }
    })
    res.status(201).json({ success: true, category: created })
  } catch (e) {
    console.error('categories create error:', e)
    res.status(500).json({ success: false, error: 'Failed to create category' })
  }
})

app.put('/api/categories/:id', async (req, res) => {
  try {
    const id = req.params.id
    const { name, key, accountCode, description, isApproved } = req.body || {}
    const existing = await prisma.category.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ success: false, error: 'Category not found' })
    if (accountCode) {
      const acc = await prisma.account.findFirst({ where: { code: accountCode } })
      if (!acc) return res.status(422).json({ success: false, error: `Account ${accountCode} not found` })
    }
    if (key && key.trim().toUpperCase() !== existing.key) {
      const dup = await prisma.category.findFirst({ where: { key: key.trim().toUpperCase(), id: { not: id } } })
      if (dup) return res.status(409).json({ success: false, error: 'Category key already exists' })
    }
    const updated = await prisma.category.update({
      where: { id },
      data: {
        name: typeof name === 'string' ? name.trim() : undefined,
        key: typeof key === 'string' ? key.trim().toUpperCase() : undefined,
        accountCode: typeof accountCode === 'string' ? accountCode.trim() : undefined,
        description: typeof description === 'string' ? (description.trim() || null) : undefined,
        isApproved: typeof isApproved === 'boolean' ? isApproved : undefined
      }
    })
    res.json({ success: true, category: updated })
  } catch (e) {
    console.error('categories update error:', e)
    res.status(500).json({ success: false, error: 'Failed to update category' })
  }
})

app.delete('/api/categories/:id', async (req, res) => {
  try {
    const id = req.params.id
    const cat = await prisma.category.findUnique({ where: { id }, include: { expenses: { select: { id: true }, take: 1 } } })
    if (!cat) return res.status(404).json({ success: false, error: 'Category not found' })
    if (cat.expenses && cat.expenses.length > 0) return res.status(409).json({ success: false, error: 'Category in use by expenses' })
    await prisma.category.delete({ where: { id } })
    res.json({ success: true })
  } catch (e) {
    console.error('categories delete error:', e)
    res.status(500).json({ success: false, error: 'Failed to delete category' })
  }
})

// Create new account (COA)
app.post('/api/accounts', async (req, res) => {
  try {
    const { code, name, type, normalBalance, parentCode } = req.body || {}
    if (!code || !name || !type || !normalBalance) return res.status(400).json({ error: 'code, name, type, normalBalance required' })
    const exists = await prisma.account.findFirst({ where: { code } })
    if (exists) return res.status(409).json({ error: 'Account code already exists' })
    let parentId = null
    if (parentCode) {
      const parent = await prisma.account.findFirst({ where: { code: parentCode } })
      if (!parent) return res.status(422).json({ error: `Parent account ${parentCode} not found` })
      parentId = parent.id
    }
    const created = await prisma.account.create({
      data: { code: code.trim(), name: name.trim(), type, normalBalance, parentId }
    })
    res.status(201).json({ success: true, account: created })
  } catch (e) {
    console.error('create account error:', e)
    res.status(500).json({ error: 'Failed to create account' })
  }
})

// Attach receipt to expense (upload)
app.post('/api/expenses/:id/receipt', upload.single('file'), async (req, res) => {
  try {
    const id = req.params.id
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' })
    const expense = await prisma.expense.findUnique({ where: { id } })
    if (!expense) return res.status(404).json({ error: 'Expense not found' })
    const updated = await prisma.expense.update({ where: { id }, data: { receiptUrl: `/uploads/${req.file.filename}` } })
    res.json({ success: true, expense: updated })
  } catch (e) {
    console.error('attach receipt error:', e)
    res.status(500).json({ error: 'Failed to attach receipt' })
  }
})
// Time-series metrics (monthly revenue/expenses/profit)
app.get('/api/metrics/time-series', async (req, res) => {
  try {
    const months = Math.max(1, Math.min(36, parseInt(req.query.months) || 12))
    const metricsParam = (req.query.metrics || 'revenue,expenses,profit').toString().toLowerCase()
    const wantRevenue = metricsParam.includes('revenue')
    const wantExpenses = metricsParam.includes('expenses')
    const wantProfit = metricsParam.includes('profit')

    const now = new Date()
    const start = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)

    // Fetch entries within window with account types
    const entries = await prisma.transactionEntry.findMany({
      where: { transaction: { date: { gte: start } } },
      include: {
        transaction: { select: { date: true } },
        debitAccount: { select: { type: true } },
        creditAccount: { select: { type: true } }
      }
    })

    const labels = []
    const revenue = new Array(months).fill(0)
    const expenses = new Array(months).fill(0)

    for (let i = 0; i < months; i++) {
      const d = new Date(start.getFullYear(), start.getMonth() + i, 1)
      labels.push(d.toLocaleDateString('en-US', { month: 'short', year: '2-digit' }))
    }

    for (const e of entries) {
      const d = new Date(e.transaction.date)
      const idx = (d.getFullYear() - start.getFullYear()) * 12 + (d.getMonth() - start.getMonth())
      if (idx < 0 || idx >= months) continue
      const amt = parseFloat(e.amount)
      if (e.creditAccount?.type === 'REVENUE') revenue[idx] += amt
      if (e.debitAccount?.type === 'REVENUE') revenue[idx] -= amt
      if (e.debitAccount?.type === 'EXPENSE') expenses[idx] += amt
      if (e.creditAccount?.type === 'EXPENSE') expenses[idx] -= amt
    }

    const result = { labels: labels }
    if (wantRevenue) result.revenue = revenue.map(v => Math.max(0, Math.round(v)))
    if (wantExpenses) result.expenses = expenses.map(v => Math.max(0, Math.round(v)))
    if (wantProfit) result.profit = revenue.map((v, i) => Math.max(0, Math.round(v - (expenses[i] || 0))))

    res.json(result)
  } catch (e) {
    console.error('time-series error:', e)
    res.status(500).json({ error: 'Failed to compute time series' })
  }
})
// Posting preview (enhanced via resolver + invoice logic)
app.post('/api/posting/preview', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ code: 'MALFORMED_JSON', message: 'Request body must be valid JSON' })
    }

    // Decide document type using baseline-like detection
    const text = (req.body.ocrText || req.body.description || req.body.notes || '').toLowerCase()
    // Tighten: 'bill to' often appears on vendor bills we receive; do not use it as invoice signal
    const looksLikeInvoice = text.includes(' invoice') || text.startsWith('invoice') || text.includes('\binvoice\b') || text.includes('payment terms') || !!req.body.customerName

    if (looksLikeInvoice) {
      // Dry-run via PostingService logic for invoices (no DB writes)
      const totalInvoice = parseFloat(req.body.amount || 0)
      const amountPaid = parseFloat(req.body.amountPaid ?? 0)
      const balanceDue = totalInvoice - amountPaid
      const overpaidAmount = amountPaid > totalInvoice ? amountPaid - totalInvoice : 0
      const accounts = await PostingService.resolveInvoiceAccounts({ categoryKey: req.body.categoryKey }, overpaidAmount)
      const epsilon = 0.01
      let computedPaymentStatus = req.body.paymentStatus || 'invoice'
      if (amountPaid > totalInvoice + epsilon) computedPaymentStatus = 'overpaid'
      else if (Math.abs(balanceDue) <= epsilon) computedPaymentStatus = 'paid'
      else if (amountPaid > epsilon && balanceDue > epsilon) computedPaymentStatus = 'partial'
      else computedPaymentStatus = 'invoice'
      let isOverdue = false
      try {
        if (req.body.dueDate) {
          const due = new Date(req.body.dueDate)
          const today = new Date()
          if (!isNaN(due.getTime()) && (balanceDue > epsilon) && (due.getTime() < new Date(today.toDateString()).getTime())) isOverdue = true
        }
      } catch {}
      let isPrepaid = false
      try {
        if (req.body.recognitionDate && req.body.date) {
          const rec = new Date(req.body.recognitionDate)
          const inv = new Date(req.body.date)
          if (!isNaN(rec.getTime()) && !isNaN(inv.getTime()) && rec.getTime() > inv.getTime() && amountPaid > epsilon) isPrepaid = true
        } else if (String(req.body.ocrText || '').toLowerCase().includes('deferred')) {
          if (amountPaid > epsilon) isPrepaid = true
        }
      } catch {}

      const entries = []
      // CREDIT revenue for the full invoice amount
      entries.push({ type: 'credit', accountCode: accounts.revenue.code, accountName: accounts.revenue.name, amount: totalInvoice, description: `Revenue from ${req.body.customerName || 'Customer'}` })
      // DEBIT cash for payments received (if any)
      if (amountPaid > 0) {
        entries.push({ type: 'debit', accountCode: accounts.cash.code, accountName: accounts.cash.name, amount: amountPaid, description: `Cash received from ${req.body.customerName || 'Customer'}` })
      }
      // DEBIT A/R for outstanding balance (if any)
      const arAmt = Math.max(0, totalInvoice - amountPaid)
      if (arAmt > 0) {
        const arCode = (accounts.arAccount?.code || accounts.cash.code)
        const arName = (accounts.arAccount?.name || accounts.cash.name)
        entries.push({ type: 'debit', accountCode: arCode, accountName: arName, amount: arAmt, description: `Accounts Receivable - ${req.body.customerName || 'Customer'}` })
      }
      // Overpayment → customer credits
      if (overpaidAmount > 0 && accounts.customerCredits) {
        entries.push({ type: 'credit', accountCode: accounts.customerCredits.code, accountName: accounts.customerCredits.name, amount: overpaidAmount, description: 'Customer credit - overpaid' })
      }

      return res.json({
        documentType: 'invoice',
        dateUsed: req.body.date || new Date().toISOString().slice(0, 10),
        policy: 'REVENUE_RECOGNITION',
        totalInvoice,
        amountPaid,
        overpaidAmount,
        computed: { paymentStatus: computedPaymentStatus, isOverdue, isPrepaid, balanceDue },
        dryRun: true,
        entries
      })
    }

    // Expense preview via resolver
    const resolution = await ExpenseAccountResolver.resolveExpenseAccounts({
      vendorName: req.body.vendorName || '',
      amount: parseFloat(req.body.amount || 0).toFixed(2),
      date: req.body.date || new Date().toISOString().slice(0, 10),
      categoryKey: req.body.categoryKey || req.body.category || null,
      paymentStatus: req.body.paymentStatus || 'unpaid',
      description: req.body.notes || req.body.description || ''
    })

    const amount = parseFloat(req.body.amount || 0)
    const amountPaid = parseFloat(req.body.amountPaid || req.body.amount || 0)
    const overpaid = Math.max(0, amountPaid - amount)
    const epsilon = 0.01
    const balanceDue = amount - amountPaid
    let computedPaymentStatus = req.body.paymentStatus || 'unpaid'
    if (amountPaid > amount + epsilon) computedPaymentStatus = 'overpaid'
    else if (Math.abs(balanceDue) <= epsilon) computedPaymentStatus = 'paid'
    else if (amountPaid > epsilon && balanceDue > epsilon) computedPaymentStatus = 'partial'
    else computedPaymentStatus = 'unpaid'
    let isOverdue = false
    try {
      if (req.body.dueDate) {
        const due = new Date(req.body.dueDate)
        const today = new Date()
        if (!isNaN(due.getTime()) && (balanceDue > epsilon) && (due.getTime() < new Date(today.toDateString()).getTime())) isOverdue = true
      }
    } catch {}

    const entries = []
    // If tax is provided in preview request (from UI), add explicit tax line
    let taxableSubtotal = amount
    if (req.body.taxSettings && (req.body.taxSettings.enabled === true) && typeof req.body.taxSettings.amount === 'number' && req.body.taxSettings.amount > 0) {
      const taxAmount = parseFloat(req.body.taxSettings.amount)
      const subtotal = Math.max(0, amount - taxAmount)
      taxableSubtotal = subtotal
      // Debit expense subtotal
      entries.push({ type: 'debit', accountCode: resolution.debit.accountCode, accountName: resolution.debit.accountName, amount: subtotal })
      // Credit Sales Tax Payable for tax
      const taxAcc = await prisma.account.findFirst({ where: { code: '2150' } })
      if (taxAcc) entries.push({ type: 'credit', accountCode: '2150', accountName: taxAcc.name, amount: taxAmount })
    } else {
      // Debit full amount when no tax split
      entries.push({ type: 'debit', accountCode: resolution.debit.accountCode, accountName: resolution.debit.accountName, amount })
    }
    // Credit cash/AP for the paid portion (limited to total amount)
    entries.push({ type: 'credit', accountCode: resolution.credit.accountCode, accountName: resolution.credit.accountName, amount: Math.min(amountPaid || amount, amount) })
    if (overpaid > 0.01) {
      // Vendor credit presentation (US practice): show as Accounts Payable debit (negative A/P balance)
      const ap = await prisma.account.findFirst({ where: { code: '2010' } })
      if (ap) entries.push({ type: 'debit', accountCode: '2010', accountName: ap.name, amount: overpaid })
    }

    res.json({
      documentType: 'expense',
      dateUsed: resolution.dateUsed,
      policy: resolution.policy,
      totalExpense: amount,
      amountPaid,
      overpaidAmount: overpaid,
      computed: { paymentStatus: computedPaymentStatus, isOverdue, balanceDue },
      dryRun: true,
      entries
    })
  } catch (e) {
    console.error('preview error:', e)
    res.status(500).json({ error: 'Preview failed', details: String(e) })
  }
})

// Post expense (uses PostingService for full double-entry and idempotency)
app.post('/api/expenses', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ code: 'MALFORMED_JSON', message: 'Request body must be valid JSON' })
    }
    const validation = PostingService.validateExpensePayload(req.body)
    if (!validation.isValid) {
      return res.status(422).json({ code: 'VALIDATION_FAILED', message: 'Invalid expense data provided', details: validation.errors })
    }
    const result = await PostingService.postTransaction(validation.normalizedData)
    return res.status(result.isExisting ? 200 : 201).json({ ...result, success: true })
  } catch (e) {
    console.error('post expense error:', e)
    if (String(e.message).includes('Duplicate transaction reference')) {
      return res.status(409).json({ code: 'DUPLICATE_REFERENCE', message: e.message })
    }
    if (String(e.message).includes('Missing accounts')) {
      return res.status(422).json({ code: 'ACCOUNTS_NOT_FOUND', message: e.message })
    }
    if (String(e.message).includes('BALANCED JOURNAL INVARIANT')) {
      return res.status(500).json({ code: 'ACCOUNTING_ERROR', message: e.message })
    }
    res.status(500).json({ code: 'POSTING_ENGINE_ERROR', message: 'Unexpected error in posting engine', details: String(e) })
  }
})

// List expenses
app.get('/api/expenses', async (req, res) => {
  try {
    const { search, vendor, amount, invoiceNumber, date } = req.query || {}
    if (String(search || '').toLowerCase() === 'true') {
      // Lightweight search for refund/original-match support
      const where = {
        AND: [
          vendor ? { vendor: { contains: String(vendor), mode: 'insensitive' } } : {},
          amount ? { amount: { equals: new PrismaClient().$extends ? undefined : undefined } } : {}
        ]
      }
      // Prisma Decimal filter workaround: use raw query-friendly parse
      const amtNum = amount ? parseFloat(String(amount)) : null
      const byVendor = vendor ? { vendor: { contains: String(vendor), mode: 'insensitive' } } : {}
      const list = await prisma.expense.findMany({ where: byVendor, include: { transaction: true }, orderBy: { date: 'desc' } })
      const filtered = list.filter((e) => {
        const sameAmt = amtNum == null ? true : Math.abs(Number(e.amount) - amtNum) <= 0.01
        const sameInv = invoiceNumber ? String(e.transaction?.reference || '').includes(String(invoiceNumber)) : true
        const sameDate = date ? (new Date(e.date).toISOString().slice(0,10) === String(date)) : true
        return sameAmt && sameInv && sameDate
      })
      return res.json(filtered)
    }
    const expenses = await prisma.expense.findMany({ include: { transaction: true }, orderBy: { date: 'desc' } })
    return res.json(expenses)
  } catch (e) {
    console.error('get expenses error:', e)
    res.status(500).json({ error: 'Failed to fetch expenses' })
  }
})

// Revenue transaction - Cash ⇄ Revenue
app.post('/api/transactions/revenue', async (req, res) => {
  try {
    const b = req.body || {}
    const amount = parseFloat(b.amount || 0)
    if (!(b.customer && amount > 0 && b.date && b.description)) {
      return res.status(400).json({ error: 'customer, amount, date, description required' })
    }

    const reference = b.reference || `REV-${Date.now()}`
    const existing = await prisma.transaction.findUnique({ where: { reference } })
    if (existing) return res.json({ success: true, isExisting: true, transactionId: existing.id, message: 'Idempotent: already exists' })

    const cashAcc = await prisma.account.findFirst({ where: { code: b.cashAccount || '1010' } })
    const revenueAcc = await prisma.account.findFirst({ where: { code: b.revenueAccount || '4020' } })
    if (!cashAcc || !revenueAcc) return res.status(422).json({ error: 'Required accounts missing' })

    const txId = await prisma.$transaction(async (tx) => {
      const header = await tx.transaction.create({
        data: {
          date: new Date(b.date),
          description: b.description,
          reference,
          amount,
          customFields: { type: 'revenue', customer: b.customer, paymentMethod: b.paymentMethod || 'CASH' }
        }
      })
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: cashAcc.id, creditAccountId: null, amount, description: `Revenue from ${b.customer}` } })
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: null, creditAccountId: revenueAcc.id, amount, description: `Revenue from ${b.customer}` } })
      return header.id
    })

    res.json({ success: true, transactionId: txId })
  } catch (e) {
    console.error('revenue error:', e)
    res.status(500).json({ error: 'Failed to record revenue', details: String(e) })
  }
})

// Invoice posting - uses PostingService (supports tax/discount/overpay)
app.post('/api/invoices', async (req, res) => {
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ code: 'MALFORMED_JSON', message: 'Request body must be valid JSON' })
    }
    const validation = PostingService.validateInvoicePayload(req.body)
    if (!validation.isValid) {
      return res.status(422).json({ code: 'VALIDATION_FAILED', message: 'Invalid invoice data provided', details: validation.errors })
    }
    const result = await PostingService.postInvoiceTransaction(validation.normalizedData)
    return res.status(result.isExisting ? 200 : 201).json({ ...result, success: true })
  } catch (e) {
    console.error('invoice error:', e)
    if (String(e.message).includes('Duplicate transaction reference')) {
      return res.status(409).json({ code: 'DUPLICATE_REFERENCE', message: e.message })
    }
    if (String(e.message).includes('Missing accounts')) {
      return res.status(422).json({ code: 'ACCOUNTS_NOT_FOUND', message: e.message })
    }
    if (String(e.message).includes('Invoice entries not balanced') || String(e.message).includes('BALANCED JOURNAL INVARIANT')) {
      return res.status(500).json({ code: 'ACCOUNTING_ERROR', message: e.message })
    }
    res.status(500).json({ code: 'INVOICE_POSTING_ERROR', message: 'Unexpected error in invoice posting engine', details: String(e) })
  }
})

// List invoices
app.get('/api/invoices', async (req, res) => {
  try {
    const invoices = await prisma.invoice.findMany({ include: { transaction: true }, orderBy: { date: 'desc' } })
    res.json(invoices)
  } catch (e) {
    console.error('get invoices error:', e)
    res.status(500).json({ error: 'Failed to fetch invoices' })
  }
})

// Mark invoice as PAID (status update only)
app.post('/api/invoices/:id/mark-paid', async (req, res) => {
  try {
    const id = req.params.id
    const existing = await prisma.invoice.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Invoice not found' })
    const updated = await prisma.invoice.update({ where: { id }, data: { status: 'PAID' } })
    res.json({ success: true, invoice: updated })
  } catch (e) {
    console.error('mark-paid error:', e)
    res.status(500).json({ error: 'Failed to mark invoice paid' })
  }
})

// Record a payment for an invoice: DR Cash (1010) / CR Accounts Receivable (1200)
app.post('/api/invoices/:id/record-payment', async (req, res) => {
  try {
    const id = req.params.id
    const { amount, date } = req.body || {}
    const invoice = await prisma.invoice.findUnique({ where: { id } })
    if (!invoice) return res.status(404).json({ error: 'Invoice not found' })

    const paymentAmount = parseFloat(amount || invoice.amount)
    if (!(paymentAmount > 0)) return res.status(400).json({ error: 'amount must be > 0' })

    const cash = await prisma.account.findFirst({ where: { code: '1010' } })
    const ar = await prisma.account.findFirst({ where: { code: '1200' } })
    if (!cash || !ar) return res.status(422).json({ error: 'Required accounts missing (1010, 1200)' })

    const txId = await prisma.$transaction(async (tx) => {
      const header = await tx.transaction.create({
        data: {
          date: new Date(date || new Date()),
          description: `Payment received for ${invoice.invoiceNumber}`,
          reference: `PAY-${Date.now()}`,
          amount: paymentAmount,
          customFields: { type: 'invoice_payment', invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber }
        }
      })
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: cash.id, creditAccountId: null, amount: paymentAmount, description: `Payment received ${invoice.invoiceNumber}` } })
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: null, creditAccountId: ar.id, amount: paymentAmount, description: `Payment received ${invoice.invoiceNumber}` } })
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: 'PAID' } })
      return header.id
    })

    res.json({ success: true, transactionId: txId })
  } catch (e) {
    console.error('record-payment error:', e)
    res.status(500).json({ error: 'Failed to record payment' })
  }
})

// Capital contribution (Asset DR, Equity CR)
app.post('/api/transactions/capital', async (req, res) => {
  try {
    const b = req.body || {}
    const amount = parseFloat(b.amount || 0)
    if (!(b.contributor && amount > 0 && b.date && b.description)) {
      return res.status(400).json({ error: 'contributor, amount, date, description required' })
    }
    const reference = b.reference || `CAP-${Date.now()}`
    const existing = await prisma.transaction.findUnique({ where: { reference } })
    if (existing) return res.json({ success: true, isExisting: true, transactionId: existing.id, message: 'Idempotent: already exists' })

    const debitAcc = await prisma.account.findFirst({ where: { code: b.debitAccount || '1010' } })
    const equityAcc = await prisma.account.findFirst({ where: { code: b.equityAccount || '3000' } })
    if (!debitAcc || !equityAcc) return res.status(422).json({ error: 'Required accounts missing' })

    const txId = await prisma.$transaction(async (tx) => {
      const header = await tx.transaction.create({
        data: {
          date: new Date(b.date),
          description: b.description,
          reference,
          amount,
          customFields: { type: 'capital', contributor: b.contributor, notes: b.notes || null }
        }
      })
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: debitAcc.id, creditAccountId: null, amount, description: `Capital contribution from ${b.contributor}` } })
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: null, creditAccountId: equityAcc.id, amount, description: `Capital contribution from ${b.contributor}` } })
      return header.id
    })

    res.json({ success: true, transactionId: txId })
  } catch (e) {
    console.error('capital error:', e)
    res.status(500).json({ error: 'Failed to record capital contribution' })
  }
})

// Debug endpoint: last transaction
app.get('/api/debug/last-transaction', async (req, res) => {
  try {
    const last = await prisma.transaction.findFirst({
      orderBy: { createdAt: 'desc' },
      include: { entries: { include: { debitAccount: true, creditAccount: true } } }
    })
    if (!last) return res.json({ message: 'No transactions found' })
    const totalDebits = last.entries.filter(e => e.debitAccountId).reduce((s, e) => s + parseFloat(e.amount), 0)
    const totalCredits = last.entries.filter(e => e.creditAccountId).reduce((s, e) => s + parseFloat(e.amount), 0)
    res.json({
      transaction: { id: last.id, amount: last.amount, description: last.description, date: last.date },
      entries: last.entries.map(e => ({ id: e.id, amount: e.amount, description: e.description, debitAccount: e.debitAccount ? `${e.debitAccount.code} - ${e.debitAccount.name}` : null, creditAccount: e.creditAccount ? `${e.creditAccount.code} - ${e.creditAccount.name}` : null })),
      balance: { totalDebits, totalCredits, balanced: Math.abs(totalDebits - totalCredits) < 0.01 }
    })
  } catch (e) {
    console.error('debug last transaction error:', e)
    res.status(500).json({ error: 'Debug endpoint failed' })
  }
})
// Customers CRUD (minimal)
app.get('/api/customers', async (req, res) => {
  try {
    const q = (req.query.query || '').toString().trim().toLowerCase()
    const where = q
      ? {
          isActive: true,
          OR: [
            { name: { contains: q, mode: 'insensitive' } },
            { email: { contains: q, mode: 'insensitive' } },
            { company: { contains: q, mode: 'insensitive' } }
          ]
        }
      : { isActive: true }
    const customers = await prisma.customer.findMany({ where, orderBy: { name: 'asc' } })
    res.json({ success: true, customers })
  } catch (e) {
    console.error('get customers error:', e)
    res.status(500).json({ success: false, error: 'Failed to fetch customers' })
  }
})

app.post('/api/customers', async (req, res) => {
  try {
    const { name, email, company, phone, address, city, state, zipCode, notes } = req.body || {}
    if (!name || !email) return res.status(400).json({ success: false, error: 'Name and email are required' })
    const existing = await prisma.customer.findUnique({ where: { email: email.toLowerCase().trim() } })
    if (existing) return res.status(409).json({ success: false, error: 'Customer with this email already exists' })
    const c = await prisma.customer.create({
      data: {
        name: name.trim(),
        company: company?.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zipCode: zipCode?.trim() || null,
        notes: notes?.trim() || null
      }
    })
    res.status(201).json({ success: true, customer: c })
  } catch (e) {
    console.error('post customer error:', e)
    res.status(500).json({ success: false, error: 'Failed to create customer' })
  }
})

app.put('/api/customers/:id', async (req, res) => {
  try {
    const id = req.params.id
    const { name, email, company, phone, address, city, state, zipCode, notes, isActive } = req.body || {}
    if (!name || !email) return res.status(400).json({ success: false, error: 'Name and email are required' })
    const dup = await prisma.customer.findFirst({ where: { email: email.trim().toLowerCase(), id: { not: id } } })
    if (dup) return res.status(409).json({ success: false, error: 'A customer with this email already exists' })
    const c = await prisma.customer.update({
      where: { id },
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        company: company?.trim() || null,
        phone: phone?.trim() || null,
        address: address?.trim() || null,
        city: city?.trim() || null,
        state: state?.trim() || null,
        zipCode: zipCode?.trim() || null,
        notes: notes?.trim() || null,
        isActive: typeof isActive === 'boolean' ? isActive : undefined
      }
    })
    res.json({ success: true, customer: c })
  } catch (e) {
    console.error('put customer error:', e)
    res.status(500).json({ success: false, error: 'Failed to update customer' })
  }
})

// Simple setup helper to ensure core accounts (optional for demos)
app.post('/api/setup/ensure-core-accounts', async (req, res) => {
  try {
    const coreAccounts = [
      { code: '1010', name: 'Cash and Cash Equivalents', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1350', name: 'Deposits & Advances', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1400', name: 'Prepaid Expenses', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '3000', name: 'Owner Equity', type: 'EQUITY', normalBalance: 'CREDIT' },
      { code: '3200', name: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
      { code: '4020', name: 'Services Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '4010', name: 'Product Sales', type: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '4910', name: 'Sales Discounts', type: 'REVENUE', normalBalance: 'DEBIT' },
      { code: '2050', name: 'Customer Credits Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2150', name: 'Sales Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '5010', name: 'Cost of Goods Sold', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6020', name: 'Office Supplies Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6030', name: 'Software Subscriptions', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6040', name: 'Marketing Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6060', name: 'Travel Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6080', name: 'Utilities', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6110', name: 'Insurance', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6999', name: 'Other Business Expense', type: 'EXPENSE', normalBalance: 'DEBIT' }
    ]
    const created = []
    for (const a of coreAccounts) {
      const existing = await prisma.account.findFirst({ where: { code: a.code } })
      if (!existing) {
        await prisma.account.create({ data: a })
        created.push(a.code)
      }
    }
    res.json({ success: true, created })
  } catch (e) {
    console.error('ensure-core-accounts error:', e)
    res.status(500).json({ success: false, error: String(e) })
  }
})

// Seed: initial capital
app.post('/api/setup/initial-capital', async (req, res) => {
  try {
    const { amount = 10000, reference = 'INITIAL-CAPITAL' } = req.body || {}
    const cash = await prisma.account.findFirst({ where: { code: '1010' } })
    const equity = await prisma.account.findFirst({ where: { code: '3000' } })
    if (!cash || !equity) return res.status(422).json({ error: 'Core accounts missing. Run /api/setup/ensure-core-accounts first.' })

    const tx = await prisma.transaction.create({
      data: {
        date: new Date('2025-01-01'),
        description: 'Initial Owner Investment',
        reference,
        amount: parseFloat(amount),
        customFields: { type: 'initial_capital' }
      }
    })
    await prisma.transactionEntry.create({ data: { transactionId: tx.id, debitAccountId: cash.id, creditAccountId: null, amount: parseFloat(amount), description: 'Initial capital investment' } })
    await prisma.transactionEntry.create({ data: { transactionId: tx.id, debitAccountId: null, creditAccountId: equity.id, amount: parseFloat(amount), description: 'Initial capital investment' } })
    res.json({ success: true, transactionId: tx.id })
  } catch (e) {
    console.error('initial-capital error:', e)
    res.status(500).json({ error: String(e) })
  }
})

// Seed: sample revenue
app.post('/api/setup/sample-revenue', async (req, res) => {
  try {
    const { amount = 5000, reference = 'SAMPLE-REVENUE' } = req.body || {}
    const cash = await prisma.account.findFirst({ where: { code: '1010' } })
    const revenue = await prisma.account.findFirst({ where: { code: '4020' } })
    if (!cash || !revenue) return res.status(422).json({ error: 'Core accounts missing. Run /api/setup/ensure-core-accounts first.' })

    const tx = await prisma.transaction.create({
      data: {
        date: new Date('2025-01-15'),
        description: 'Sample Revenue - Services',
        reference,
        amount: parseFloat(amount),
        customFields: { type: 'sample_revenue' }
      }
    })
    await prisma.transactionEntry.create({ data: { transactionId: tx.id, debitAccountId: cash.id, creditAccountId: null, amount: parseFloat(amount), description: 'Services revenue' } })
    await prisma.transactionEntry.create({ data: { transactionId: tx.id, debitAccountId: null, creditAccountId: revenue.id, amount: parseFloat(amount), description: 'Services revenue' } })
    res.json({ success: true, transactionId: tx.id })
  } catch (e) {
    console.error('sample-revenue error:', e)
    res.status(500).json({ error: String(e) })
  }
})

// Bootstrap a tenant and seed per-tenant core accounts
app.post('/api/setup/bootstrap-tenant', async (req, res) => {
  try {
    const body = req.body || {}
    const tenantName = String(body.tenantName || 'Default Tenant').trim()
    const userId = String(body.userId || 'local-dev').trim()
    const role = String(body.role || 'OWNER').toUpperCase()

    // 1) Create or get Tenant by name (no unique constraint on name, so find-first)
    let tenant = await prisma.tenant.findFirst({ where: { name: tenantName } })
    let tenantCreated = false
    if (!tenant) {
      tenant = await prisma.tenant.create({ data: { name: tenantName } })
      tenantCreated = true
    }

    // 2) Ensure Membership (unique on [userId, tenantId])
    let membership = await prisma.membership.findFirst({ where: { userId, tenantId: tenant.id } })
    let membershipCreated = false
    if (!membership) {
      membership = await prisma.membership.create({ data: { userId, tenantId: tenant.id, role } })
      membershipCreated = true
    }

    // 3) Ensure per-tenant core accounts
    const createdCodes = await ensureCoreAccountsForTenant(tenant.id)

    res.json({ ok: true, tenantId: tenant.id, tenantCreated, membershipCreated, accountsCreated: createdCodes })
  } catch (e) {
    console.error('bootstrap-tenant error:', e)
    res.status(500).json({ ok: false, error: 'Failed to bootstrap tenant' })
  }
})

// Global error handler
app.use((err, req, res, next) => {
  const status = 500
  const details = (err && (err.stack || err.message)) || String(err)
  console.error('[UNHANDLED]', details)
  res.status(status).json({ error: 'Internal Server Error', details })
})

// Boot-time safeguard: ensure core accounts exist (idempotent)
async function ensureCoreAccountsIfMissing() {
  try {
    const coreAccounts = [
      { code: '1010', name: 'Cash and Cash Equivalents', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1350', name: 'Deposits & Advances', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '3000', name: 'Owner Equity', type: 'EQUITY', normalBalance: 'CREDIT' },
      { code: '3200', name: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
      { code: '4020', name: 'Services Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '4010', name: 'Product Sales', type: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '4910', name: 'Sales Discounts', type: 'REVENUE', normalBalance: 'DEBIT' },
      { code: '2050', name: 'Customer Credits Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2150', name: 'Sales Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '5010', name: 'Cost of Goods Sold', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6020', name: 'Office Supplies Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6030', name: 'Software Subscriptions', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6040', name: 'Marketing Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6060', name: 'Travel Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6110', name: 'Insurance', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6999', name: 'Other Business Expense', type: 'EXPENSE', normalBalance: 'DEBIT' }
    ]
    const created = []
    for (const a of coreAccounts) {
      const existing = await prisma.account.findFirst({ where: { code: a.code } })
      if (!existing) {
        await prisma.account.create({ data: a })
        created.push(a.code)
      }
    }
    if (created.length) {
      console.log('[bootstrap] Core accounts created:', created.join(', '))
    } else {
      console.log('[bootstrap] Core accounts already present')
    }
  } catch (e) {
    console.error('[bootstrap] ensure-core-accounts failed:', e)
  }
}

// Per-tenant core accounts
async function ensureCoreAccountsForTenant(tenantId) {
  try {
    const codes = [
      { code: '1010', name: 'Cash and Cash Equivalents', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1200', name: 'Accounts Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '1350', name: 'Deposits & Advances', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '3000', name: 'Owner Equity', type: 'EQUITY', normalBalance: 'CREDIT' },
      { code: '3200', name: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
      { code: '4020', name: 'Services Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '4010', name: 'Product Sales', type: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '4910', name: 'Sales Discounts', type: 'REVENUE', normalBalance: 'DEBIT' },
      { code: '2050', name: 'Customer Credits Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2150', name: 'Sales Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '5010', name: 'Cost of Goods Sold', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6020', name: 'Office Supplies Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6030', name: 'Software Subscriptions', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6040', name: 'Marketing Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6060', name: 'Travel Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6110', name: 'Insurance', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6999', name: 'Other Business Expense', type: 'EXPENSE', normalBalance: 'DEBIT' }
    ]
    const created = []
    for (const a of codes) {
      const existing = await prisma.account.findFirst({ where: { tenantId, code: a.code } })
      if (!existing) {
        await prisma.account.create({ data: { ...a, tenantId } })
        created.push(a.code)
      }
    }
    return created
  } catch (e) {
    console.error('[bootstrap] ensureCoreAccountsForTenant failed:', e)
    return []
  }
}

server.listen(PORT, async () => {
  console.log(`Embedded server running on http://localhost:${PORT}`)
  try { await ensureCoreAccountsIfMissing() } catch {}
})

// AI proxy (optional)
app.post('/api/ai/generate', async (req, res) => {
  try {
    const { prompt } = req.body || {}
    if (!prompt) return res.status(400).json({ error: 'prompt required' })
    if (!process.env.GEMINI_API_KEY) { aiLimiter.attachHeaders(res); return res.status(500).json({ error: 'AI service not configured' }) }
    const quota = aiLimiter.checkAndConsume(1)
    aiLimiter.attachHeaders(res)
    if (!quota.allowed) {
      return res.status(429).json({ code: 'AI_RATE_LIMIT_EXCEEDED', message: 'AI usage limit exceeded. Please try again later.', retryAfterSeconds: quota.retryAfterSeconds })
    }
    const base = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    const url = `${base}?key=${process.env.GEMINI_API_KEY}`
    const { data } = await axios.post(url, { contents: [{ parts: [{ text: prompt }] }] }, { headers: { 'Content-Type': 'application/json' } })
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    res.json({ content, usage: data?.usageMetadata })
  } catch (e) {
    console.error('AI proxy error:', e)
    res.status(500).json({ error: 'AI request failed', details: 'An error occurred while generating the response.' })
  }
})



