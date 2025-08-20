import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import { cn } from '../../lib/utils'

type Message = { id: string; role: 'user' | 'assistant'; content: string; ts: number }
type Thread = { id: string; title: string; messages: Message[]; createdAt: number }

interface ChatDrawerProps {
  open: boolean
  onClose: () => void
  onOpenAiInvoice: () => void
  onOpenAiRevenue: () => void
}

const STORAGE_KEY = 'eze.ai.chat.threads'
const ACTIVE_KEY = 'eze.ai.chat.active'

export function ChatDrawer({ open, onClose, onOpenAiInvoice, onOpenAiRevenue }: ChatDrawerProps) {
  const [threads, setThreads] = useState<Thread[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]') } catch { return [] }
  })
  const [activeId, setActiveId] = useState<string>(() => localStorage.getItem(ACTIVE_KEY) || '')
  const [input, setInput] = useState('')

  const active = useMemo(() => threads.find(t => t.id === activeId) || threads[0], [threads, activeId])

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(threads)) }, [threads])
  useEffect(() => { if (active) localStorage.setItem(ACTIVE_KEY, active.id) }, [active?.id])

  const createThread = () => {
    const id = `t-${Date.now()}`
    const newThread: Thread = { id, title: 'New Chat', messages: [], createdAt: Date.now() }
    setThreads([newThread, ...threads])
    setActiveId(id)
  }

  const send = () => {
    if (!active || !input.trim()) return
    const userMsg: Message = { id: `m-${Date.now()}`, role: 'user', content: input.trim(), ts: Date.now() }
    const assistantMsg: Message = { id: `m-${Date.now()+1}`, role: 'assistant', content: 'This is a demo response. Backend integration will automate actions.', ts: Date.now()+1 }
    const nextThreads = threads.map(t => t.id === active.id ? { ...t, title: t.messages.length ? t.title : input.slice(0, 30), messages: [...t.messages, userMsg, assistantMsg] } : t)
    setThreads(nextThreads)
    setInput('')
  }

  if (!open) return null

  return (
    <ModalPortal>
      <div className="fixed inset-0 z-[9999] pointer-events-none">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 modal-overlay"
          onClick={onClose}
        />
        <motion.div
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="pointer-events-auto fixed right-0 top-0 bottom-0 w-full sm:w-[520px] p-3 sm:p-4"
        >
          <ThemedGlassSurface variant="light" className="h-full glass-modal liquid-glass p-0 overflow-hidden" hover={false}>
            {/* Header with callouts */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">AI Chat</div>
                <div className="text-xs text-secondary-contrast">Automate your finance with natural language</div>
              </div>
              <button className="px-2 py-1 rounded bg-surface/60 hover:bg-surface" onClick={onClose}>Close</button>
            </div>
            <div className="p-3 flex gap-2 border-b border-white/10">
              <button className="px-3 py-1.5 text-sm rounded-lg bg-primary/15 text-primary border border-primary/30" onClick={onOpenAiRevenue}>Try AI Revenue</button>
              <button className="px-3 py-1.5 text-sm rounded-lg bg-primary/15 text-primary border border-primary/30" onClick={onOpenAiInvoice}>Try AI Invoice</button>
            </div>

            <div className="flex h-[calc(100%-112px)]">
              {/* Threads list */}
              <div className="w-40 sm:w-48 border-r border-white/10 p-2 overflow-y-auto">
                <button className="w-full mb-2 px-2 py-1.5 text-sm rounded-lg bg-white/10 border border-white/10 hover:bg-white/15" onClick={createThread}>+ New Chat</button>
                <div className="space-y-1">
                  {threads.map(t => (
                    <button key={t.id} className={cn('w-full text-left px-2 py-1.5 text-sm rounded-lg border', t.id === (active?.id||'') ? 'bg-primary/15 text-primary border-primary/30' : 'bg-white/5 border-white/10 hover:bg-white/10')} onClick={() => setActiveId(t.id)}>
                      {t.title || 'Untitled'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Conversation */}
              <div className="flex-1 flex flex-col">
                <div className="flex-1 overflow-y-auto p-3 space-y-3">
                  {(active?.messages || []).map(m => (
                    <div key={m.id} className={cn('max-w-[80%] px-3 py-2 rounded-lg border', m.role === 'user' ? 'ml-auto bg-primary/15 text-primary border-primary/30' : 'bg-white/10 border-white/10')}>
                      <div className="text-xs text-secondary-contrast mb-0.5">{m.role === 'user' ? 'You' : 'Assistant'}</div>
                      <div className="text-sm whitespace-pre-wrap">{m.content}</div>
                    </div>
                  ))}
                </div>
                <div className="p-3 border-t border-white/10 flex items-center gap-2">
                  <input className="flex-1 px-3 py-2 rounded-lg bg-white/10 border border-white/10 focus:bg-white/15 outline-none" placeholder="Ask anything…" value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') send() }} />
                  <button className="px-3 py-2 rounded-lg bg-primary/20 text-primary border border-primary/30" onClick={send}>Send</button>
                </div>
              </div>
            </div>
          </ThemedGlassSurface>
        </motion.div>
      </div>
    </ModalPortal>
  )
}

export default ChatDrawer


