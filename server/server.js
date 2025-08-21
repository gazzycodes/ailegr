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

// Company Profile endpoints
function normalizeName(name) {
  if (!name) return ''
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\b(inc|llc|corp|co|ltd|the|company|companies)\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

app.get('/api/company-profile', async (req, res) => {
  try {
    const profile = await prisma.companyProfile.findFirst({ where: { workspaceId: 'default' } })
    if (!profile) {
      const def = await prisma.companyProfile.create({ data: {
        workspaceId: 'default',
        legalName: 'AILegr Solutions Inc',
        aliases: ['AILegr', 'AILegr Inc', 'AILegr Solutions'],
        ein: null,
        taxId: null,
        addressLines: [],
        city: null,
        state: null,
        zipCode: null,
        country: 'US',
        normalizedLegalName: normalizeName('AILegr Solutions Inc'),
        normalizedAliases: ['AILegr', 'AILegr Inc', 'AILegr Solutions'].map(normalizeName)
      } })
      return res.json(def)
    }
    res.json(profile)
  } catch (e) {
    console.error('company-profile get error:', e)
    res.status(500).json({ success: false, error: 'PROFILE_FETCH_FAILED', message: 'Failed to fetch company profile' })
  }
})

app.put('/api/company-profile', async (req, res) => {
  try {
    const { legalName, aliases = [], ein, taxId, addressLines = [], city, state, zipCode, country = 'US' } = req.body || {}
    if (!legalName || !legalName.trim()) return res.status(400).json({ success: false, error: 'VALIDATION_ERROR', message: 'Legal name is required' })
    const normalized = {
      legalName: legalName.trim(),
      aliases: Array.isArray(aliases) ? aliases.filter(a => a && a.trim()) : [],
      ein: ein?.trim() || null,
      taxId: taxId?.trim() || null,
      addressLines: Array.isArray(addressLines) ? addressLines.filter(a => a && a.trim()) : [],
      city: city?.trim() || null,
      state: state?.trim() || null,
      zipCode: zipCode?.trim() || null,
      country: country || 'US',
      normalizedLegalName: normalizeName(legalName),
      normalizedAliases: (Array.isArray(aliases) ? aliases.filter(a => a && a.trim()) : []).map(normalizeName)
    }
    const existing = await prisma.companyProfile.findFirst({ where: { workspaceId: 'default' } })
    const profile = existing
      ? await prisma.companyProfile.update({ where: { id: existing.id }, data: normalized })
      : await prisma.companyProfile.create({ data: { workspaceId: 'default', ...normalized } })
    res.json({ success: true, message: 'Company profile updated successfully', profile })
  } catch (e) {
    console.error('company-profile put error:', e)
    res.status(500).json({ success: false, error: 'PROFILE_UPDATE_FAILED', message: 'Failed to update company profile' })
  }
})

// Dashboard
app.get('/api/dashboard', async (req, res) => {
  try {
    const dashboardData = await ReportingService.getDashboard()
    let aiInsights = []
    try {
      if (process.env.GEMINI_API_KEY) {
        const m = dashboardData.metrics
        const prompt = `Provide 3 concise financial insights for a small business dashboard based on:
Total Revenue: $${m.totalRevenue.toFixed(2)}
Total Expenses: $${m.totalExpenses.toFixed(2)}
Net Profit: $${m.netProfit.toFixed(2)}
Assets: $${m.totalAssets.toFixed(2)}
Liabilities: $${m.totalLiabilities.toFixed(2)}
Equity: $${m.totalEquity.toFixed(2)}

Return JSON array of objects: [{"id":"string","category":"Revenue|Expense|Profit","message":"short actionable tip","urgency":"low|medium|high","icon":"TrendingUp|AlertTriangle|Check"}]`
        const text = await AICategoryService.callGeminiAPI(prompt)
        const parsed = JSON.parse(text)
        if (Array.isArray(parsed)) aiInsights = parsed.slice(0, 3)
      }
    } catch {}
    // If AI not configured or fails, return no insights (no mock data)
    res.json({
      metrics: dashboardData.metrics,
      series: dashboardData.series,
      aiInsights,
      healthChecks: dashboardData.healthChecks
    })
  } catch (error) {
    console.error('Dashboard error:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard data', details: error.message })
  }
})

// Recent transactions (latest 5)
app.get('/api/transactions/recent', async (req, res) => {
  try {
    const limit = Math.max(1, Math.min(20, parseInt(req.query.limit) || 5))
    const txs = await prisma.transaction.findMany({
      include: {
        entries: {
          include: { debitAccount: true, creditAccount: true },
        }
      },
      orderBy: { date: 'desc' },
      take: limit
    })
    const items = txs.map(t => {
      const total = parseFloat(t.amount)
      // Infer type for display
      let type = 'other'
      const hasRevenueCredit = t.entries.some(e => e.creditAccount?.type === 'REVENUE')
      const hasExpenseDebit = t.entries.some(e => e.debitAccount?.type === 'EXPENSE')
      if (hasRevenueCredit) type = 'revenue'
      else if (hasExpenseDebit) type = 'expense'
      const description = t.description || (type === 'revenue' ? 'Revenue' : type === 'expense' ? 'Expense' : 'Transaction')
      const category = type === 'revenue' ? 'Revenue' : type === 'expense' ? 'Expense' : 'General'
      const amount = type === 'revenue' ? Math.abs(total) : type === 'expense' ? -Math.abs(total) : total
      return { id: t.id, date: t.date, description, category, type, amount }
    })
    res.json({ items })
  } catch (e) {
    console.error('recent transactions error:', e)
    res.status(500).json({ error: 'Failed to fetch recent transactions' })
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
    const account = await prisma.account.findUnique({ where: { code } })
    if (!account) return res.status(404).json({ error: 'Account not found' })
    const data = {}
    if (typeof name === 'string' && name.trim()) data.name = name.trim()
    if (typeof type === 'string' && ['ASSET','LIABILITY','EQUITY','REVENUE','EXPENSE'].includes(type)) data.type = type
    const updated = await prisma.account.update({ where: { code }, data })
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
    const account = await prisma.account.findUnique({ where: { code } })
    if (!account) return res.status(404).json({ error: 'Account not found' })

    // Prevent deletion of core accounts used by setup helpers
    const coreCodes = new Set(['1010','1200','1350','3000','3200','4020','4010','4910','2050','2150','2010','5010','6020','6030','6040','6060','6110'])
    if (coreCodes.has(code)) return res.status(422).json({ error: 'Cannot delete core system account' })

    const usageCount = await prisma.transactionEntry.count({
      where: { OR: [{ debitAccountId: account.id }, { creditAccountId: account.id }] }
    })
    if (usageCount > 0) return res.status(409).json({ error: 'Account has transactions and cannot be deleted' })

    await prisma.account.delete({ where: { code } })
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

    const account = await prisma.account.findUnique({
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

// OCR endpoint (extended formats)
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
    const isXlsx = mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mimetype === 'application/vnd.ms-excel' || lowerName.endsWith('.xlsx') || lowerName.endsWith('.xls')
    const isXml = mimetype === 'application/xml' || mimetype === 'text/xml' || lowerName.endsWith('.xml')
    const isQif = lowerName.endsWith('.qif')
    const isOfx = lowerName.endsWith('.ofx') || lowerName.endsWith('.ofc')

    if (isPdf) {
      const mod = await import('pdf-parse/lib/pdf-parse.js')
      const pdfParse = (mod && (mod.default || mod))
      const data = await pdfParse(fs.readFileSync(filePath))
      extractedText = data.text || ''
    } else if (isXlsx) {
      const xlsxMod = await import('xlsx')
      const xlsx = (xlsxMod && (xlsxMod.default || xlsxMod))
      const wb = xlsx.readFile(filePath)
      const sheets = Object.keys(wb.Sheets)
      extractedText = sheets.map((name) => {
        const ws = wb.Sheets[name]
        const csv = xlsx.utils.sheet_to_csv(ws)
        return `=== SHEET: ${name} ===\n${csv}`
      }).join('\n\n')
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
      // Try encoding detection for TXT/CSV
      try {
        const chardetMod = await import('chardet')
        const iconvMod = await import('iconv-lite')
        const chardet = (chardetMod && (chardetMod.default || chardetMod))
        const iconv = (iconvMod && (iconvMod.default || iconvMod))
        const buffer = fs.readFileSync(filePath)
        const enc = chardet.detect(buffer) || 'utf8'
        extractedText = iconv.decode(buffer, enc)
      } catch {
      extractedText = fs.readFileSync(filePath, 'utf8')
      }
    } else if (isDoc) {
      // Legacy .doc not supported reliably without native deps; advise conversion
      return res.status(415).json({ error: 'Unsupported file type .doc. Please upload PDF, DOCX, PNG, JPG, or CSV.' })
    } else if (isXml) {
      try {
        const xml2jsMod = await import('xml2js')
        const xml2js = (xml2jsMod && (xml2jsMod.default || xml2jsMod))
        const parser = new xml2js.Parser()
        const xmlContent = fs.readFileSync(filePath, 'utf8')
        const result = await parser.parseStringPromise(xmlContent)
        extractedText = `XML FILE: ${originalname}\n${JSON.stringify(result, null, 2)}`
      } catch {
        extractedText = fs.readFileSync(filePath, 'utf8')
      }
    } else if (isQif || isOfx) {
      extractedText = fs.readFileSync(filePath, 'utf8')
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

// Normalization-only endpoint for client-provided OCR text
app.post('/api/ocr/normalize', async (req, res) => {
  try {
    const raw = (req.body && req.body.text) || ''
    if (!raw || typeof raw !== 'string') {
      return res.status(400).json({ success: false, error: 'MISSING_TEXT', message: 'Provide text in body.text' })
    }

    const cleanedText = raw.trim()
    const lines = cleanedText.split(/\r?\n/)

    const number = '([0-9]+(?:[, .\']*[0-9]{3})*(?:[.,][0-9]{1,2})?)'
    const parseNum = (s) => {
      if (!s) return null
      let n = s
      if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '')
      else if (n.includes(' ')) n = n.replace(/\s/g, '').replace(',', '.')
      else if (n.includes(',') && !n.includes('.')) {
        const parts = n.split(',')
        n = parts[parts.length - 1].length <= 2 ? n.replace(',', '.') : n.replace(/,/g, '')
      }
      const v = parseFloat(n)
      return Number.isFinite(v) ? parseFloat(v.toFixed(2)) : null
    }
    const matchOne = (rx) => {
      const m = cleanedText.match(rx)
      return m ? parseNum(m[1]) : null
    }

    const subtotal = matchOne(new RegExp(`subtotal[:\s]*\\$?\s*${number}`, 'i'))
    const taxAmount = matchOne(new RegExp(`tax(?:\s*\([^)]+\))?[:\s]*\\$?\s*${number}`, 'i'))
    const total = matchOne(new RegExp(`total[:\s]*\\$?\s*${number}`, 'i'))
    const amountPaid = matchOne(new RegExp(`amount\s*paid[:\s]*\\$?\s*${number}`, 'i'))
    const balMatch = cleanedText.match(new RegExp(`balance\s*due[:\s]*\\$?\s*${number}`, 'i'))
    const balanceDue = balMatch ? parseNum(balMatch[1]) * (balMatch[0].includes('-') ? -1 : 1) : null

    const labelAfter = (labelRx) => {
      const idx = lines.findIndex(l => labelRx.test(l))
      if (idx >= 0) {
        for (let i = idx + 1; i < Math.min(lines.length, idx + 4); i++) {
          const c = (lines[i] || '').trim()
          if (c) return c
        }
      }
      return ''
    }

    const invoiceNum = (cleanedText.match(/invoice\s*#?[:\s]*([A-Z0-9\-]+)/i) || [])[1] || null
    const invoiceDate = (cleanedText.match(/invoice\s*date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) || [])[1] || null
    const dueDate = (cleanedText.match(/due\s*date[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i) || [])[1] || null

    // Identity via company profile
    let ourRole = 'unknown', docType = 'unknown', confidence = 0
    try {
      const profile = await prisma.companyProfile.findFirst({ where: { workspaceId: 'default' } })
      if (profile && profile.legalName) {
        const normalize = (s) => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
        const ourNorms = [profile.legalName, ...(Array.isArray(profile.normalizedAliases) ? profile.normalizedAliases : [])].map(normalize).filter(Boolean)
        const textNorm = normalize(cleanedText)
        const fromRaw = labelAfter(/^(from|vendor|sold\s*by|remit\s*to)\b/i)
        const billToRaw = labelAfter(/bill\s*to/i)
        const billToNorm = normalize(billToRaw)
        const fromNorm = normalize(fromRaw)
        const nameInHeader = ourNorms.some(n => n && textNorm.includes(n))
        const billToIsUs = ourNorms.some(n => n && n === billToNorm)
        const fromIsUs = ourNorms.some(n => n && n === fromNorm)

        if ((fromIsUs || nameInHeader) && billToNorm && !billToIsUs) { ourRole = 'sender'; docType = 'invoice'; confidence = 0.85 }
        else if (billToIsUs && (!fromIsUs || fromNorm)) { ourRole = 'recipient'; docType = 'expense'; confidence = 0.85 }
        else {
          if (textNorm.includes('invoice') || textNorm.includes('bill to')) { docType = billToIsUs ? 'expense' : 'invoice'; ourRole = billToIsUs ? 'recipient' : 'sender'; confidence = 0.5 }
          else { docType = 'unknown'; ourRole = 'unknown'; confidence = 0.2 }
        }
      }
    } catch {}

    const structured = {
      source: 'normalizer-v1',
      labels: { invoiceNumber: invoiceNum, invoiceDate, dueDate },
      amounts: { subtotal, taxAmount, total, amountPaid, balanceDue },
      ourRole, docType, confidence
    }
    return res.json({ success: true, structured })
  } catch (err) {
    console.error('Normalization error:', err)
    return res.status(500).json({ success: false, error: 'NORMALIZATION_FAILED', message: err.message })
  }
})

// Document classification endpoint
app.post('/api/documents/classify', async (req, res) => {
  try {
    const body = req.body || {}
    const structured = body.structured || null
    const text = (body.ocrText || body.description || body.notes || '').toString()
    if (!text && !structured) {
      return res.status(400).json({ success: false, error: 'NO_TEXT', message: 'Provide ocrText or structured' })
    }

    let docType = 'unknown', ourRole = 'unknown', reasons = []
    if (structured?.docType) { docType = structured.docType; ourRole = structured.ourRole || 'unknown'; reasons.push('from_structured') }
    else if (/invoice|bill\s*to/i.test(text)) { docType = 'invoice'; reasons.push('keyword_invoice') }
    else { docType = 'expense'; reasons.push('fallback_expense') }

    // Policy based on amounts
    let policy = 'ACCRUAL'
    try {
      const amt = structured?.amounts || {}
      const total = Number.isFinite(amt.total) ? amt.total : null
      const paid = Number.isFinite(amt.amountPaid) ? amt.amountPaid : null
      const balance = Number.isFinite(amt.balanceDue) ? amt.balanceDue : null
      const nearZero = (v) => v !== null && Math.abs(v) <= 0.01
      if ((paid !== null && paid > 0) && (balance === null || nearZero(balance))) policy = 'CASH_ONLY'
      else if ((paid !== null && paid > 0) && (balance !== null && balance > 0.01)) policy = 'ACCRUAL+PAYMENT'
      else policy = 'ACCRUAL'
    } catch {}

    const confidence = structured?.confidence || (docType === 'unknown' ? 0.2 : 0.6)
    return res.json({ success: true, docType, ourRole, policy, confidence, reasons })
  } catch (err) {
    console.error('documents/classify error:', err)
    return res.status(500).json({ success: false, error: 'CLASSIFY_FAILED', message: err.message })
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
    const acc = await prisma.account.findUnique({ where: { code: accountCode } })
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
      const acc = await prisma.account.findUnique({ where: { code: accountCode } })
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
    const exists = await prisma.account.findUnique({ where: { code } })
    if (exists) return res.status(409).json({ error: 'Account code already exists' })
    let parentId = null
    if (parentCode) {
      const parent = await prisma.account.findUnique({ where: { code: parentCode } })
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
// Create recurring expense schedule
app.post('/api/expenses/recurring', async (req, res) => {
  try {
    const b = req.body || {}
    const amount = parseFloat(b.amount || 0)
    if (!(b.vendor && amount > 0 && b.startDate && b.frequency)) {
      return res.status(400).json({ success: false, error: 'vendor, amount, startDate, frequency required' })
    }
    const schedule = await prisma.recurringSchedule.create({
      data: {
        type: 'expense',
        vendor: b.vendor.trim(),
        amount,
        categoryKey: b.categoryKey || null,
        description: b.description || null,
        startDate: new Date(b.startDate),
        endDate: b.endDate ? new Date(b.endDate) : null,
        frequency: String(b.frequency).toLowerCase(),
        dayOfMonth: b.dayOfMonth || null,
        dayOfWeek: b.dayOfWeek || null,
        nextRunDate: new Date(b.startDate),
        isActive: true,
        customFields: b.customFields || null
      }
    })
    res.status(201).json({ success: true, schedule })
  } catch (e) {
    console.error('create recurring schedule error:', e)
    res.status(500).json({ success: false, error: 'Failed to create recurring schedule' })
  }
})

function addPeriod(date, frequency) {
  const d = new Date(date)
  switch (String(frequency).toLowerCase()) {
    case 'daily': d.setDate(d.getDate() + 1); break
    case 'weekly': d.setDate(d.getDate() + 7); break
    case 'monthly': d.setMonth(d.getMonth() + 1); break
    case 'quarterly': d.setMonth(d.getMonth() + 3); break
    case 'yearly': d.setFullYear(d.getFullYear() + 1); break
    default: d.setMonth(d.getMonth() + 1)
  }
  return d
}

// Process due recurring schedules (expense only for now)
app.post('/api/admin/process-recurring', async (req, res) => {
  try {
    const now = req.body?.asOf ? new Date(req.body.asOf) : new Date()
    const due = await prisma.recurringSchedule.findMany({
      where: {
        isActive: true,
        type: 'expense',
        nextRunDate: { lte: now },
        OR: [ { endDate: null }, { endDate: { gte: now } } ]
      }
    })
    const results = []
    for (const s of due) {
      const payload = {
        vendorName: s.vendor || 'Recurring Vendor',
        amount: s.amount.toString(),
        date: s.nextRunDate.toISOString().slice(0,10),
        categoryKey: s.categoryKey || null,
        paymentStatus: 'unpaid',
        description: s.description || 'Recurring expense',
        reference: `RECUR-${s.id}-${s.nextRunDate.getTime()}`
      }
      try {
        const validation = PostingService.validateExpensePayload(payload)
        if (!validation.isValid) throw new Error('Validation failed: ' + validation.errors.join(', '))
        const post = await PostingService.postTransaction(validation.normalizedData)
        const next = addPeriod(s.nextRunDate, s.frequency)
        await prisma.recurringSchedule.update({ where: { id: s.id }, data: { lastRunDate: s.nextRunDate, nextRunDate: next } })
        results.push({ id: s.id, status: 'POSTED', transactionId: post.transactionId })
      } catch (err) {
        results.push({ id: s.id, status: 'FAILED', error: String(err.message || err) })
      }
    }
    res.json({ success: true, processed: results.length, results })
  } catch (e) {
    console.error('process recurring error:', e)
    res.status(500).json({ success: false, error: 'Failed to process recurring schedules' })
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
    const looksLikeInvoice = text.includes('invoice') || text.includes('bill to:') || text.includes('payment terms') || req.body.customerName

    if (looksLikeInvoice) {
      const totalInvoice = parseFloat(req.body.amount || 0)
      let amountPaid = (req.body.amountPaid === undefined || req.body.amountPaid === null) ? 0 : parseFloat(req.body.amountPaid)
      const paymentStatus = (req.body.paymentStatus || 'unpaid').toLowerCase()
      let balanceDue = isFinite(parseFloat(req.body.balanceDue)) ? parseFloat(req.body.balanceDue) : (totalInvoice - amountPaid)
      let overpaidAmount = amountPaid > totalInvoice ? amountPaid - totalInvoice : 0

      const cash = await prisma.account.findUnique({ where: { code: '1010' } })
      const ar = await prisma.account.findUnique({ where: { code: '1200' } })
      const taxPayable = await prisma.account.findUnique({ where: { code: '2150' } })
      const salesDiscounts = await prisma.account.findUnique({ where: { code: '4910' } })
      const unearned = await prisma.account.findUnique({ where: { code: '2400' } })
      const creditsLiab = overpaidAmount > 0 ? await prisma.account.findUnique({ where: { code: '2050' } }) : null
      if (!cash || !ar || !taxPayable || !salesDiscounts) return res.status(422).json({ error: 'Required accounts not found (1010,1200,2150,4910)' })

      // Calculate discount and tax similar to PostingService
      let discountAmount = 0
      if (req.body.discount && req.body.discount.enabled) {
        discountAmount = parseFloat(req.body.discount.amount || req.body.discount.value || 0)
      }
      let taxAmount = 0
      const providedSubtotal = parseFloat(req.body.subtotal || '0')
      if (req.body.taxSettings && req.body.taxSettings.enabled) {
        if (req.body.taxSettings.type === 'percentage' && req.body.taxSettings.rate) {
          const base = providedSubtotal > 0
            ? (providedSubtotal - discountAmount)
            : ((totalInvoice + discountAmount) / (1 + (parseFloat(req.body.taxSettings.rate) / 100)))
          taxAmount = base * (parseFloat(req.body.taxSettings.rate) / 100)
        } else {
          taxAmount = parseFloat(req.body.taxSettings.amount || 0)
        }
      }
      let subtotalAmount
      if (providedSubtotal > 0) {
        subtotalAmount = providedSubtotal
        if (req.body.taxSettings && req.body.taxSettings.enabled && req.body.taxSettings.type === 'percentage' && req.body.taxSettings.rate) {
          taxAmount = (subtotalAmount - discountAmount) * (parseFloat(req.body.taxSettings.rate) / 100)
        }
      } else {
        if (req.body.taxSettings && req.body.taxSettings.enabled && req.body.taxSettings.type === 'percentage' && req.body.taxSettings.rate) {
          const rate = parseFloat(req.body.taxSettings.rate) / 100
          subtotalAmount = (totalInvoice + discountAmount) / (1 + rate)
          taxAmount = subtotalAmount * rate
        } else {
          subtotalAmount = totalInvoice - taxAmount - discountAmount
        }
      }
      const computedTotal = subtotalAmount + taxAmount - discountAmount
      if (Math.abs(computedTotal - totalInvoice) > 0.01) {
        taxAmount = Math.max(0, totalInvoice - subtotalAmount + discountAmount)
      }

      // Fallback parsing from OCR text if tax/paid not provided
      try {
        const ocrText = (req.body.ocrText || '').toString()
        const findNumber = (rx) => {
          const m = ocrText.match(rx)
          if (!m) return null
          const raw = (m[1] || m[0]).match(/-?[0-9][0-9,\.]+/)
          if (!raw) return null
          let n = raw[0]
          if (n.includes(',') && n.includes('.')) n = n.replace(/,/g, '')
          else if (n.includes(' ') ) n = n.replace(/\s/g, '').replace(',', '.')
          else if (n.includes(',') && !n.includes('.')) { const parts = n.split(','); n = parts[parts.length-1].length <= 2 ? n.replace(',', '.') : n.replace(/,/g, '') }
          const v = parseFloat(n)
          return Number.isFinite(v) ? v : null
        }
        if (taxAmount === 0) {
          const t = findNumber(/tax[^\n]*\$?\s*([-0-9,\.]+)/i)
          if (t !== null && t > 0) {
            taxAmount = t
            subtotalAmount = Math.max(0, totalInvoice - taxAmount - discountAmount)
          }
        }
        const paidParsed = findNumber(/amount\s*paid\s*\$?\s*([-0-9,\.]+)/i)
        if (paidParsed !== null && Math.abs(paidParsed - amountPaid) > 0.005) {
          amountPaid = paidParsed
        }
        const balParsed = findNumber(/balance\s*due\s*\$?\s*([-0-9,\.]+)/i)
        if (balParsed !== null) {
          balanceDue = balParsed
        }
        overpaidAmount = amountPaid > totalInvoice ? amountPaid - totalInvoice : 0
      } catch {}

      const entries = []
      const customerName = req.body.customerName || 'Customer'

      // Revenue credits (line items or single line; handle prepaid into 2400)
      if (Array.isArray(req.body.lineItems) && req.body.lineItems.length > 0) {
        for (const li of req.body.lineItems) {
          const lineAmt = parseFloat(li.amount || 0)
          const revCode = PostingService.mapLineItemToRevenueAccount(li)
          const revAcc = await prisma.account.findUnique({ where: { code: revCode } })
          if (revAcc && lineAmt > 0) entries.push({ type: 'credit', accountCode: revAcc.code, accountName: revAcc.name, amount: lineAmt, description: `${li.description || 'Line'} - ${customerName}` })
        }
      } else {
        const revCode = paymentStatus === 'prepaid' ? '2400' : PostingService.mapCategoryToRevenueAccount(req.body.categoryKey || 'OFFICE_SUPPLIES')
        const revAcc = await prisma.account.findUnique({ where: { code: revCode } })
        if (!revAcc) return res.status(422).json({ error: `Revenue account ${revCode} not found` })
        entries.push({ type: 'credit', accountCode: revAcc.code, accountName: revAcc.name, amount: subtotalAmount, description: paymentStatus === 'prepaid' ? `Unearned revenue - ${customerName} (prepaid)` : `Revenue from ${customerName}` })
      }

      if (taxAmount > 0 && taxPayable) entries.push({ type: 'credit', accountCode: '2150', accountName: taxPayable.name, amount: taxAmount, description: `Sales Tax - ${customerName}` })
      if (discountAmount > 0 && salesDiscounts) entries.push({ type: 'debit', accountCode: '4910', accountName: salesDiscounts.name, amount: discountAmount, description: `Sales Discount - ${customerName}` })

      if (paymentStatus === 'paid' || paymentStatus === 'overpaid' || paymentStatus === 'prepaid') {
        if (amountPaid > 0) entries.push({ type: 'debit', accountCode: '1010', accountName: cash.name, amount: amountPaid, description: paymentStatus === 'prepaid' ? `Advance payment from ${customerName}` : `Cash received from ${customerName}` })
      } else if (paymentStatus === 'partial') {
        if (amountPaid > 0) entries.push({ type: 'debit', accountCode: '1010', accountName: cash.name, amount: amountPaid, description: `Partial payment from ${customerName}` })
        const balance = Math.max(0, totalInvoice - amountPaid)
        if (balance > 0) entries.push({ type: 'debit', accountCode: '1200', accountName: ar.name, amount: balance, description: `Outstanding balance - ${customerName}` })
      } else if (paymentStatus === 'invoice' || paymentStatus === 'unpaid' || paymentStatus === 'overdue') {
        entries.push({ type: 'debit', accountCode: '1200', accountName: ar.name, amount: totalInvoice, description: `Accounts Receivable - ${customerName}` })
      } else if (paymentStatus === 'voided') {
        // Reverse revenue and cash/A/R
        const revCode = (entries.find(e => e.type === 'credit' && (e.accountCode.startsWith('4') || e.accountCode === '2400'))?.accountCode) || '4020'
        entries.push({ type: 'debit', accountCode: revCode, accountName: 'Revenue', amount: subtotalAmount, description: `Voided invoice - ${customerName}` })
        entries.push({ type: 'credit', accountCode: amountPaid > 0 ? '1010' : '1200', accountName: amountPaid > 0 ? cash.name : ar.name, amount: amountPaid > 0 ? amountPaid : totalInvoice, description: `Voided ${amountPaid > 0 ? 'cash' : 'A/R'} - ${customerName}` })
      } else if (paymentStatus === 'refunded') {
        const revCode = (entries.find(e => e.type === 'credit' && (e.accountCode.startsWith('4') || e.accountCode === '2400'))?.accountCode) || '4020'
        entries.push({ type: 'debit', accountCode: revCode, accountName: 'Revenue', amount: subtotalAmount, description: `Customer refund - reversing revenue - ${customerName}` })
        entries.push({ type: 'credit', accountCode: '1010', accountName: cash.name, amount: totalInvoice, description: `Customer refund payment - ${customerName}` })
      } else if (paymentStatus === 'write_off') {
        const badDebt = await prisma.account.findUnique({ where: { code: '6170' } })
        if (!badDebt) return res.status(422).json({ error: 'Bad Debt account (6170) not found' })
        entries.push({ type: 'debit', accountCode: '6170', accountName: badDebt.name, amount: totalInvoice, description: `Bad debt write-off - ${customerName}` })
        entries.push({ type: 'credit', accountCode: '1200', accountName: ar.name, amount: totalInvoice, description: `A/R write-off - ${customerName}` })
      } else if (paymentStatus === 'draft') {
        // no entries
      }

      if (overpaidAmount > 0 && creditsLiab) entries.push({ type: 'credit', accountCode: '2050', accountName: creditsLiab.name, amount: overpaidAmount, description: `Customer credit balance - ${customerName} overpaid` })

      return res.json({
        documentType: 'invoice',
        dateUsed: req.body.date || new Date().toISOString().slice(0, 10),
        policy: paymentStatus === 'paid' || paymentStatus === 'overpaid' || paymentStatus === 'prepaid' ? 'CASH' : (paymentStatus === 'partial' ? 'ACCRUAL+PAYMENT' : 'ACCRUAL'),
        totalInvoice,
        amountPaid,
        overpaidAmount,
        subtotal: subtotalAmount,
        taxAmount,
        discountAmount,
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

    // Refund preview: negative amount reverses original (Dr Cash 1010, Cr Expense)
    if (amount < 0) {
      const abs = Math.abs(amount)
      const cash = await prisma.account.findUnique({ where: { code: '1010' } })
      const expAcc = await prisma.account.findUnique({ where: { code: resolution.debit.accountCode } })
      if (!cash || !expAcc) return res.status(422).json({ error: 'Required accounts not found for refund preview' })
      return res.json({
        documentType: 'expense_refund',
        dateUsed: resolution.dateUsed,
        policy: 'REFUND',
        totalExpense: amount,
        amountPaid: 0,
        overpaidAmount: 0,
        entries: [
          { type: 'debit', accountCode: '1010', accountName: cash.name, amount: abs },
          { type: 'credit', accountCode: resolution.debit.accountCode, accountName: expAcc.name, amount: abs }
        ]
      })
    }

    const entries = [
      { type: 'debit', accountCode: resolution.debit.accountCode, accountName: resolution.debit.accountName, amount },
      { type: 'credit', accountCode: resolution.credit.accountCode, accountName: resolution.credit.accountName, amount: Math.min(amountPaid || amount, amount) }
    ]
    if (overpaid > 0.01) {
      const prepaidAccount = await prisma.account.findFirst({ where: { code: '1400' } })
      if (prepaidAccount) entries.push({ type: 'debit', accountCode: '1400', accountName: prepaidAccount.name, amount: overpaid })
    }

    res.json({
      documentType: 'expense',
      dateUsed: resolution.dateUsed,
      policy: resolution.policy,
      totalExpense: amount,
      amountPaid,
      overpaidAmount: overpaid,
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
    const expenses = await prisma.expense.findMany({
      include: { transaction: true },
      orderBy: { date: 'desc' }
    })
    res.json(expenses)
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

    const cashAcc = await prisma.account.findUnique({ where: { code: b.cashAccount || '1010' } })
    const revenueAcc = await prisma.account.findUnique({ where: { code: b.revenueAccount || '4020' } })
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
    const q = (req.query.q || '').toString().trim()
    const status = (req.query.status || '').toString().toUpperCase()
    const minAmount = isFinite(parseFloat(req.query.minAmount)) ? parseFloat(req.query.minAmount) : undefined
    const maxAmount = isFinite(parseFloat(req.query.maxAmount)) ? parseFloat(req.query.maxAmount) : undefined
    const startDate = req.query.startDate ? new Date(req.query.startDate) : undefined
    const endDate = req.query.endDate ? new Date(req.query.endDate) : undefined

    const where = {
      AND: [
        q
          ? {
              OR: [
                { invoiceNumber: { contains: q, mode: 'insensitive' } },
                { customer: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } }
              ]
            }
          : {},
        status && ['DRAFT','SENT','PAID','OVERDUE','CANCELLED'].includes(status) ? { status } : {},
        minAmount !== undefined ? { amount: { gte: minAmount } } : {},
        maxAmount !== undefined ? { amount: { lte: maxAmount } } : {},
        startDate ? { date: { gte: startDate } } : {},
        endDate ? { date: { lte: endDate } } : {}
      ]
    }

    const invoices = await prisma.invoice.findMany({ where, include: { transaction: true }, orderBy: { date: 'desc' } })
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

    const cash = await prisma.account.findUnique({ where: { code: '1010' } })
    const ar = await prisma.account.findUnique({ where: { code: '1200' } })
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

    const debitAcc = await prisma.account.findUnique({ where: { code: b.debitAccount || '1010' } })
    const equityAcc = await prisma.account.findUnique({ where: { code: b.equityAccount || '3000' } })
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
      { code: '2400', name: 'Unearned Revenue', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2010', name: 'Accounts Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '6170', name: 'Bad Debt Expense', type: 'EXPENSE', normalBalance: 'DEBIT' },
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
      const existing = await prisma.account.findUnique({ where: { code: a.code } })
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
    const cash = await prisma.account.findUnique({ where: { code: '1010' } })
    const equity = await prisma.account.findUnique({ where: { code: '3000' } })
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
    const cash = await prisma.account.findUnique({ where: { code: '1010' } })
    const revenue = await prisma.account.findUnique({ where: { code: '4020' } })
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

// Closing entries: close all revenue/expense to Retained Earnings (3200)
app.post('/api/accounting/closing-entries', async (req, res) => {
  try {
    const asOfStr = (req.body?.asOf || '').toString()
    const asOf = asOfStr ? new Date(asOfStr) : new Date()
    if (isNaN(asOf.getTime())) return res.status(400).json({ error: 'Invalid asOf date' })

    const equity = await prisma.account.findUnique({ where: { code: '3200' } })
    if (!equity) return res.status(422).json({ error: 'Retained Earnings (3200) not found' })

    // Idempotent reference per date
    const ref = `CLOSE-${asOf.toISOString().slice(0,10)}`
    const exists = await prisma.transaction.findUnique({ where: { reference: ref } })
    if (exists) {
      return res.json({ success: true, isExisting: true, transactionId: exists.id, message: 'Closing entries already posted for this date' })
    }

    // Fetch balances up to asOf for revenue and expense accounts
    const revAndExp = await prisma.account.findMany({ where: { type: { in: ['REVENUE','EXPENSE'] } }, select: { id: true, code: true, name: true, type: true, normalBalance: true } })
    const accountIdToBal = new Map()
    for (const acc of revAndExp) {
      const entries = await prisma.transactionEntry.findMany({
        where: {
          OR: [{ debitAccountId: acc.id }, { creditAccountId: acc.id }],
          transaction: { date: { lte: asOf } }
        },
        include: { transaction: { select: { date: true } } }
      })
      let running = 0
      for (const e of entries) {
        if (e.debitAccountId === acc.id) running += parseFloat(e.amount)
        if (e.creditAccountId === acc.id) running -= parseFloat(e.amount)
      }
      // Normalize to account's normal balance (positive means a credit balance for REVENUE, debit for EXPENSE)
      const balance = acc.normalBalance === 'CREDIT' ? -running : running
      if (Math.abs(balance) > 0.009) accountIdToBal.set(acc.id, { account: acc, balance })
    }

    if (accountIdToBal.size === 0) {
      return res.json({ success: true, message: 'No revenue/expense balances to close as of date' })
    }

    const txId = await prisma.$transaction(async (tx) => {
      const header = await tx.transaction.create({
        data: {
          date: asOf,
          description: `Closing Entries as of ${asOf.toISOString().slice(0,10)}`,
          reference: ref,
          amount: 0,
          customFields: { type: 'closing_entries' }
        }
      })

      let totalDebits = 0, totalCredits = 0
      for (const { account, balance } of accountIdToBal.values()) {
        if (account.type === 'REVENUE') {
          // Revenue has credit normal balance; to close, debit revenue for its credit balance
          const amt = Math.abs(balance)
          await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: account.id, creditAccountId: null, amount: amt, description: `Close ${account.code} - ${account.name}` } })
          totalDebits += amt
        } else if (account.type === 'EXPENSE') {
          // Expense has debit normal balance; to close, credit expense for its debit balance
          const amt = Math.abs(balance)
          await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: null, creditAccountId: account.id, amount: amt, description: `Close ${account.code} - ${account.name}` } })
          totalCredits += amt
        }
      }

      // Offset to Retained Earnings
      const net = totalDebits - totalCredits // positive means net income
      if (net > 0) {
        // Cr Retained Earnings
        await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: null, creditAccountId: equity.id, amount: net, description: 'Close to Retained Earnings (Net Income)' } })
        totalCredits += net
      } else if (net < 0) {
        // Dr Retained Earnings
        const amt = Math.abs(net)
        await tx.transactionEntry.create({ data: { transactionId: header.id, debitAccountId: equity.id, creditAccountId: null, amount: amt, description: 'Close to Retained Earnings (Net Loss)' } })
        totalDebits += amt
      }

      // Basic balance check
      if (Math.abs(totalDebits - totalCredits) > 0.01) throw new Error('Closing entries not balanced')

      return header.id
    })

    res.json({ success: true, transactionId: txId })
  } catch (e) {
    console.error('closing-entries error:', e)
    res.status(500).json({ error: 'Failed to create closing entries', details: String(e) })
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
      { code: '1400', name: 'Prepaid Expenses', type: 'ASSET', normalBalance: 'DEBIT' },
      { code: '3000', name: 'Owner Equity', type: 'EQUITY', normalBalance: 'CREDIT' },
      { code: '3200', name: 'Retained Earnings', type: 'EQUITY', normalBalance: 'CREDIT' },
      { code: '4020', name: 'Services Revenue', type: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '4010', name: 'Product Sales', type: 'REVENUE', normalBalance: 'CREDIT' },
      { code: '4910', name: 'Sales Discounts', type: 'REVENUE', normalBalance: 'DEBIT' },
      { code: '2050', name: 'Customer Credits Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2150', name: 'Sales Tax Payable', type: 'LIABILITY', normalBalance: 'CREDIT' },
      { code: '2400', name: 'Unearned Revenue', type: 'LIABILITY', normalBalance: 'CREDIT' },
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
      const existing = await prisma.account.findUnique({ where: { code: a.code } })
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
    // Inject company context
    let company = null
    try {
      company = await prisma.companyProfile.findFirst({ where: { workspaceId: 'default' } })
    } catch {}
    let contextPrefix = ''
    if (company) {
      const aliases = Array.isArray(company.aliases) ? company.aliases : []
      const addr = Array.isArray(company.addressLines) ? company.addressLines.join(', ') : ''
      contextPrefix = `Company: ${company.legalName}\nAliases: ${aliases.join(', ')}\nLocation: ${[company.city, company.state, company.country].filter(Boolean).join(', ')}\nAddress: ${addr}\n---\n`
    }
    const base = process.env.GEMINI_ENDPOINT || 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
    const url = `${base}?key=${process.env.GEMINI_API_KEY}`
    const { data } = await axios.post(url, { contents: [{ parts: [{ text: contextPrefix + prompt }] }] }, { headers: { 'Content-Type': 'application/json' } })
    const content = data?.candidates?.[0]?.content?.parts?.[0]?.text || ''
    res.json({ content, usage: data?.usageMetadata })
  } catch (e) {
    console.error('AI proxy error:', e)
    res.status(500).json({ error: 'AI request failed', details: 'An error occurred while generating the response.' })
  }
})



