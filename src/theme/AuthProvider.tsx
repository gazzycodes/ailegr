import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import supabase from '../services/supabaseClient'
import { bootstrapTenant } from '../services/setupService'
import { setActiveTenantId } from '../services/tenantStore'

interface AuthState {
	user: any | null
	session: any | null
	loading: boolean
}

const AuthContext = createContext<AuthState>({ user: null, session: null, loading: true })

export function AuthProvider({ children }: { children: React.ReactNode }) {
	const [user, setUser] = useState<any | null>(null)
	const [session, setSession] = useState<any | null>(null)
	const [loading, setLoading] = useState(true)
	const [tenantBooting, setTenantBooting] = useState(false)

	useEffect(() => {
		let mounted = true
		;(async () => {
			const { data } = await supabase.auth.getSession()
			if (!mounted) return
			setSession(data.session)
			setUser(data.session?.user ?? null)
			setLoading(false)
		})()
		const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
			setSession(s)
			setUser(s?.user ?? null)
		})
		return () => { mounted = false; sub.subscription.unsubscribe() }
	}, [])

	// Bootstrap tenant after login and store active tenant id
	useEffect(() => {
		if (!session || !user) return
		let cancelled = false
		;(async () => {
			try {
				setTenantBooting(true)
				const tenantName = `Personal - ${user.email || user.id}`
				const resp = await bootstrapTenant({ tenantName, userId: user.id, role: 'OWNER' })
				if (cancelled) return
				if (resp?.tenantId) setActiveTenantId(resp.tenantId)
			} catch (e: any) {
				const msg = e?.message || 'Tenant bootstrap failed'
				window.dispatchEvent(new CustomEvent('toast', { detail: { message: msg, type: 'error' } }))
			} finally { setTenantBooting(false) }
		})()
		return () => { cancelled = true }
	}, [session?.access_token, user?.id])

	const value = useMemo(() => ({ user, session, loading: loading || (user && tenantBooting) }), [user, session, loading, tenantBooting])
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
	return useContext(AuthContext)
}
