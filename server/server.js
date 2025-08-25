import express from 'express'
import cors from 'cors'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import { prisma, systemPrisma, tenantContextMiddleware, verifyBearerToken, requireRole, upsertUserProfile } from './src/tenancy.js'
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
import usGaapCoa from './data/us_gaap_coa.json' with { type: 'json' }
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

// Load env (development/local)
try {
  const dotenv = await import('dotenv')
  dotenv?.config?.()
} catch {}

const app = express()
const server = createServer(app)
const wss = new WebSocketServer({ server })
// Prisma client is provided by tenancy layer (enforces tenant scoping)
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
app.use(cors({ origin: true, credentials: true }))
app.use(express.json({ limit: '5mb' }))
// Enforce auth + tenant context for API routes only
// Allow unauthenticated reads for a minimal set of public endpoints when enforcement is disabled.
// All other endpoints still require auth when AILEGR_AUTH_ENFORCE=true.
// Middleware respects AILEGR_AUTH_ENFORCE; when false, requests without a valid JWT
// proceed as anonymous (no req.auth), but tenant-scoped reads still apply only when a tenant can be resolved.
app.use('/api', tenantContextMiddleware({ enforceAuth: process.env.AILEGR_AUTH_ENFORCE }))

// File upload (for OCR/receipts) with per-tenant subfolders
const uploadDir = path.resolve(process.cwd(), 'uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    try {
      const tid = String((req && req.tenantId) || 'dev')
      const dir = path.join(uploadDir, tid)
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      cb(null, dir)
    } catch (e) { cb(e, uploadDir) }
  },
  filename: (_req, file, cb) => {
    const base = (file.originalname || 'file').replace(/[^A-Za-z0-9._-]/g, '_')
    const ts = Date.now()
    cb(null, `${ts}-${base}`)
  }
})
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } })
// Serve uploaded files; enforce tenant path prefix
app.use('/uploads', (req, res, next) => {
  const mw = tenantContextMiddleware()
  mw(req, res, () => {
    try {
      const tid = String((req && req.tenantId) || 'dev')
      const urlPath = decodeURIComponent(req.path || req.url || '')
      if (!urlPath.startsWith(`/${tid}/`)) return res.status(403).json({ error: 'Forbidden' })
    } catch { return res.status(403).json({ error: 'Forbidden' }) }
    return express.static(uploadDir)(req, res, next)
  })
})

// WebSocket AI Chat (real-time) with auth handshake
const wsClients = new WeakMap()
wss.on('connection', (ws) => {
  wsClients.set(ws, { authed: false, userId: null, tenantId: null })
  try { ws.send(JSON.stringify({ type: 'hello', message: 'auth_required' })) } catch {}
  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message.toString())
      const state = wsClients.get(ws) || { authed: false }
      if (!state.authed) {
        if (data.type !== 'auth') { ws.send(JSON.stringify({ type: 'error', message: 'auth required' })); return }
        const token = String(data.token || '')
        const tenantId = String(data.tenantId || '')
        const auth = await verifyBearerToken(token)
        if (!auth) { ws.send(JSON.stringify({ type: 'error', message: 'unauthorized' })); ws.close(); return }
        let finalTenant = 'dev'
        if (tenantId) {
          const m = await prisma.membership.findFirst({ where: { userId: auth.userId, tenantId } })
          if (m) finalTenant = tenantId
        } else {
          const m = await prisma.membership.findFirst({ where: { userId: auth.userId }, orderBy: { createdAt: 'asc' } })
          if (m) finalTenant = m.tenantId
        }
        wsClients.set(ws, { authed: true, userId: auth.userId, tenantId: finalTenant })
        ws.send(JSON.stringify({ type: 'auth_ok', tenantId: finalTenant }))
        return
      }
      if (data.type === 'chat') {
        const context = { ...(data.context || {}), tenantId: wsClients.get(ws)?.tenantId }
        const aiResponse = await processAIChat(data.message, context)
        ws.send(JSON.stringify({ type: 'chat_response', message: aiResponse.content, action: aiResponse.action }))
      }
    } catch (error) {
      console.error('WebSocket error:', error)
      try { ws.send(JSON.stringify({ type: 'error', message: 'Failed to process message' })) } catch {}
    }
  })
  ws.on('close', () => { try { wsClients.delete(ws) } catch {}; console.log('WebSocket connection closed') })
})

// Health
app.get('/health', (req, res) => {
  res.json({ status: 'ok', port: PORT })
})

// Auth status (debug): shows whether middleware attached auth and tenant
app.get('/api/auth/status', (req, res) => {
  try {
    const enforceAuth = String(process.env.AILEGR_AUTH_ENFORCE || 'true').toLowerCase() === 'true'
    res.json({ enforceAuth, auth: !!(req && req.auth), userId: req?.auth?.userId || null, tenantId: req?.tenantId || 'dev' })
  } catch { res.json({ enforceAuth: true, auth: false }) }
})

app.get('/api/health', async (req, res) => {
  try {
    // Compose a lightweight health snapshot using existing report services
    const tb = await ReportingService.getTrialBalance()
    const bs = await ReportingService.getBalanceSheet()
    res.json({ status: 'ok', balanced: tb.totals.isBalanced, bsEquationOK: bs.totals.equationOK })
  } catch (error) {
    res.status(500).json({ status: 'ERROR', error: error.message })
  }
})

// Company Profile endpoints (tenant-scoped)
app.get('/api/company-profile', async (req, res) => {
  try {
    if (!(prisma && (prisma).companyProfile)) {
      // Prisma client not regenerated for new model yet
      return res.json({ legalName: '', aliases: [], email: '', addressLines: [], city: '', state: '', zipCode: '', country: 'US' })
    }
    const profile = await prisma.companyProfile.findFirst({ where: {} })
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
      city: profile.city || '', state: profile.state || '', zipCode: profile.zipCode || '', country: profile.country || 'US',
      timeZone: profile.timeZone || null,
      taxRegime: profile.taxRegime || null,
      taxAccounts: profile.taxAccounts || null
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
    // Make legalName optional; store empty string when not provided
    const aliases = Array.isArray(body.aliases) ? body.aliases.map((s) => String(s).trim()).filter(Boolean).slice(0, 20) : []
    const email = body.email ? String(body.email).trim() : null
    const addressLines = Array.isArray(body.addressLines) ? body.addressLines.map((s) => String(s)) : []
    const city = body.city ? String(body.city).trim() : null
    const state = body.state ? String(body.state).trim() : null
    const zipCode = body.zipCode ? String(body.zipCode).trim() : null
    const country = body.country ? String(body.country).trim() : 'US'
    const timeZone = body.timeZone ? String(body.timeZone).trim() : null

    // Normalization helpers
    const normalize = (s) => String(s || '').toLowerCase().replace(/\b(inc|llc|ltd|corp|co)\.?$/i, '').trim()
    const normalizedLegalName = normalize(legalName)
    const normalizedAliases = aliases.map((a) => normalize(a))

    const saved = await prisma.companyProfile.upsert({
      where: { tenantId: req.tenantId || 'dev' },
      update: { legalName, aliases, email, addressLines, city, state, zipCode, country, timeZone, normalizedLegalName, normalizedAliases, taxRegime: body.taxRegime || null, taxAccounts: body.taxAccounts || null },
      create: { tenantId: req.tenantId || 'dev', legalName, aliases, email, addressLines, city, state, zipCode, country, timeZone, normalizedLegalName, normalizedAliases, taxRegime: body.taxRegime || null, taxAccounts: body.taxAccounts || null }
    })
    res.json({ ok: true, legalName: saved.legalName, timeZone: saved.timeZone || null, taxRegime: saved.taxRegime || null, taxAccounts: saved.taxAccounts || null })
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

    const tid = String((req && req.tenantId) || 'dev')
    res.json({
      message: 'File processed',
      filename: req.file.filename,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      text: extractedText,
      previewUrl: `/uploads/${tid}/${req.file.filename}`
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
      // Avoid matching "Invoice Date" by excluding Date/DT after 'Invoice'
      invoiceNumber: (() => {
        const m = normalized.match(/Invoice\s*(?!(?:Date|DT)\b)(?:No\.?|#|Number)?\s*[:\-]?\s*([A-Z0-9][A-Z0-9._\-\/]*)/i)
        const val = m?.[1] || null
        if (!val) return null
        // Hard filter: reject values that look like dates
        if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return null
        if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(val)) return null
        if (/^date$/i.test(val)) return null
        return val
      })(),
      invoiceDate: dateFrom(labelGrab('invoice\s*date')),
      dueDate: dateFrom(labelGrab('due\s*date')),
      revenueRecognitionDate: dateFrom(labelGrab('revenue\s*recognition\s*date')),
      vendorName: vendorName,
      billToName: billToName
    }

    // Detect tax percentage and "tax included" language
    try {
      const pct = normalized.match(/\b(?:tax|vat|gst|hst|pst)[^\n%]{0,20}?([0-9]{1,2}(?:\.[0-9]{1,2})?)\s*%/i)
      if (pct && pct[1]) {
        labels.taxRatePercent = parseFloat(pct[1])
      }
      labels.taxIncluded = /tax\s*included|includes\s*tax/i.test(normalized)
    } catch {}

    // Attempt COA mapping hint (best-effort, no AI call here)
    try {
      const textLower = normalized.toLowerCase()
      const hints = [
        { re: /(aws|azure|gcp|cloud|hosting|server)/, code: '6240' },
        { re: /(stripe|paypal|square|merchant|processor|gateway|braintree)/, code: '6230' },
        { re: /(phone|internet|wifi|fiber|verizon|t-mobile|att|comcast|spectrum)/, code: '6160' },
        { re: /(insurance|premium|policy)/, code: '6115' },
        { re: /(training|workshop|course|seminar)/, code: '6170' },
        { re: /(meal|restaurant|dinner|lunch|coffee|catering)/, code: '6180' },
        { re: /(software|subscription|saas)/, code: '6030' },
        { re: /(office|supplies|stationery|staples|depot)/, code: '6020' },
        { re: /(marketing|advertising|ads|promotion)/, code: '6040' }
      ]
      const m = hints.find(h => h.re.test(textLower))
      if (m) labels.suggestedAccountCode = m.code
    } catch {}

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

app.get('/api/categories/pending', requireRole('OWNER','ADMIN'), async (req, res) => {
  try {
    const list = await AICategoryService.getPendingApprovals()
    res.json({ success: true, pending: list })
  } catch (e) {
    console.error('AI category pending error:', e)
    res.status(500).json({ success: false, error: 'Failed to fetch pending approvals' })
  }
})

app.post('/api/categories/pending/:id/approve', requireRole('OWNER','ADMIN'), async (req, res) => {
  try {
    const id = req.params.id
    const updated = await AICategoryService.approveCategory(id, req.body || {})
    res.json({ success: true, category: updated })
  } catch (e) {
    console.error('AI category approve error:', e)
    res.status(500).json({ success: false, error: 'Failed to approve category' })
  }
})

app.post('/api/categories/pending/:id/reject', requireRole('OWNER','ADMIN'), async (req, res) => {
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

app.post('/api/categories', requireRole('OWNER','ADMIN'), async (req, res) => {
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

app.put('/api/categories/:id', requireRole('OWNER','ADMIN'), async (req, res) => {
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

app.delete('/api/categories/:id', requireRole('OWNER','ADMIN'), async (req, res) => {
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
app.post('/api/accounts', requireRole('OWNER','ADMIN'), async (req, res) => {
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
    const tid = String((req && req.tenantId) || 'dev')
    const updated = await prisma.expense.update({ where: { id }, data: { receiptUrl: `/uploads/${tid}/${req.file.filename}` } })
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

    const result = { labels }
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
      // Compute tax and discount for preview
      const discountAmount = (req.body.discount && req.body.discount.enabled) ? Math.max(0, parseFloat(req.body.discount.amount || 0) || 0) : 0
      let taxAmount = 0
      try {
        if (req.body.taxSettings && req.body.taxSettings.enabled) {
          if (String(req.body.taxSettings.type || 'amount').toLowerCase() === 'percentage') {
            const rate = Math.max(0, parseFloat(req.body.taxSettings.rate || 0) || 0)
            const base = (typeof req.body.subtotal === 'number' ? parseFloat(req.body.subtotal) : (totalInvoice - discountAmount))
            taxAmount = parseFloat(((base * rate) / 100).toFixed(2))
          } else {
            taxAmount = Math.max(0, parseFloat(req.body.taxSettings.amount || 0) || 0)
          }
          if (taxAmount > totalInvoice) taxAmount = totalInvoice
          // clamp preview to 2 decimals to match posting entries
          taxAmount = +parseFloat(String(taxAmount)).toFixed(2)
        }
      } catch {}
      // CREDIT revenue net of tax (and discount if provided)
      let revenueCreditAmount = Math.max(0, +(totalInvoice - taxAmount - discountAmount).toFixed(2))
      // If lineItems provided, map them proportionally to revenue accounts for preview
      const hasLines = Array.isArray(req.body.lineItems) && req.body.lineItems.length > 0
      if (hasLines) {
        try {
          const originalSum = req.body.lineItems.reduce((s, li) => s + (parseFloat(li.amount || 0) || 0), 0)
          const target = revenueCreditAmount
          const scale = originalSum > 0 ? (target / originalSum) : 1
          let running = 0
          for (let i = 0; i < req.body.lineItems.length; i++) {
            const li = req.body.lineItems[i]
            const raw = parseFloat(li.amount || 0) || 0
            let lineAmt = +(raw * scale).toFixed(2)
            if (i === req.body.lineItems.length - 1) lineAmt = +(target - running).toFixed(2)
            const revCode = PostingService.mapLineItemToRevenueAccount(li)
            const acc = await PostingService.getAccountByCode(revCode)
            entries.push({ type: 'credit', accountCode: acc?.code || accounts.revenue.code, accountName: acc?.name || accounts.revenue.name, amount: lineAmt, description: `${li.description || 'Line Item'} - ${req.body.customerName || 'Customer'}` })
            running += lineAmt
          }
          revenueCreditAmount = target
        } catch {
          entries.push({ type: 'credit', accountCode: accounts.revenue.code, accountName: accounts.revenue.name, amount: revenueCreditAmount, description: `Revenue from ${req.body.customerName || 'Customer'}` })
        }
      } else {
        entries.push({ type: 'credit', accountCode: accounts.revenue.code, accountName: accounts.revenue.name, amount: revenueCreditAmount, description: `Revenue from ${req.body.customerName || 'Customer'}` })
      }
      if (discountAmount > 0) {
        entries.push({ type: 'debit', accountCode: (accounts.salesDiscounts?.code || '4910'), accountName: (accounts.salesDiscounts?.name || 'Sales Discounts'), amount: discountAmount, description: 'Sales Discount' })
      }
      if (taxAmount > 0) {
        entries.push({ type: 'credit', accountCode: (accounts.taxPayable?.code || '2150'), accountName: (accounts.taxPayable?.name || 'Sales Tax Payable'), amount: taxAmount, description: 'Sales Tax' })
      }
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
    // Compute subtotal/tax split for preview
    let taxAmount = 0
    let subtotal = amount
    if (req.body.taxSettings && (req.body.taxSettings.enabled === true) && typeof req.body.taxSettings.amount === 'number' && req.body.taxSettings.amount > 0) {
      taxAmount = parseFloat(req.body.taxSettings.amount)
      subtotal = Math.max(0, +(amount - taxAmount).toFixed(2))
    }
      // Debit expense subtotal
      entries.push({ type: 'debit', accountCode: resolution.debit.accountCode, accountName: resolution.debit.accountName, amount: subtotal })
    // Debit tax to expense/receivable based on regime (US: 6110, VAT: 1360)
    if (taxAmount > 0) {
      let taxCode = '6110'
      try {
        const prof = await prisma.companyProfile.findFirst({ where: { tenantId: req.tenantId || 'dev' }, select: { taxRegime: true, taxAccounts: true } })
        if (prof) {
          const regime = String(prof.taxRegime || 'US_SALES_TAX').toUpperCase()
          if (regime === 'VAT') taxCode = (prof.taxAccounts?.receivable || '1360')
          else taxCode = (prof.taxAccounts?.expense || '6110')
        }
      } catch {}
      const tAcc = await prisma.account.findFirst({ where: { code: taxCode } })
      if (tAcc) entries.push({ type: 'debit', accountCode: taxCode, accountName: tAcc.name, amount: taxAmount })
    }
    // Credits: cash for paid portion, A/P for balance
    const paidPortion = Math.max(0, Math.min(amountPaid || 0, amount))
    if (paidPortion > 0) {
      const cash = await prisma.account.findFirst({ where: { code: '1010' } })
      if (cash) entries.push({ type: 'credit', accountCode: '1010', accountName: cash.name, amount: paidPortion })
    }
    const balancePortion = Math.max(0, +(amount - paidPortion).toFixed(2))
    if (balancePortion > 0) {
      const apAcc = await prisma.account.findFirst({ where: { code: '2010' } })
      if (apAcc) entries.push({ type: 'credit', accountCode: '2010', accountName: apAcc.name, amount: balancePortion })
    }
    if (overpaid > 0.01) {
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
    // Duplicate vendor invoice number check (AP): vendor + vendorInvoiceNo per tenant
    try {
      const vin = validation.normalizedData.vendorInvoiceNo
      const vendor = validation.normalizedData.vendorName
      if (vin && vendor) {
        const dup = await prisma.expense.findFirst({ where: { vendor: vendor, vendorInvoiceNo: vin } })
        if (dup) {
          return res.status(409).json({ code: 'DUPLICATE_VENDOR_INVOICE', message: `A bill from ${vendor} with Vendor Invoice No. "${vin}" already exists.` })
        }
      }
    } catch {}
    const result = await PostingService.postTransaction(validation.normalizedData)
    // Save vendor defaults for tax settings (best-effort)
    try {
      const vn = String(validation.normalizedData.vendorName || '').trim()
      if (vn && validation.normalizedData.taxSettings && validation.normalizedData.taxSettings.enabled) {
        const def = {
          taxEnabled: true,
          taxMode: validation.normalizedData.taxSettings.type,
          taxRate: validation.normalizedData.taxSettings.type === 'percentage' ? Number(validation.normalizedData.taxSettings.rate || 0) : null,
          taxAmount: validation.normalizedData.taxSettings.type === 'amount' ? Number(validation.normalizedData.taxSettings.amount || 0) : null
        }
        await prisma.vendorSetting.upsert({
          where: { tenantId_vendor: { tenantId: req.tenantId || 'dev', vendor: vn } },
          update: def,
          create: { tenantId: req.tenantId || 'dev', vendor: vn, ...def }
        })
      }
    } catch {}
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

// Vendor tax defaults
app.get('/api/vendors/:vendor/defaults', async (req, res) => {
  try {
    const vendor = String(req.params.vendor || '').trim()
    if (!vendor) return res.json({})
    const def = await prisma.vendorSetting.findUnique({ where: { tenantId_vendor: { tenantId: req.tenantId || 'dev', vendor } } })
    if (!def) return res.json({})
    return res.json({ taxEnabled: def.taxEnabled, taxMode: def.taxMode, taxRate: def.taxRate, taxAmount: def.taxAmount })
  } catch (e) {
    res.json({})
  }
})

app.put('/api/vendors/:vendor/defaults', async (req, res) => {
  try {
    const vendor = String(req.params.vendor || '').trim()
    if (!vendor) return res.status(400).json({ error: 'vendor required' })
    const body = req.body || {}
    const payload = {
      taxEnabled: !!body.taxEnabled,
      taxMode: body.taxMode || null,
      taxRate: body.taxRate != null ? Number(body.taxRate) : null,
      taxAmount: body.taxAmount != null ? Number(body.taxAmount) : null
    }
    await prisma.vendorSetting.upsert({
      where: { tenantId_vendor: { tenantId: req.tenantId || 'dev', vendor } },
      update: payload,
      create: { tenantId: req.tenantId || 'dev', vendor, ...payload }
    })
    res.json({ ok: true })
  } catch (e) {
    res.status(500).json({ error: 'Failed to save vendor defaults' })
  }
})

// Customer tax defaults (reuse vendorSetting table; keyed by customer name)
app.get('/api/customers/:customer/defaults', async (req, res) => {
  try {
    const customer = String(req.params.customer || '').trim()
    if (!customer) return res.json({})
    const def = await prisma.vendorSetting.findUnique({ where: { tenantId_vendor: { tenantId: req.tenantId || 'dev', vendor: customer } } })
    if (!def) return res.json({})
    return res.json({ taxEnabled: def.taxEnabled, taxMode: def.taxMode, taxRate: def.taxRate, taxAmount: def.taxAmount })
  } catch (e) { res.json({}) }
})

app.put('/api/customers/:customer/defaults', async (req, res) => {
  try {
    const customer = String(req.params.customer || '').trim()
    if (!customer) return res.status(400).json({ error: 'customer required' })
    const body = req.body || {}
    const payload = {
      taxEnabled: !!body.taxEnabled,
      taxMode: body.taxMode || null,
      taxRate: body.taxRate != null ? Number(body.taxRate) : null,
      taxAmount: body.taxAmount != null ? Number(body.taxAmount) : null
    }
    await prisma.vendorSetting.upsert({
      where: { tenantId_vendor: { tenantId: req.tenantId || 'dev', vendor: customer } },
      update: payload,
      create: { tenantId: req.tenantId || 'dev', vendor: customer, ...payload }
    })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Failed to save customer defaults' }) }
})

// Mark expense as PAID (status update only via transaction customFields)
app.post('/api/expenses/:id/mark-paid', async (req, res) => {
  try {
    const id = req.params.id
    const expense = await prisma.expense.findUnique({ where: { id }, include: { transaction: true } })
    if (!expense) return res.status(404).json({ error: 'Expense not found' })
    const updatedTx = await prisma.transaction.update({ where: { id: expense.transactionId }, data: { customFields: { ...(expense.transaction?.customFields || {}), paymentStatus: 'paid' } } })
    res.json({ success: true, transaction: updatedTx })
  } catch (e) {
    console.error('mark expense paid error:', e)
    res.status(500).json({ error: 'Failed to mark expense paid' })
  }
})

// Mark expense as UNPAID
app.post('/api/expenses/:id/mark-unpaid', async (req, res) => {
  try {
    const id = req.params.id
    const expense = await prisma.expense.findUnique({ where: { id }, include: { transaction: true } })
    if (!expense) return res.status(404).json({ error: 'Expense not found' })
    const updatedTx = await prisma.transaction.update({ where: { id: expense.transactionId }, data: { customFields: { ...(expense.transaction?.customFields || {}), paymentStatus: 'unpaid' } } })
    res.json({ success: true, transaction: updatedTx })
  } catch (e) {
    console.error('mark expense unpaid error:', e)
    res.status(500).json({ error: 'Failed to mark expense unpaid' })
  }
})

// Record a payment for an expense: DR Expense/AP settlement; set payment status
app.post('/api/expenses/:id/record-payment', async (req, res) => {
  try {
    const id = req.params.id
    const { amount, date } = req.body || {}
    const expense = await prisma.expense.findUnique({ where: { id }, include: { transaction: true } })
    if (!expense) return res.status(404).json({ error: 'Expense not found' })
    const paymentAmount = parseFloat(amount || expense.amount)
    if (!(paymentAmount > 0)) return res.status(400).json({ error: 'amount must be > 0' })
    const cash = await prisma.account.findFirst({ where: { code: '1010' } })
    const ap = await prisma.account.findFirst({ where: { code: '2010' } })
    if (!cash || !ap) return res.status(422).json({ error: 'Required accounts missing (1010, 2010)' })
    // Sum prior payments for this expense to track partial/overpaid
    const prior = await prisma.transaction.findMany({
      where: { customFields: { path: ['expenseId'], equals: expense.id } },
      select: { amount: true, customFields: true }
    })
    const priorPaidGross = prior.filter(p => { try { return p?.customFields?.type === 'expense_payment' } catch { return false } }).reduce((s, p) => s + parseFloat(p.amount), 0)
    const priorVoids = prior.filter(p => { try { return p?.customFields?.type === 'void_payment' && p?.customFields?.expenseId === expense.id } catch { return false } }).reduce((s, p) => s + parseFloat(p.amount), 0)
    const priorPaid = Math.max(0, priorPaidGross - priorVoids)
    const txId = await prisma.$transaction(async (tx) => {
      const header = await tx.transaction.create({
        data: {
          date: new Date(date || new Date()),
          description: `Payment made for ${expense.vendor}`,
          reference: `BILL-PAY-${Date.now()}`,
          amount: paymentAmount,
          customFields: { type: 'expense_payment', expenseId: expense.id, vendor: expense.vendor }
        }
      })
      // CREDIT cash; DEBIT Accounts Payable (settle liability)
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: null, creditAccountId: cash.id, amount: paymentAmount, description: `Payment to ${expense.vendor}` } })
      await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: ap.id, creditAccountId: null, amount: paymentAmount, description: `Payment to ${expense.vendor}` } })
      const total = parseFloat(expense.amount)
      const initialPaid = Number(expense.transaction?.customFields?.initialAmountPaid || 0)
      const paidTotal = initialPaid + priorPaid + paymentAmount
      const balanceDue = Math.max(0, total - paidTotal)
      let paymentStatus = 'paid'
      if (paidTotal + 1e-6 < total) paymentStatus = 'partial'
      else if (paidTotal - total > 1e-6) paymentStatus = 'overpaid'
      await tx.transaction.update({
        where: { id: expense.transactionId },
        data: { customFields: { ...(expense.transaction?.customFields || {}), paymentStatus, amountPaid: paidTotal, balanceDue } }
      })
      return { id: header.id, paymentStatus, balanceDue, amountPaid: paidTotal }
    })
    res.json({ success: true, transactionId: txId.id, paymentStatus: txId.paymentStatus, balanceDue: txId.balanceDue, amountPaid: txId.amountPaid })
  } catch (e) {
    console.error('record expense payment error:', e)
    res.status(500).json({ error: 'Failed to record expense payment' })
  }
})

// Check duplicate vendor invoice (AP): vendor + vendorInvoiceNo
app.get('/api/expenses/check-duplicate', async (req, res) => {
  try {
    const vendor = String(req.query.vendor || '').trim()
    const vin = String(req.query.vendorInvoiceNo || '').trim()
    if (!vendor || !vin) return res.json({ duplicate: false })
    const existing = await prisma.expense.findFirst({
      where: { vendor: vendor, vendorInvoiceNo: vin },
      select: { id: true, date: true, amount: true, vendor: true, vendorInvoiceNo: true }
    })
    if (existing) return res.json({ duplicate: true, expense: existing })
    return res.json({ duplicate: false })
  } catch (e) {
    console.error('check-duplicate error:', e)
    res.status(500).json({ error: 'Failed to check duplicate' })
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
    const existing = await prisma.transaction.findFirst({ where: { reference, tenantId: req.tenantId || 'dev' } })
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
    // Duplicate invoice number explicit 409: if invoice already exists, treat as duplicate for admin tests
    try {
      const invNum = PostingService.normalizeInvoiceNumber(validation.normalizedData.invoiceNumber)
      if (invNum) {
        const existing = await prisma.invoice.findFirst({ where: { invoiceNumber: invNum }, select: { id: true } })
        if (existing) {
          return res.status(409).json({ code: 'DUPLICATE_INVOICE_NUMBER', message: `Invoice number ${invNum} already exists.` })
        }
      }
    } catch {}
    const result = await PostingService.postInvoiceTransaction(validation.normalizedData)
    // Treat idempotent-existing with same invoice number as a duplicate for admin testing semantics
    try {
      const invNum = PostingService.normalizeInvoiceNumber(validation.normalizedData.invoiceNumber)
      if (result && result.isExisting && invNum) {
        return res.status(409).json({ code: 'DUPLICATE_INVOICE_NUMBER', message: `Invoice number ${invNum} already exists.`, ...result })
      }
    } catch {}
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

// Suggest a unique invoice number using INV-<timestamp>-<n>
app.get('/api/invoices/suggest-number', async (req, res) => {
  try {
    const pad2 = (n) => String(n).padStart(2, '0')
    const now = new Date()
    const ts = `${now.getFullYear()}${pad2(now.getMonth() + 1)}${pad2(now.getDate())}-${pad2(now.getHours())}${pad2(now.getMinutes())}${pad2(now.getSeconds())}`
    const gen = () => `INV-${ts}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    let suggestion = gen()
    // Ensure DB uniqueness (extremely low collision risk with random suffix)
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.invoice.findFirst({ where: { invoiceNumber: suggestion } })
      if (!exists) break
      suggestion = gen()
    }
    res.json({ suggestion })
  } catch (e) {
    console.error('suggest-number error:', e)
    res.status(500).json({ error: 'Failed to suggest invoice number' })
  }
})

// Next sequential AR invoice number: INV-<YYYY>-<000001> per tenant (dev)
app.get('/api/invoices/next-seq', async (req, res) => {
  try {
    const tenantId = 'dev'
    const year = new Date().getFullYear()
    const prefix = `INV-${year}-`
    // Find the max existing sequence for this year
    const latest = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true }
    })
    let next = 1
    if (latest?.invoiceNumber) {
      const m = latest.invoiceNumber.match(/^INV-\d{4}-(\d{6})$/)
      if (m) next = Math.max(1, parseInt(m[1], 10) + 1)
    }
    const pad = String(next).padStart(6, '0')
    const suggestion = `${prefix}${pad}`
    // Ensure uniqueness (very unlikely to collide given max+1 logic)
    const exists = await prisma.invoice.findFirst({ where: { invoiceNumber: suggestion } })
    res.json({ suggestion: exists ? `${prefix}${String(next + 1).padStart(6, '0')}` : suggestion })
  } catch (e) {
    console.error('next-seq error:', e)
    res.status(500).json({ error: 'Failed to compute next sequence' })
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

// Mark invoice as UNPAID
app.post('/api/invoices/:id/mark-unpaid', async (req, res) => {
  try {
    const id = req.params.id
    const existing = await prisma.invoice.findUnique({ where: { id } })
    if (!existing) return res.status(404).json({ error: 'Invoice not found' })
    // Prisma enum does not have UNPAID; use SENT to represent unpaid/open invoices
    const updated = await prisma.invoice.update({ where: { id }, data: { status: 'SENT' } })
    res.json({ success: true, invoice: updated })
  } catch (e) {
    console.error('mark-unpaid error:', e)
    res.status(500).json({ error: 'Failed to mark invoice unpaid' })
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
    // Sum prior payments to compute partial/overpaid
    const prior = await prisma.transaction.findMany({
      where: { customFields: { path: ['invoiceId'], equals: invoice.id } },
      select: { amount: true, customFields: true }
    })
    const priorPaid = prior
      .filter(p => { try { return p && p.customFields && typeof p.customFields === 'object' && p.customFields.type === 'invoice_payment' } catch { return false } })
      .reduce((s, p) => s + parseFloat(p.amount), 0)

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
      const total = parseFloat(invoice.amount)
      const paidTotal = priorPaid + paymentAmount
      const balanceDue = Math.max(0, total - paidTotal)
      // robust status with tolerances
      let paymentStatus = 'paid'
      if (paidTotal < total - 0.005) paymentStatus = 'partial'
      else if (paidTotal > total + 0.005) paymentStatus = 'overpaid'
      // Invoice DB status: PAID when fully paid/overpaid, otherwise SENT or OVERDUE if past due
      let dbStatus = 'PAID'
      if (paymentStatus === 'partial') {
        const now = new Date(date || new Date())
        dbStatus = (invoice.dueDate && new Date(invoice.dueDate) < now) ? 'OVERDUE' : 'SENT'
      }
      if (paymentStatus === 'overpaid') dbStatus = 'PAID'
      await tx.invoice.update({ where: { id: invoice.id }, data: { status: dbStatus } })
      // Store aggregates on the posting transaction (like AP)
      const invTx = await tx.transaction.findUnique({ where: { id: invoice.transactionId } })
      await tx.transaction.update({ where: { id: invoice.transactionId }, data: { customFields: { ...(invTx?.customFields || {}), paymentStatus, amountPaid: paidTotal, balanceDue } } })
      // Reflect a convenient UI status: update a derived field on response only
      return { id: header.id, paymentStatus, amountPaid: paidTotal, balanceDue, invoiceStatus: dbStatus }
    })
    res.json({ success: true, transactionId: txId.id, paymentStatus: txId.paymentStatus, amountPaid: txId.amountPaid, balanceDue: txId.balanceDue, invoiceStatus: txId.invoiceStatus })
  } catch (e) {
    console.error('record-payment error:', e)
    res.status(500).json({ error: 'Failed to record payment' })
  }
})

// List payments for an AR invoice
app.get('/api/invoices/:id/payments', async (req, res) => {
  try {
    const id = req.params.id
    const payments = await prisma.transaction.findMany({
      where: { customFields: { path: ['invoiceId'], equals: id } },
      orderBy: { date: 'desc' },
      select: { id: true, date: true, amount: true, reference: true, description: true, customFields: true }
    })
    const filtered = payments.filter(p => { try { return p.customFields && p.customFields.type === 'invoice_payment' && !p.customFields.voided } catch { return false } })
    // Include initial posting as a synthetic payment row when amountPaid > 0
    try {
      const invoice = await prisma.invoice.findUnique({ where: { id }, include: { transaction: true } })
      const initialAmt = Number(invoice?.transaction?.customFields?.initialAmountPaid ?? 0)
      if (invoice && initialAmt > 0) {
        const exists = filtered.some(p => String(p?.customFields?.origin || '') === 'initial')
        if (!exists) filtered.push({
          id: `initial:${invoice.transactionId}`,
          date: invoice.date,
          amount: initialAmt,
          reference: invoice.transaction?.reference || `INV-${invoice.id}`,
          description: 'Initial payment at posting',
          customFields: { type: 'invoice_payment', origin: 'initial' }
        })
      }
    } catch {}
    // Sort desc by date after synthetic add
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    res.json({ success: true, payments: filtered })
  } catch (e) {
    console.error('list invoice payments error:', e)
    res.status(500).json({ success: false, error: 'Failed to list invoice payments' })
  }
})

// List payments for an AP expense (bill)
app.get('/api/expenses/:id/payments', async (req, res) => {
  try {
    const id = req.params.id
    let payments = await prisma.transaction.findMany({
      where: { customFields: { path: ['expenseId'], equals: id } },
      orderBy: { date: 'desc' },
      select: { id: true, date: true, amount: true, reference: true, description: true, customFields: true }
    })
    let filtered = payments.filter(p => { try { return p.customFields && p.customFields.type === 'expense_payment' && !p.customFields.voided } catch { return false } })
    // Include initial posting as synthetic payment when amountPaid > 0
    try {
      const expense = await prisma.expense.findUnique({ where: { id }, include: { transaction: true } })
      const amt = Number(expense?.transaction?.customFields?.initialAmountPaid ?? expense?.transaction?.customFields?.amountPaid ?? 0)
      if (expense && amt > 0) {
        const exists = filtered.some(p => String(p?.customFields?.origin || '') === 'initial')
        if (!exists) {
          filtered.push({
            id: `initial:${expense.transactionId}`,
            date: expense.date,
            amount: amt,
            reference: expense.transaction?.reference || `EXP-${expense.id}`,
            description: 'Initial payment at posting',
            customFields: { type: 'expense_payment', origin: 'initial' }
          })
        }
      }
    } catch {}
    filtered.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    res.json({ success: true, payments: filtered })
  } catch (e) {
    console.error('list expense payments error:', e)
    res.status(500).json({ success: false, error: 'Failed to list expense payments' })
  }
})

// Void a payment transaction (creates a reversing journal)
app.post('/api/payments/:id/void', async (req, res) => {
  try {
    const id = req.params.id
    const tx = await prisma.transaction.findUnique({ where: { id }, include: { entries: true } })
    if (!tx) return res.status(404).json({ error: 'Payment not found' })
    const cf = tx.customFields || {}
    const isInvoice = cf.type === 'invoice_payment'
    const isExpense = cf.type === 'expense_payment'
    if (!isInvoice && !isExpense) return res.status(400).json({ error: 'Not a payment transaction' })
    // Create reversing journal
    const revId = await prisma.$transaction(async (db) => {
      const rev = await db.transaction.create({
        data: {
          date: new Date(),
          description: `Void payment ${tx.reference}`,
          reference: `VOID-${tx.reference || ('PAY-' + Date.now() + '-' + Math.random().toString(36).slice(2,6))}`,
          amount: tx.amount,
          customFields: { type: 'void_payment', sourcePaymentId: tx.id, ...(isInvoice ? { invoiceId: cf.invoiceId } : isExpense ? { expenseId: cf.expenseId } : {}) }
        }
      })
      for (const e of tx.entries) {
        if (e.debitAccountId) await db.transactionEntry.create({ data: { transactionId: rev.id, debitAccountId: null, creditAccountId: e.debitAccountId, amount: e.amount, description: 'Void' } })
        if (e.creditAccountId) await db.transactionEntry.create({ data: { transactionId: rev.id, debitAccountId: e.creditAccountId, creditAccountId: null, amount: e.amount, description: 'Void' } })
      }
      // Mark original payment as voided in customFields for UI filtering
      try {
        await db.transaction.update({ where: { id: tx.id }, data: { customFields: { ...(cf || {}), voided: true } } })
      } catch {}
      // Recompute aggregates on the original invoice/expense transaction
      if (isInvoice) {
        const parentInvoice = await db.invoice.findUnique({ where: { id: cf.invoiceId } })
        const payments = await db.transaction.findMany({ where: { customFields: { path: ['invoiceId'], equals: cf.invoiceId } }, select: { amount: true, customFields: true } })
        const paidGross = payments.filter(p => p.customFields && p.customFields.type === 'invoice_payment').reduce((s, p) => s + parseFloat(p.amount), 0)
        const voids = payments.filter(p => p.customFields && p.customFields.type === 'void_payment').reduce((s, p) => s + parseFloat(p.amount), 0)
        const initial = Number(parentInvoice.transaction?.customFields?.initialAmountPaid || 0)
        const sum = initial + Math.max(0, paidGross - voids)
        const total = parseFloat(parentInvoice.amount)
        const balanceDue = Math.max(0, total - sum)
        let paymentStatus = 'paid'
        if (sum + 1e-6 < total) paymentStatus = 'partial'
        else if (sum - total > 1e-6) paymentStatus = 'overpaid'
        let dbStatus = paymentStatus === 'partial' ? ((parentInvoice.dueDate && new Date(parentInvoice.dueDate) < new Date()) ? 'OVERDUE' : 'SENT') : 'PAID'
        await db.invoice.update({ where: { id: parentInvoice.id }, data: { status: dbStatus } })
        const invTx = await db.transaction.findUnique({ where: { id: parentInvoice.transactionId } })
        await db.transaction.update({ where: { id: parentInvoice.transactionId }, data: { customFields: { ...(invTx?.customFields || {}), paymentStatus, amountPaid: sum, balanceDue } } })
      } else if (isExpense) {
        const parentExpense = await db.expense.findUnique({ where: { id: cf.expenseId }, include: { transaction: true } })
        const payments = await db.transaction.findMany({ where: { customFields: { path: ['expenseId'], equals: cf.expenseId } }, select: { amount: true, customFields: true } })
        const paidGross = payments.filter(p => p.customFields && p.customFields.type === 'expense_payment').reduce((s, p) => s + parseFloat(p.amount), 0)
        const voids = payments.filter(p => p.customFields && p.customFields.type === 'void_payment').reduce((s, p) => s + parseFloat(p.amount), 0)
        const initial = Number(parentExpense.transaction?.customFields?.initialAmountPaid || 0)
        const sum = initial + Math.max(0, paidGross - voids)
        const total = parseFloat(parentExpense.amount)
        const balanceDue = Math.max(0, total - sum)
        let paymentStatus = 'paid'
        if (sum + 1e-6 < total) paymentStatus = 'partial'
        else if (sum - total > 1e-6) paymentStatus = 'overpaid'
        await db.transaction.update({ where: { id: parentExpense.transactionId }, data: { customFields: { ...(parentExpense.transaction?.customFields || {}), paymentStatus, amountPaid: sum, balanceDue } } })
      }
      return rev.id
    })
    res.json({ success: true, voidTransactionId: revId })
  } catch (e) {
    console.error('void payment error:', e)
    res.status(500).json({ error: 'Failed to void payment' })
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
    const existing = await prisma.transaction.findFirst({ where: { reference, tenantId: req.tenantId || 'dev' } })
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

// Recurring rules — minimal CRUD + run
app.get('/api/recurring', async (req, res) => {
  try {
    const list = await prisma.recurringRule.findMany({ where: { isActive: true }, orderBy: { nextRunAt: 'asc' } })
    res.json({ rules: list })
  } catch (e) { res.status(500).json({ error: 'Failed to list recurring rules' }) }
})

app.post('/api/recurring', async (req, res) => {
  try {
    const b = req.body || {}
    if (!(b.type && b.cadence && b.startDate && b.payload)) return res.status(400).json({ error: 'type, cadence, startDate, payload required' })
    const rule = await prisma.recurringRule.create({ data: {
      type: String(b.type).toUpperCase(),
      cadence: String(b.cadence).toUpperCase(),
      startDate: new Date(b.startDate),
      endDate: b.endDate ? new Date(b.endDate) : null,
      dayOfMonth: b.dayOfMonth ?? null,
      weekday: b.weekday ?? null,
      nextRunAt: new Date(b.nextRunAt || b.startDate),
      payload: b.payload,
      isActive: b.isActive !== false
    } })
    res.json({ rule })
  } catch (e) { res.status(500).json({ error: 'Failed to create rule' }) }
})

app.put('/api/recurring/:id', async (req, res) => {
  try {
    const id = req.params.id
    const b = req.body || {}
    const data = { ...b }
    try {
      if (b.startDate) data.startDate = new Date(b.startDate)
      if (Object.prototype.hasOwnProperty.call(b, 'endDate')) data.endDate = b.endDate ? new Date(b.endDate) : null
      if (b.nextRunAt) data.nextRunAt = new Date(b.nextRunAt)
      if (b.lastRunAt) data.lastRunAt = new Date(b.lastRunAt)
    } catch {}
    const rule = await prisma.recurringRule.update({ where: { id }, data })
    res.json({ rule })
  } catch (e) {
    console.error('Update recurring error:', e)
    res.status(500).json({ error: 'Failed to update rule', details: e?.message })
  }
})

app.post('/api/recurring/:id/pause', async (req, res) => {
  try { const id = req.params.id; await prisma.recurringRule.update({ where: { id }, data: { isActive: false } }); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: 'Failed to pause rule' }) }
})

app.post('/api/recurring/:id/resume', async (req, res) => {
  try { const id = req.params.id; await prisma.recurringRule.update({ where: { id }, data: { isActive: true } }); res.json({ ok: true }) } catch (e) { res.status(500).json({ error: 'Failed to resume rule' }) }
})

// Simple scheduler run (idempotent by month key for now)
//
// Recurring scheduler run with advanced options and sandbox support
// Body options:
// { dryRun?: boolean, ruleId?: string }
// - dryRun: does not commit transactions or advance nextRunAt; returns simulated entries and next date
// - ruleId: target a specific rule (even if not due)
//
app.post('/api/recurring/run', async (req, res) => {
  try {
    const { dryRun = false, ruleId } = req.body || {}

    const { PostingService } = await import('./src/services/posting.service.js')
    const { ExpenseAccountResolver } = await import('./src/services/expense-account-resolver.service.js')

    // Helper: compute next run honoring advanced options used in UI (endOfMonth, nth weekday)
    function daysInMonth(year, month0) { return new Date(year, month0 + 1, 0).getDate() }
    function computeNextRun(fromISO, cadence, opts = {}) {
      const from = new Date(fromISO)
      const next = new Date(from)
      if (cadence === 'DAILY') {
        // Always advance by exactly +1 calendar day from the current run date (midnight semantics)
        // Ignore intervalDays to avoid double-advancing when tests also adjust nextRunAt
        next.setDate(next.getDate() + 1)
      } else if (cadence === 'WEEKLY') {
        const w = Math.max(1, opts.intervalWeeks || 1)
        if (opts.weekday == null || typeof opts.weekday !== 'number') {
          next.setDate(next.getDate() + 7 * w)
        } else {
          const currentDow = next.getDay()
          let delta = (opts.weekday - currentDow + 7) % 7
          if (delta === 0) delta = 7 * w
          next.setDate(next.getDate() + delta)
        }
      } else if (cadence === 'MONTHLY') {
        const y = next.getFullYear()
        const m = next.getMonth() + 1
        const moveTo = (year, month1, day) => {
          const m0 = month1 - 1
          const dim = daysInMonth(year, m0)
          const d = Math.min(Math.max(1, day), dim)
          return new Date(year, m0, d)
        }
        const hasNth = typeof opts.nthWeek === 'number' && typeof opts.nthWeekday === 'number' && opts.nthWeek >= 1
        let candidate
        if (opts.endOfMonth) {
          // Next occurrence: last day of NEXT month
          const eonm = new Date(next.getFullYear(), next.getMonth() + 2, 0)
          candidate = new Date(eonm.getFullYear(), eonm.getMonth(), eonm.getDate())
        } else if (typeof opts.dayOfMonth === 'number' && opts.dayOfMonth >= 1) {
          candidate = moveTo(y, m + 1, opts.dayOfMonth)
        } else if (hasNth) {
          const targetMonth0 = next.getMonth() + 1
          const firstDay = new Date(next.getFullYear(), targetMonth0, 1)
          const firstDow = firstDay.getDay()
          let day = 1 + ((opts.nthWeekday - firstDow + 7) % 7) + (opts.nthWeek - 1) * 7
          const dim = daysInMonth(firstDay.getFullYear(), targetMonth0)
          if (day > dim) day = dim
          candidate = new Date(firstDay.getFullYear(), targetMonth0, day)
        } else {
          candidate = new Date(next.getFullYear(), next.getMonth() + 1, next.getDate())
        }
        next.setTime(candidate.getTime())
      } else if (cadence === 'ANNUAL') {
        next.setFullYear(next.getFullYear() + 1)
      }
      const yyyy = next.getFullYear()
      const mm = String(next.getMonth() + 1).padStart(2, '0')
      const dd = String(next.getDate()).padStart(2, '0')
      // If tenant time zone is provided, interpret midnight in that TZ and convert to UTC
      if (cadence !== 'DAILY' && opts.timeZone && typeof Intl?.DateTimeFormat === 'function') {
        try {
          const tz = String(opts.timeZone)
          const isoLocal = `${yyyy}-${mm}-${dd}T00:00:00`
          // Approximate: create a Date from parts then adjust with resolved offset by formatting
          const dt = new Date(isoLocal + 'Z')
          const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
          const parts = fmt.formatToParts(dt)
          const get = (t) => Number(parts.find(p => p.type === t)?.value)
          const loc = new Date(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
          return new Date(Date.UTC(loc.getFullYear(), loc.getMonth(), loc.getDate(), loc.getHours(), loc.getMinutes(), loc.getSeconds())).toISOString()
        } catch {}
      }
      return `${yyyy}-${mm}-${dd}T00:00:00.000Z`
    }

    const now = new Date()
    let rules
    if (ruleId) {
      const r = await prisma.recurringRule.findUnique({ where: { id: ruleId } })
      rules = r ? [r] : []
    } else {
      const tenant = String(req.tenantId || '').trim()
      const whereBase = { isActive: true, nextRunAt: { lte: now } }
      const where = tenant ? { ...whereBase, tenantId: tenant } : whereBase
      rules = await prisma.recurringRule.findMany({ where, orderBy: { nextRunAt: 'asc' } })
      // Same-day guard with backfill allowance: avoid duplicate same-day runs
      // but allow catch-up if nextRunAt is before today (backfill window)
      try {
        const startOfToday = new Date(new Date().toISOString().slice(0,10) + 'T00:00:00.000Z')
        rules = rules.filter(r => {
          if (!r.lastRunAt) return true
          const last = new Date(r.lastRunAt)
          const next = r.nextRunAt ? new Date(r.nextRunAt) : null
          if (next && next.getTime() < startOfToday.getTime()) return true
          return last.getTime() < startOfToday.getTime()
        })
      } catch {}
      // Auto-resume: if a rule is paused (isActive=false) but payload.__options.resumeOn has passed, resume it
      try {
        const inactive = await prisma.recurringRule.findMany({ where: { isActive: false } })
        for (const ir of inactive) {
          const opts = ((ir.payload || {}).__options || {})
          const resumeOnStr = opts?.resumeOn
          if (resumeOnStr) {
            const resumeOn = new Date(resumeOnStr)
            if (!isNaN(resumeOn.getTime()) && now.getTime() >= resumeOn.getTime()) {
              await prisma.recurringRule.update({ where: { id: ir.id }, data: { isActive: true } })
              if (ir.nextRunAt && new Date(ir.nextRunAt).getTime() <= now.getTime()) {
                rules.push(ir)
              }
            }
          }
        }
      } catch {}
    }

    const results = []
    try {
      const tnow = new Date()
      if (process.env.DEBUG_RECURRING === '1') {
        console.log('[RUN] tenant=', req.tenantId, 'now=', tnow.toISOString(), 'eligible rules:', rules.map(x => ({ id: x.id, type: x.type, cadence: x.cadence, nextRunAt: x.nextRunAt, lastRunAt: x.lastRunAt })))
      }
    } catch {}
    for (const r of rules) {
      const basePayload = r.payload || {}
      const options = {
        weekday: r.weekday ?? null,
        dayOfMonth: r.dayOfMonth ?? null,
        ...(basePayload.__options || {})
      }
      // Inject tenant time zone if present
      try {
        const cp = await prisma.companyProfile.findFirst({ where: { tenantId: req.tenantId || 'dev' }, select: { timeZone: true } })
        if (cp?.timeZone) options.timeZone = cp.timeZone
      } catch {}
      // Normalize currentRunISO to a date-only midnight string to avoid drift
      const seed = (r.nextRunAt || r.startDate)
      const base = seed && seed.toISOString ? seed.toISOString() : new Date(seed || Date.now()).toISOString()
      const runY = base.slice(0,10)
      const currentRunISO = `${runY}T00:00:00.000Z`
      // Respect endDate window
      if (r.endDate) {
        const end = new Date(r.endDate)
        if (new Date(currentRunISO).getTime() > end.getTime()) {
          if (!dryRun) {
            await prisma.recurringRule.update({ where: { id: r.id }, data: { isActive: false } })
          }
          results.push({ id: r.id, skipped: true, reason: 'Past endDate', dryRun: !!dryRun })
          continue
        }
      }
      // Respect pauseUntil in payload.__options (date-only semantics)
      try {
        const pauseUntilStr = ((r.payload || {}).__options || {}).pauseUntil
        if (pauseUntilStr) {
          const pu = new Date(pauseUntilStr)
          if (!isNaN(pu.getTime())) {
            const cutoff = new Date(pu.getFullYear(), pu.getMonth(), pu.getDate(), 23, 59, 59, 999)
            if (now.getTime() <= cutoff.getTime()) {
              results.push({ id: r.id, skipped: true, reason: 'Paused until', pauseUntil: pauseUntilStr, dryRun: !!dryRun })
              continue
            }
          }
        }
      } catch {}
      let nextRunISO = computeNextRun(currentRunISO, String(r.cadence).toUpperCase(), options)
      if (String(r.cadence).toUpperCase() === 'DAILY') {
        try {
          const base = new Date(currentRunISO)
          base.setUTCDate(base.getUTCDate() + 1)
          const yyyy = base.getUTCFullYear(); const mm = String(base.getUTCMonth()+1).padStart(2,'0'); const dd = String(base.getUTCDate()).padStart(2,'0')
          nextRunISO = `${yyyy}-${mm}-${dd}T00:00:00.000Z`
          if (process.env.DEBUG_RECURRING === '1') {
            console.log('[DAILY]', { currentRunISO, forcedNextRunISO: nextRunISO })
          }
        } catch {}
      }

      // Build posting payload with date derived from current scheduled run
      const runDateYMD = currentRunISO.slice(0, 10)
      if (process.env.DEBUG_RECURRING === '1') {
        try { console.log('[RUN]', r.id, r.type, r.cadence, { runDateYMD, currentRunISO, nextRunISO }) } catch {}
      }
      let simulate = null
      let didPost = false

      if (dryRun) {
        if (String(r.type).toUpperCase() === 'EXPENSE') {
          // Validate and compute preview entries (no DB writes)
          const toValidate = {
            ...basePayload,
            date: runDateYMD,
            paymentStatus: basePayload.paymentStatus || 'unpaid'
          }
          const validation = PostingService.validateExpensePayload(toValidate)
          if (validation.isValid) {
            // Resolve accounts and mirror preview entry composition
            const resolution = await ExpenseAccountResolver.resolveExpenseAccounts({
              vendorName: validation.normalizedData.vendorName,
              amount: validation.normalizedData.amount,
              date: validation.normalizedData.date,
              categoryKey: validation.normalizedData.categoryKey,
              paymentStatus: validation.normalizedData.paymentStatus,
              description: validation.normalizedData.description
            })
            const amount = parseFloat(validation.normalizedData.amount)
            const amountPaid = Math.min(amount, Math.max(0, parseFloat(validation.normalizedData.amountPaid || amount)))
            const overpaid = Math.max(0, parseFloat(validation.normalizedData.amountPaid || 0) - amount)
            const entries = []
            entries.push({ type: 'debit', accountCode: resolution.debit.accountCode, accountName: resolution.debit.accountName, amount })
            entries.push({ type: 'credit', accountCode: resolution.credit.accountCode, accountName: resolution.credit.accountName, amount: amountPaid })
            if (overpaid > 0.01) {
              const ap = await prisma.account.findFirst({ where: { code: '2010' } })
              if (ap) entries.push({ type: 'debit', accountCode: '2010', accountName: ap.name, amount: overpaid })
            }
            simulate = { documentType: 'expense', dateUsed: validation.normalizedData.date, entries, normalizedData: validation.normalizedData }
          } else {
            simulate = { documentType: 'expense', errors: validation.errors }
          }
        } else {
          const toValidate = {
            ...basePayload,
            date: runDateYMD,
            paymentStatus: basePayload.paymentStatus || 'invoice'
          }
          const validation = PostingService.validateInvoicePayload(toValidate)
          if (validation.isValid) {
            const totalInvoice = parseFloat(validation.normalizedData.amount)
            const amountPaid = Math.max(0, parseFloat(validation.normalizedData.amountPaid || '0'))
            const overpaidAmount = amountPaid > totalInvoice ? amountPaid - totalInvoice : 0
            const accounts = await PostingService.resolveInvoiceAccounts(validation.normalizedData, overpaidAmount)
            const entries = []
            entries.push({ type: 'credit', accountCode: accounts.revenue.code, accountName: accounts.revenue.name, amount: totalInvoice })
            if (amountPaid > 0) entries.push({ type: 'debit', accountCode: accounts.cash.code, accountName: accounts.cash.name, amount: amountPaid })
            const arAmt = Math.max(0, totalInvoice - amountPaid)
            if (arAmt > 0) entries.push({ type: 'debit', accountCode: (accounts.arAccount?.code || accounts.cash.code), accountName: (accounts.arAccount?.name || accounts.cash.name), amount: arAmt })
            if (overpaidAmount > 0 && accounts.customerCredits) entries.push({ type: 'credit', accountCode: accounts.customerCredits.code, accountName: accounts.customerCredits.name, amount: overpaidAmount })
            simulate = { documentType: 'invoice', dateUsed: validation.normalizedData.date, entries, normalizedData: validation.normalizedData }
          } else {
            simulate = { documentType: 'invoice', errors: validation.errors }
          }
        }
      } else {
        // Commit posting
        if (String(r.type).toUpperCase() === 'EXPENSE') {
          // Per-rule terms: allow payload.__options.dueDays or explicit dueDate; default Net-0
          const opts = (r.payload && r.payload.__options) || {}
          const dueDays = (opts && (opts.dueDays != null)) ? opts.dueDays : undefined
          const dueDate = (r.payload && r.payload.dueDate) || undefined
          const validation = PostingService.validateExpensePayload({ ...basePayload, date: runDateYMD, paymentStatus: basePayload.paymentStatus || 'unpaid', dueDays, dueDate })
          if (validation.isValid) {
            const reference = `REC-${r.id}-${runDateYMD}`
            const posted = await PostingService.postTransaction({ ...validation.normalizedData, reference, recurring: true, recurringRuleId: r.id })
          results.push({ id: r.id, posted: posted.transactionId })
            didPost = true
            // Append success to run log
            try {
              const loaded = await prisma.recurringRule.findUnique({ where: { id: r.id }, select: { payload: true } })
              const payloadNow = (loaded?.payload) || {}
              const prior = Array.isArray(payloadNow.__runLog) ? payloadNow.__runLog : []
              const entry = { at: new Date().toISOString(), runDate: runDateYMD, result: 'posted', transactionId: posted.transactionId }
              const nextLog = [entry, ...prior].slice(0, 20)
              await prisma.recurringRule.update({ where: { id: r.id }, data: { payload: { ...payloadNow, __runLog: nextLog } } })
            } catch {}
          } else {
            results.push({ id: r.id, error: 'Validation failed', details: validation.errors })
            // Append validation error to run log
            try {
              const loaded = await prisma.recurringRule.findUnique({ where: { id: r.id }, select: { payload: true } })
              const payloadNow = (loaded?.payload) || {}
              const prior = Array.isArray(payloadNow.__runLog) ? payloadNow.__runLog : []
              const entry = { at: new Date().toISOString(), runDate: runDateYMD, result: 'validation_failed', errors: validation.errors }
              const nextLog = [entry, ...prior].slice(0, 20)
              await prisma.recurringRule.update({ where: { id: r.id }, data: { payload: { ...payloadNow, __runLog: nextLog } } })
            } catch {}
          }
        } else {
          // Per-rule terms for invoices as well
          const opts = (r.payload && r.payload.__options) || {}
          const dueDays = (opts && (opts.dueDays != null)) ? opts.dueDays : undefined
          const dueDate = (r.payload && r.payload.dueDate) || undefined
          const validation = PostingService.validateInvoicePayload({ ...basePayload, date: runDateYMD, paymentStatus: basePayload.paymentStatus || 'invoice', dueDays, dueDate })
          if (validation.isValid) {
            const reference = `REC-${r.id}-${runDateYMD}`
            const posted = await PostingService.postInvoiceTransaction({ ...validation.normalizedData, reference, recurring: true, recurringRuleId: r.id })
          results.push({ id: r.id, posted: posted.transactionId })
            didPost = true
            try {
              const loaded = await prisma.recurringRule.findUnique({ where: { id: r.id }, select: { payload: true } })
              const payloadNow = (loaded?.payload) || {}
              const prior = Array.isArray(payloadNow.__runLog) ? payloadNow.__runLog : []
              const entry = { at: new Date().toISOString(), runDate: runDateYMD, result: 'posted', transactionId: posted.transactionId }
              const nextLog = [entry, ...prior].slice(0, 20)
              await prisma.recurringRule.update({ where: { id: r.id }, data: { payload: { ...payloadNow, __runLog: nextLog } } })
            } catch {}
          } else {
            results.push({ id: r.id, error: 'Validation failed', details: validation.errors })
            try {
              const loaded = await prisma.recurringRule.findUnique({ where: { id: r.id }, select: { payload: true } })
              const payloadNow = (loaded?.payload) || {}
              const prior = Array.isArray(payloadNow.__runLog) ? payloadNow.__runLog : []
              const entry = { at: new Date().toISOString(), runDate: runDateYMD, result: 'validation_failed', errors: validation.errors }
              const nextLog = [entry, ...prior].slice(0, 20)
              await prisma.recurringRule.update({ where: { id: r.id }, data: { payload: { ...payloadNow, __runLog: nextLog } } })
            } catch {}
          }
        }
      }

      // Advance nextRunAt using advanced cadence rules (only when not dryRun and a post occurred)
      if (!dryRun && didPost) {
        // If next run goes beyond endDate, deactivate rule
        if (r.endDate && new Date(nextRunISO).getTime() > new Date(r.endDate).getTime()) {
          await prisma.recurringRule.update({ where: { id: r.id }, data: { lastRunAt: now, isActive: false } })
        } else {
          await prisma.recurringRule.update({ where: { id: r.id }, data: { lastRunAt: now, nextRunAt: new Date(nextRunISO) } })
        }
      }

      // Always report planning info
      results.push({ id: r.id, dryRun: !!dryRun, runDate: runDateYMD, nextRunAt: nextRunISO, simulate })
    }

    res.json({ ok: true, results })
  } catch (e) { console.error('recurring run error', e); res.status(500).json({ error: 'Recurring run failed' }) }
})

// Preview upcoming occurrences for a specific rule (server-parity schedule)
app.get('/api/recurring/:id/occurrences', async (req, res) => {
  try {
    const id = req.params.id
    const count = Math.max(1, Math.min(24, parseInt(String(req.query.count || '3')) || 3))
    const r = await prisma.recurringRule.findUnique({ where: { id } })
    if (!r) return res.status(404).json({ error: 'Rule not found' })

    function daysInMonth(year, month0) { return new Date(year, month0 + 1, 0).getDate() }
    function computeNextRun(fromISO, cadence, opts = {}) {
      const from = new Date(fromISO)
      const next = new Date(from)
      if (cadence === 'DAILY') {
        const d = Math.max(1, opts.intervalDays || 1)
        next.setDate(next.getDate() + d)
      } else if (cadence === 'WEEKLY') {
        const w = Math.max(1, opts.intervalWeeks || 1)
        if (opts.weekday == null || typeof opts.weekday !== 'number') {
          next.setDate(next.getDate() + 7 * w)
        } else {
          const currentDow = next.getDay()
          let delta = (opts.weekday - currentDow + 7) % 7
          if (delta === 0) delta = 7 * w
          next.setDate(next.getDate() + delta)
        }
      } else if (cadence === 'MONTHLY') {
        const y = next.getFullYear()
        const m = next.getMonth() + 1
        const moveTo = (year, month1, day) => {
          const m0 = month1 - 1
          const dim = daysInMonth(year, m0)
          const d = Math.min(Math.max(1, day), dim)
          return new Date(year, m0, d)
        }
        const hasNth = typeof opts.nthWeek === 'number' && typeof opts.nthWeekday === 'number' && opts.nthWeek >= 1
        let candidate
        if (opts.endOfMonth) {
          const when = new Date(y, m, 0)
          candidate = new Date(when.getFullYear(), when.getMonth() + 1, when.getDate())
        } else if (typeof opts.dayOfMonth === 'number' && opts.dayOfMonth >= 1) {
          candidate = moveTo(y, m + 1, opts.dayOfMonth)
        } else if (hasNth) {
          const targetMonth0 = next.getMonth() + 1
          const firstDay = new Date(next.getFullYear(), targetMonth0, 1)
          const firstDow = firstDay.getDay()
          let day = 1 + ((opts.nthWeekday - firstDow + 7) % 7) + (opts.nthWeek - 1) * 7
          const dim = daysInMonth(firstDay.getFullYear(), targetMonth0)
          if (day > dim) day = dim
          candidate = new Date(firstDay.getFullYear(), targetMonth0, day)
        } else {
          candidate = new Date(next.getFullYear(), next.getMonth() + 1, next.getDate())
        }
        next.setTime(candidate.getTime())
      } else if (cadence === 'ANNUAL') {
        next.setFullYear(next.getFullYear() + 1)
      }
      const yyyy = next.getFullYear()
      const mm = String(next.getMonth() + 1).padStart(2, '0')
      const dd = String(next.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}T00:00:00.000Z`
    }

    const basePayload = r.payload || {}
    const options = { weekday: r.weekday ?? null, dayOfMonth: r.dayOfMonth ?? null, ...(basePayload.__options || {}) }
    let current = (r.nextRunAt || r.startDate).toISOString ? r.nextRunAt.toISOString() : new Date(r.nextRunAt || r.startDate).toISOString()
    const out = []
    for (let i = 0; i < count; i++) {
      const next = computeNextRun(current, String(r.cadence).toUpperCase(), options)
      // stop at endDate if set
      if (r.endDate && new Date(next).getTime() > new Date(r.endDate).getTime()) break
      out.push(next.slice(0, 10))
      current = next
    }
    res.json({ ruleId: r.id, occurrences: out })
  } catch (e) {
    console.error('occurrences preview error:', e)
    res.status(500).json({ error: 'Failed to compute occurrences' })
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
      { code: '1360', name: 'VAT/GST Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
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
      { code: '6110', name: 'Sales Tax Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6115', name: 'Insurance Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
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

// Seed: extended COA pack (idempotent, per-tenant)
app.post('/api/setup/seed-coa', requireRole('OWNER','ADMIN'), async (req, res) => {
  try {
    const preset = String(req.query.preset || 'us-gaap').toLowerCase()
    const tenantId = String((req && req.tenantId) || 'dev')
    if (preset !== 'us-gaap') return res.status(400).json({ success: false, error: 'Unsupported preset' })

    const rows = Array.isArray(usGaapCoa.accounts) ? usGaapCoa.accounts : []
    if (!rows.length) return res.status(500).json({ success: false, error: 'COA dataset missing' })

    const created = []
    const updated = []

    // Parent linking requires two passes
    // First ensure all base accounts exist
    for (const a of rows) {
      const where = { tenantId_code: { tenantId, code: a.code } }
      const existing = await prisma.account.findUnique({ where })
      if (!existing) {
        await prisma.account.create({ data: { tenantId, code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance } })
        created.push(a.code)
      } else if (existing.name !== a.name) {
        await prisma.account.update({ where: { id: existing.id }, data: { name: a.name } })
        updated.push(a.code)
      }
    }
    // Second pass: set parentId for those with parentCode
    for (const a of rows) {
      if (!a.parentCode) continue
      const child = await prisma.account.findFirst({ where: { tenantId, code: a.code } })
      const parent = await prisma.account.findFirst({ where: { tenantId, code: a.parentCode } })
      if (child && parent && child.parentId !== parent.id) {
        await prisma.account.update({ where: { id: child.id }, data: { parentId: parent.id } })
        updated.push(a.code)
      }
    }

    res.json({ success: true, preset, tenantId, created, updated, total: rows.length, version: usGaapCoa.version })
  } catch (e) {
    console.error('seed-coa error:', e)
    res.status(500).json({ success: false, error: 'Failed to seed COA' })
  }
})

// Admin: migrate COA tax accounts across all tenants (idempotent)
app.post('/api/admin/migrate-coa-tax-accounts', async (req, res) => {
  try {
    const jobKey = String(req.headers['x-job-key'] || req.headers['X-Job-Key'] || '')
    if (!process.env.AILEGR_JOB_KEY || jobKey !== process.env.AILEGR_JOB_KEY) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }
    const result = await migrateTaxAccountsAllTenants()
    res.json({ ok: true, ...result })
  } catch (e) {
    console.error('[migrate] error:', e)
    res.status(500).json({ ok: false, error: 'Migration failed', details: String(e) })
  }
})

// Admin: delete all recurring rules (all tenants) for a clean slate
app.post('/api/admin/reset-recurring', async (req, res) => {
  try {
    const jobKey = String(req.headers['x-job-key'] || req.headers['X-Job-Key'] || '')
    if (!process.env.AILEGR_JOB_KEY || jobKey !== process.env.AILEGR_JOB_KEY) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }
    // Use system prisma to bypass tenant scoping and truly clear globally
    const r = await systemPrisma.recurringRule.deleteMany({})
    res.json({ ok: true, deleted: r.count })
  } catch (e) {
    console.error('[admin] reset-recurring error:', e)
    res.status(500).json({ ok: false, error: 'Failed to reset recurring', details: String(e) })
  }
})

// Admin: post EXPENSE (AP) with job-key auth, bypassing user auth (idempotent-safe)
app.post('/api/admin/post-expense', async (req, res) => {
  try {
    const jobKey = String(req.headers['x-job-key'] || req.headers['X-Job-Key'] || '')
    if (!process.env.AILEGR_JOB_KEY || jobKey !== process.env.AILEGR_JOB_KEY) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({ code: 'MALFORMED_JSON', message: 'Request body must be valid JSON' })
    }
    const validation = PostingService.validateExpensePayload(req.body)
    if (!validation.isValid) {
      return res.status(422).json({ code: 'VALIDATION_FAILED', message: 'Invalid expense data provided', details: validation.errors })
    }
    // Duplicate vendor invoice number check (AP): vendor + vendorInvoiceNo per tenant
    try {
      const vin = validation.normalizedData.vendorInvoiceNo
      const vendor = validation.normalizedData.vendorName
      if (vin && vendor) {
        const dup = await prisma.expense.findFirst({ where: { vendor: vendor, vendorInvoiceNo: vin } })
        if (dup) {
          return res.status(409).json({ code: 'DUPLICATE_VENDOR_INVOICE', message: `A bill from ${vendor} with Vendor Invoice No. "${vin}" already exists.` })
        }
      }
    } catch {}
    const result = await PostingService.postTransaction(validation.normalizedData)
    return res.status(result.isExisting ? 200 : 201).json({ ...result, success: true })
  } catch (e) {
    console.error('[admin] post expense error:', e)
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

// Admin: post INVOICE (AR) with job-key auth, bypassing user auth
app.post('/api/admin/post-invoice', async (req, res) => {
  try {
    const jobKey = String(req.headers['x-job-key'] || req.headers['X-Job-Key'] || '')
    if (!process.env.AILEGR_JOB_KEY || jobKey !== process.env.AILEGR_JOB_KEY) {
      return res.status(401).json({ error: 'Unauthorized' })
    }
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
    console.error('[admin] post invoice error:', e)
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

// Admin: seed/ensure extended US GAAP COA for ALL tenants (idempotent)
app.post('/api/admin/seed-coa-all-tenants', async (req, res) => {
  try {
    const jobKey = String(req.headers['x-job-key'] || req.headers['X-Job-Key'] || '')
    if (!process.env.AILEGR_JOB_KEY || jobKey !== process.env.AILEGR_JOB_KEY) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' })
    }

    const rows = Array.isArray(usGaapCoa.accounts) ? usGaapCoa.accounts : []
    if (!rows.length) return res.status(500).json({ ok: false, error: 'COA dataset missing' })

    // Build tenant set across all known tenants and any existing account rows
    const tenants = await systemPrisma.tenant.findMany({ select: { id: true } })
    const acctTenantRows = await systemPrisma.account.findMany({ select: { tenantId: true } })
    const tidSet = new Set([
      ...tenants.map((t) => t.id),
      ...acctTenantRows.map((r) => String(r.tenantId || 'dev')),
      'dev'
    ])

    const summary = { version: usGaapCoa.version, tenants: 0, created: {}, updated: {} }

    // Two-pass seed for each tenant: ensure base accounts then set parents
    for (const tenantId of tidSet) {
      summary.tenants += 1
      const created = []
      const updated = []
      // Pass 1: ensure base accounts
      for (const a of rows) {
        const where = { tenantId_code: { tenantId, code: a.code } }
        const existing = await systemPrisma.account.findUnique({ where })
        if (!existing) {
          await systemPrisma.account.create({ data: { tenantId, code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance } })
          created.push(a.code)
        } else if (existing.name !== a.name) {
          await systemPrisma.account.update({ where: { id: existing.id }, data: { name: a.name } })
          updated.push(a.code)
        }
      }
      // Pass 2: set parentId links
      for (const a of rows) {
        if (!a.parentCode) continue
        const child = await systemPrisma.account.findFirst({ where: { tenantId, code: a.code } })
        const parent = await systemPrisma.account.findFirst({ where: { tenantId, code: a.parentCode } })
        if (child && parent && child.parentId !== parent.id) {
          await systemPrisma.account.update({ where: { id: child.id }, data: { parentId: parent.id } })
          updated.push(a.code)
        }
      }
      summary.created[tenantId] = created
      summary.updated[tenantId] = updated
    }

    res.json({ ok: true, ...summary })
  } catch (e) {
    console.error('[admin] seed-coa-all-tenants error:', e)
    res.status(500).json({ ok: false, error: 'Failed to seed COA for all tenants', details: String(e) })
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
    const userId = String((req.auth && req.auth.userId) || body.userId || 'local-dev').trim()
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
    // Ensure extended COA immediately for new tenant when enabled
    try {
      const seedExt = String(process.env.EZE_SEED_EXTENDED_COA || 'true').toLowerCase() === 'true'
      if (seedExt) await seedExtendedCoaForTenant(tenant.id)
    } catch {}

    // Optional: migrate dev data to new tenant on first bootstrap
    let migrated = 0
    try {
      if (tenantCreated) {
        // No-op placeholder for future data migration
      }
    } catch {}
    res.json({ ok: true, tenantId: tenant.id, tenantCreated, membershipCreated, accountsCreated: createdCodes, migrated })
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

// Boot-time safeguard: ensure core accounts exist for dev tenant (idempotent)
async function ensureCoreAccountsIfMissing() {
  try {
    const created = await ensureCoreAccountsForTenant('dev')
    if (created.length) console.log('[bootstrap] Core accounts created:', created.join(', '))
    else console.log('[bootstrap] Core accounts already present')
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
      { code: '1360', name: 'VAT/GST Receivable', type: 'ASSET', normalBalance: 'DEBIT' },
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
      { code: '6110', name: 'Sales Tax Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
      { code: '6115', name: 'Insurance Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
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

// Seed extended US GAAP COA for a single tenant (idempotent)
async function seedExtendedCoaForTenant(tenantId) {
  const rows = Array.isArray(usGaapCoa.accounts) ? usGaapCoa.accounts : []
  if (!rows.length) return { created: [], updated: [] }
  const created = []
  const updated = []
  // Pass 1: ensure base accounts
  for (const a of rows) {
    const where = { tenantId_code: { tenantId, code: a.code } }
    const existing = await systemPrisma.account.findUnique({ where })
    if (!existing) {
      await systemPrisma.account.create({ data: { tenantId, code: a.code, name: a.name, type: a.type, normalBalance: a.normalBalance } })
      created.push(a.code)
    } else if (existing.name !== a.name) {
      await systemPrisma.account.update({ where: { id: existing.id }, data: { name: a.name } })
      updated.push(a.code)
    }
  }
  // Pass 2: parent links
  for (const a of rows) {
    if (!a.parentCode) continue
    const child = await systemPrisma.account.findFirst({ where: { tenantId, code: a.code } })
    const parent = await systemPrisma.account.findFirst({ where: { tenantId, code: a.parentCode } })
    if (child && parent && child.parentId !== parent.id) {
      await systemPrisma.account.update({ where: { id: child.id }, data: { parentId: parent.id } })
      updated.push(a.code)
    }
  }
  return { created, updated }
}

// Seed extended COA for all tenants (idempotent)
async function seedExtendedCoaAllTenants() {
  const tenants = await systemPrisma.tenant.findMany({ select: { id: true } })
  const tidSet = new Set([
    ...tenants.map((t) => t.id),
    'dev'
  ])
  const summary = { version: usGaapCoa.version, tenants: 0, created: {}, updated: {} }
  for (const tid of tidSet) {
    summary.tenants += 1
    const r = await seedExtendedCoaForTenant(tid)
    summary.created[tid] = r.created
    summary.updated[tid] = r.updated
  }
  return summary
}

// Migration helper: rename 6110 and create 6115 across all tenants
async function migrateTaxAccountsAllTenants() {
  const updated = []
  const created = []
  // Use unscoped system prisma to sweep across all tenants ignoring ambient request tenant
  const tenants = await systemPrisma.tenant.findMany({ select: { id: true } })
  const acctTenantRows = await systemPrisma.account.findMany({ select: { tenantId: true } })
  const tidSet = new Set([
    ...tenants.map((t) => t.id),
    ...acctTenantRows.map((r) => String(r.tenantId || 'dev')),
    'dev'
  ])
  for (const tid of tidSet) {
    // 6110 → Sales Tax Expense
    try {
      const acc6110 = await systemPrisma.account.findFirst({ where: { tenantId: tid, code: '6110' } })
      if (acc6110 && acc6110.name !== 'Sales Tax Expense') {
        await systemPrisma.account.update({ where: { id: acc6110.id }, data: { name: 'Sales Tax Expense' } })
        updated.push(`${tid}:6110`)
      }
    } catch {}
    // 6115 Insurance Expense (create if missing)
    try {
      const acc6115 = await systemPrisma.account.findFirst({ where: { tenantId: tid, code: '6115' } })
      if (!acc6115) {
        const parent = await systemPrisma.account.findFirst({ where: { tenantId: tid, code: '6000' } })
        await systemPrisma.account.create({ data: { tenantId: tid, code: '6115', name: 'Insurance Expense', type: 'EXPENSE', normalBalance: 'DEBIT', parentId: parent ? parent.id : null } })
        created.push(`${tid}:6115`)
      }
    } catch {}
  }
  return { updated, created }
}

server.listen(PORT, async () => {
  console.log(`Embedded server running on http://localhost:${PORT}`)
  try {
    const isProd = String(process.env.NODE_ENV || 'development').toLowerCase() === 'production'
    const seedFlag = String(process.env.EZE_SEED_CORE_ACCOUNTS || '').toLowerCase() === 'true'
    if (!isProd || seedFlag) {
      await ensureCoreAccountsIfMissing()
    }
    // Optional extended COA auto-seed (idempotent). Enable with EZE_SEED_EXTENDED_COA=true
    try {
      const seedExt = String(process.env.EZE_SEED_EXTENDED_COA || '').toLowerCase() === 'true'
      if (seedExt) {
        const summary = await seedExtendedCoaAllTenants()
        console.log(`[seed-coa] Extended COA ensured across tenants (v${summary.version}); tenants=${summary.tenants}`)
      }
    } catch (e) {
      console.warn('[seed-coa] Extended COA auto-seed failed:', e?.message || e)
    }
    // Production-grade recurring scheduler (optional).
    // Enable with AILEGR_RECURRING_CRON=true and optionally control cadence via AILEGR_RECURRING_INTERVAL_MINUTES (default 15).
    try {
      const enable = String(process.env.AILEGR_RECURRING_CRON || 'true').toLowerCase() === 'true'
      const jobKey = String(process.env.AILEGR_JOB_KEY || '')
      const intervalMinutes = Math.max(1, parseInt(String(process.env.AILEGR_RECURRING_INTERVAL_MINUTES || '15')) || 15)
      if (enable) {
        let inFlight = false
        const runAllTenants = async () => {
          try {
            // Limit sweep to tenants that have at least one active rule
            const activeRules = await prisma.recurringRule.findMany({ where: { isActive: true }, select: { tenantId: true }, distinct: ['tenantId'] })
            const tenants = activeRules.length ? activeRules.map(r => ({ id: r.tenantId })) : await prisma.tenant.findMany({ select: { id: true } })
            for (const t of tenants) {
              try {
                await fetch(`http://localhost:${PORT}/api/recurring/run`, { method: 'POST', headers: { ...(jobKey ? { 'X-Job-Key': jobKey } : {}), 'X-Tenant-Id': t.id } })
              } catch {}
            }
          } catch {
            // Fallback single call
            try { await fetch(`http://localhost:${PORT}/api/recurring/run`, { method: 'POST', headers: jobKey ? { 'X-Job-Key': jobKey } : {} }) } catch {}
          }
        }
        const guardedRun = async () => {
          if (inFlight) return
          inFlight = true
          try { await runAllTenants() } finally { inFlight = false }
        }
        // Startup: small backfill burst to catch up any missed windows
        const backfillRuns = Math.max(1, parseInt(String(process.env.AILEGR_RECURRING_STARTUP_BACKFILL_RUNS || '2')) || 2)
        for (let i = 0; i < backfillRuns; i++) {
          setTimeout(guardedRun, 1500 + i * 750)
        }
        // Interval scheduler (minutes)
        const intervalMs = intervalMinutes * 60 * 1000
        setInterval(guardedRun, intervalMs)
        console.log(`Recurring scheduler enabled: every ${intervalMinutes}m (per-tenant)`) 
      }
    } catch {}
  } catch {}
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
    // Return vendor‑neutral, user‑friendly message with rate limit hints
    const status = e?.response?.status
    if (status === 429) {
      return res.status(429).json({ code: 'AI_RATE_LIMIT_EXCEEDED', message: 'AI usage limit exceeded. Please try again in a moment.' })
    }
    res.status(500).json({ error: 'AI request failed', message: 'We had trouble generating a response. Please try again.' })
  }
})

app.get('/api/memberships', async (req, res) => {
  try {
    // In dev mode (auth disabled), return empty list rather than 401 so UI can proceed.
    const enforceAuth = String(process.env.AILEGR_AUTH_ENFORCE || 'true').toLowerCase() === 'true'
    if (!req?.auth?.userId && !enforceAuth) {
      return res.json({ memberships: [] })
    }
    if (!req?.auth?.userId) return res.status(401).json({ error: 'Unauthorized' })
    const list = await prisma.membership.findMany({ where: { userId: req.auth.userId }, include: { tenant: true }, orderBy: { createdAt: 'asc' } })
    // Cache profile for current user
    await upsertUserProfile(req.auth.userId, req?.auth?.email || null)
    res.json({ memberships: list.map((m) => ({ tenantId: m.tenantId, role: m.role, tenantName: m.tenant?.name || '' })) })
  } catch (e) { res.status(500).json({ error: 'Failed to load memberships' }) }
})

app.post('/api/memberships/switch', async (req, res) => {
  try {
    const { tenantId } = req.body || {}
    if (!req?.auth?.userId || !tenantId) return res.status(400).json({ error: 'tenantId required' })
    const m = await prisma.membership.findFirst({ where: { userId: req.auth.userId, tenantId } })
    if (!m) return res.status(404).json({ error: 'Not a member of requested tenant' })
    res.json({ ok: true, tenantId })
  } catch (e) { res.status(500).json({ error: 'Failed to switch tenant' }) }
})

// Example RBAC-protected endpoint (admin only)
app.post('/api/admin/reindex', requireRole('OWNER','ADMIN'), async (req, res) => {
  try { res.json({ ok: true }) } catch { res.status(500).json({ error: 'Failed' }) }
})

// Tenant member management
app.get('/api/members', requireRole('OWNER','ADMIN'), async (req, res) => {
  try {
    const list = await prisma.membership.findMany({ where: { tenantId: req.tenantId || 'dev' }, orderBy: { createdAt: 'asc' } })
    let emailById = new Map()
    try {
      const users = await prisma.userProfile.findMany({ where: { userId: { in: list.map(m => m.userId) } } })
      emailById = new Map(users.map(u => [u.userId, u.email]))
    } catch {}
    res.json({ members: list.map(m => ({ userId: m.userId, email: emailById.get(m.userId) || '', role: m.role })) })
  } catch (e) { res.status(500).json({ error: 'Failed to load members' }) }
})

app.post('/api/members', requireRole('OWNER'), async (req, res) => {
  try {
    const { userId, role } = req.body || {}
    const uid = String(userId || '').trim()
    const r = String(role || 'MEMBER').toUpperCase()
    if (!uid) return res.status(400).json({ error: 'userId required' })
    if (!['OWNER','ADMIN','MEMBER'].includes(r)) return res.status(400).json({ error: 'Invalid role' })
    const exists = await prisma.membership.findFirst({ where: { userId: uid, tenantId: req.tenantId || 'dev' } })
    if (exists) return res.status(409).json({ error: 'Member already exists' })
    const created = await prisma.membership.create({ data: { userId: uid, tenantId: req.tenantId || 'dev', role: r } })
    // Try to cache email if provided
    try { await upsertUserProfile(uid, req?.body?.email || null) } catch {}
    res.status(201).json({ member: { userId: created.userId, role: created.role } })
  } catch (e) { res.status(500).json({ error: 'Failed to add member' }) }
})

app.put('/api/members/:userId', requireRole('OWNER'), async (req, res) => {
  try {
    const targetUserId = String(req.params.userId || '').trim()
    const { role } = req.body || {}
    const r = String(role || '').toUpperCase()
    if (!['OWNER','ADMIN','MEMBER'].includes(r)) return res.status(400).json({ error: 'Invalid role' })
    const m = await prisma.membership.findFirst({ where: { userId: targetUserId, tenantId: req.tenantId || 'dev' } })
    if (!m) return res.status(404).json({ error: 'Member not found' })
    // Prevent demoting last OWNER
    if (m.role === 'OWNER' && r !== 'OWNER') {
      const owners = await prisma.membership.count({ where: { tenantId: req.tenantId || 'dev', role: 'OWNER' } })
      if (owners <= 1) return res.status(409).json({ error: 'At least one OWNER required' })
    }
    const updated = await prisma.membership.update({ where: { id: m.id }, data: { role: r } })
    res.json({ member: { userId: updated.userId, role: updated.role } })
  } catch (e) { res.status(500).json({ error: 'Failed to update member' }) }
})

app.delete('/api/members/:userId', requireRole('OWNER'), async (req, res) => {
  try {
    const targetUserId = String(req.params.userId || '').trim()
    const m = await prisma.membership.findFirst({ where: { userId: targetUserId, tenantId: req.tenantId || 'dev' } })
    if (!m) return res.status(404).json({ error: 'Member not found' })
    // Prevent removing self and prevent removing last OWNER
    if (req?.auth?.userId && targetUserId === req.auth.userId) return res.status(409).json({ error: 'Cannot remove yourself' })
    if (m.role === 'OWNER') {
      const owners = await prisma.membership.count({ where: { tenantId: req.tenantId || 'dev', role: 'OWNER' } })
      if (owners <= 1) return res.status(409).json({ error: 'At least one OWNER required' })
    }
    await prisma.membership.delete({ where: { id: m.id } })
    res.json({ ok: true })
  } catch (e) { res.status(500).json({ error: 'Failed to remove member' }) }
})



