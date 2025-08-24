import { PrismaClient } from '@prisma/client'
import { AsyncLocalStorage } from 'node:async_hooks'
import { createRemoteJWKSet, jwtVerify, decodeJwt } from 'jose'
// Ensure env is loaded even if server imports this module before calling dotenv in server.js
try { await import('dotenv/config') } catch {}

// Async context for per-request tenant and user
export const requestContext = new AsyncLocalStorage()

// Prisma client base
const basePrisma = new PrismaClient()

// Models that include tenantId and must be isolated
const TENANT_MODELS = new Set([
  'Account',
  'Transaction',
  'TransactionEntry',
  'Expense',
  'Category',
  'PendingCategoryApproval',
  'Customer',
  'Invoice',
  'RecurringRule',
  'CompanyProfile',
])

function getTenantId() {
  const store = requestContext.getStore() || {}
  return store?.tenantId
}

function andTenant(where, tenantId) {
  if (!tenantId) return where || {}
  return { AND: [where || {}, { tenantId }] }
}

// Tenancy-aware Prisma using $extends query extensions
export const prisma = basePrisma.$extends({
  query: {
    $allModels: {
      async findMany({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          args.where = andTenant(args?.where, tenantId)
        }
        return query(args)
      },
      async findFirst({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          args.where = andTenant(args?.where, tenantId)
        }
        return query(args)
      },
      async findUnique(q) {
        // Leave findUnique untouched to avoid breaking unique-by-id reads
        return q.query(q.args)
      },
      async create({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          args.data = args.data || {}
          if (args.data.tenantId == null) args.data.tenantId = tenantId
        }
        return query(args)
      },
      async createMany({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          const d = args.data
          if (Array.isArray(d)) {
            args.data = d.map((row) => ({ ...row, tenantId: row?.tenantId ?? tenantId }))
          } else if (d && typeof d === 'object') {
            args.data = { ...d, tenantId: d.tenantId ?? tenantId }
          }
        }
        return query(args)
      },
      async update({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          try {
            const where = args?.where || {}
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1)
            if (where.id) {
              const ok = await basePrisma[modelKey].findFirst({ where: andTenant({ id: where.id }, tenantId), select: { id: true } })
              if (!ok) { const err = new Error('Not found'); err.code = 'P2025'; throw err }
            } else if (where.code && !where.tenantId_code) {
              // Prefer composite unique for safety when only code is provided
              args.where = { tenantId_code: { tenantId, code: where.code } }
            }
            if (args.data && 'tenantId' in args.data) delete args.data.tenantId
          } catch {}
        }
        return query(args)
      },
      async updateMany({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          args.where = andTenant(args?.where, tenantId)
        }
        return query(args)
      },
      async delete({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          try {
            const where = args?.where || {}
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1)
            if (where.id) {
              const ok = await basePrisma[modelKey].findFirst({ where: andTenant({ id: where.id }, tenantId), select: { id: true } })
              if (!ok) { const err = new Error('Not found'); err.code = 'P2025'; throw err }
            } else {
              args.where = andTenant(args?.where, tenantId)
            }
          } catch {}
        }
        return query(args)
      },
      async deleteMany({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          args.where = andTenant(args?.where, tenantId)
        }
        return query(args)
      },
      async upsert({ model, args, query }) {
        const tenantId = getTenantId()
        if (tenantId && TENANT_MODELS.has(model)) {
          try {
            const where = args?.where || {}
            const modelKey = model.charAt(0).toLowerCase() + model.slice(1)
            if (where.id) {
              const ok = await basePrisma[modelKey].findFirst({ where: andTenant({ id: where.id }, tenantId), select: { id: true } })
              // ok may be null for create path; that's fine
            } else if (where.code && !where.tenantId_code) {
              args.where = { tenantId_code: { tenantId, code: where.code } }
            }
            if (args.update && 'tenantId' in args.update) delete args.update.tenantId
            if (args.create && args.create.tenantId == null) args.create.tenantId = tenantId
          } catch {}
        }
        return query(args)
      }
    }
  }
})

// Upsert a lightweight user profile (id/email) for UI display
export async function upsertUserProfile(userId, email) {
  try {
    if (!userId) return
    if (email) {
      await basePrisma.userProfile.upsert({
        where: { userId },
        update: { email },
        create: { userId, email }
      })
    }
  } catch {}
}

// Auth: Supabase JWT verification via JWKS
function getSupabaseUrl() {
  return (process.env.AILEGR_SUPABASE_URL || process.env.VITE_SUPABASE_URL || '').toString().trim()
}

let JWKS = null
function getJWKS() {
  if (JWKS) return JWKS
  const url = getSupabaseUrl()
  if (url && /^https?:\/\//i.test(url)) {
    // Try modern and legacy Supabase JWKS URLs
    try {
      const primary = new URL('/auth/v1/.well-known/jwks.json', url)
      JWKS = createRemoteJWKSet(primary)
    } catch {}
    if (!JWKS) {
      try { JWKS = createRemoteJWKSet(new URL('/auth/v1/certs', url)) } catch {}
    }
  }
  return JWKS
}

async function verifyJwt(token) {
  if (!token) return null
  // Strategy: try JWKS (RS*) first; if that fails or not configured, try HMAC secret from env (HS*).
  const tryParse = async (verifier) => {
    const { payload } = await verifier
    // Issuer: accept either project origin or origin/auth/v1
    try {
      const origin = new URL(getSupabaseUrl()).origin
      const iss = String(payload?.iss || '')
      if (iss && !(iss.startsWith(origin) || iss.startsWith(origin + '/auth'))) return null
    } catch {}
    if (payload?.aud && String(payload.aud) !== 'authenticated') return null
    const userId = String(payload.sub || '')
    const email = String(payload.email || payload.user_metadata?.email || '')
    if (!userId) return null
    return { userId, email }
  }

  // 1) JWKS (public-key) verify
  try {
    const jwks = getJWKS()
    if (jwks) {
      const res = await tryParse(jwtVerify(token, jwks))
      if (res) return res
    }
  } catch {}

  // 2) HMAC secret verify (HS256), using Supabase JWT secret
  try {
    const secret = (process.env.AILEGR_SUPABASE_JWT_SECRET || process.env.SUPABASE_JWT_SECRET || process.env.JWT_SECRET || '').toString().trim()
    if (secret) {
      const key = new TextEncoder().encode(secret)
      const res = await tryParse(jwtVerify(token, key))
      if (res) return res
    }
  } catch {}

  // 3) Failed all strong checks
  return null
}

export async function verifyBearerToken(token) {
  return verifyJwt(token)
}

// Combined auth + tenant context middleware
export function tenantContextMiddleware(options = {}) {
  const enforceAuth = String(process.env.AILEGR_AUTH_ENFORCE || options.enforceAuth || 'true').toLowerCase() === 'true'
  return async (req, res, next) => {
    try {
      // Parse Authorization header or internal job key
      const authHeader = req.headers['authorization'] || req.headers['Authorization']
      const raw = Array.isArray(authHeader) ? authHeader[0] : authHeader
      const token = raw && raw.startsWith('Bearer ') ? raw.slice('Bearer '.length).trim() : ''
      const jobKey = (req.headers['x-job-key'] || req.headers['X-Job-Key'] || '').toString()
      const validJob = jobKey && process.env.AILEGR_JOB_KEY && jobKey === process.env.AILEGR_JOB_KEY
      let auth = validJob ? { userId: 'internal-job', email: '' } : await verifyJwt(token)
      // Dev mode: if not enforcing auth and no verified token, attempt a soft decode.
      // If still unauthenticated, fall back to a local dev identity so routes relying on req.auth don't 401.
      if (!auth && !enforceAuth) {
        if (token) {
          try {
            const payload = decodeJwt(token)
            if (payload && (payload.sub || payload.email)) {
              auth = { userId: String(payload.sub || 'dev-local'), email: String(payload.email || '') }
            }
          } catch {}
        }
        if (!auth) {
          auth = { userId: 'dev-local', email: '' }
        }
      }
      if (enforceAuth && !auth) {
        return res.status(401).json({ error: 'Unauthorized' })
      }
      req.auth = auth || null

      // Resolve tenantId
      let tenantId = 'dev'
      const claimedTenant = String(req.headers['x-tenant-id'] || req.headers['X-Tenant-Id'] || '').trim()
      if (validJob) {
        if (claimedTenant) {
          const t = await prisma.tenant.findFirst({ where: { id: claimedTenant } })
          if (t) tenantId = claimedTenant
        }
      } else if (auth && auth.userId) {
        if (claimedTenant) {
          const membership = await prisma.membership.findFirst({ where: { userId: auth.userId, tenantId: claimedTenant } })
          if (membership) tenantId = claimedTenant
        }
        if (tenantId === 'dev') {
          const first = await prisma.membership.findFirst({ where: { userId: auth.userId }, orderBy: { createdAt: 'asc' } })
          if (first) tenantId = first.tenantId
        }
      }

      req.tenantId = tenantId
      requestContext.run({ tenantId, userId: auth?.userId || null }, () => next())
    } catch (e) {
      return res.status(500).json({ error: 'Failed to establish tenant context' })
    }
  }
}

export function requireRole(...allowedRoles) {
  const allowed = new Set((allowedRoles || []).map((r) => String(r).toUpperCase()))
  return async (req, res, next) => {
    try {
      // In dev mode (auth enforcement disabled), skip role checks entirely.
      const enforceAuth = String(process.env.AILEGR_AUTH_ENFORCE || 'true').toLowerCase() === 'true'
      if (!enforceAuth) return next()
      // Internal job bypass
      if (req?.auth?.userId === 'internal-job') return next()
      const userId = req?.auth?.userId
      const tenantId = req?.tenantId
      if (!userId || !tenantId) return res.status(401).json({ error: 'Unauthorized' })
      const membership = await prisma.membership.findFirst({ where: { userId, tenantId } })
      if (!membership) return res.status(403).json({ error: 'Forbidden' })
      if (allowed.size === 0) return next()
      if (!allowed.has(String(membership.role).toUpperCase())) {
        return res.status(403).json({ error: 'Insufficient permissions' })
      }
      return next()
    } catch (e) {
      return res.status(500).json({ error: 'Authorization failed' })
    }
  }
}


