import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import supabase from '../services/supabaseClient'

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

	const value = useMemo(() => ({ user, session, loading }), [user, session, loading])
	return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
	return useContext(AuthContext)
}
