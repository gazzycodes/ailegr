import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Mic, MicOff, Volume2, Zap } from 'lucide-react'
import { ThemedGlassSurface } from '../themed/ThemedGlassSurface'
import { ModalPortal } from '../layout/ModalPortal'
import { cn } from '../../lib/utils'

interface VoiceCommandInterfaceProps {
  isActive: boolean
  onToggle: (active: boolean) => void
}

interface VoiceCommand {
  id: string
  transcript: string
  command: string
  confidence: number
  timestamp: number
  status: 'processing' | 'success' | 'error'
  result?: string
}

// Mock voice recognition (in real app, would use Web Speech API)
const mockCommands = [
  "Add $500 Adobe subscription expense",
  "Show me profit trends for last quarter", 
  "Create invoice for ACME Corp $5000",
  "Set budget alert for marketing at $2000",
  "Generate cash flow report",
  "Record $1200 freelancer payment"
]

export function VoiceCommandInterface({ isActive, onToggle }: VoiceCommandInterfaceProps) {
  const [isListening, setIsListening] = useState(false)
  const [currentTranscript, setCurrentTranscript] = useState('')
  const [recentCommands, setRecentCommands] = useState<VoiceCommand[]>([])
  const [audioLevel, setAudioLevel] = useState(0)
  const [isSupported, setIsSupported] = useState(true)
  
  const recognitionRef = useRef<any>(null)
  const animationRef = useRef<number>()

  // Check for Web Speech API support
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    setIsSupported(!!SpeechRecognition)
  }, [])

  // Simulate audio level animation
  useEffect(() => {
    if (isListening) {
      const animate = () => {
        setAudioLevel(Math.random() * 100)
        animationRef.current = requestAnimationFrame(animate)
      }
      animate()
    } else {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
      setAudioLevel(0)
    }

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current)
      }
    }
  }, [isListening])

  // Start/stop voice recognition
  const toggleListening = () => {
    if (!isSupported) {
      alert('Speech recognition is not supported in your browser')
      return
    }

    if (isListening) {
      stopListening()
    } else {
      startListening()
    }
  }

  const startListening = () => {
    try {
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
      
      if (!SpeechRecognition) {
        // Simulate voice recognition for demo
        simulateVoiceRecognition()
        return
      }

      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = true
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'

      recognitionRef.current.onstart = () => {
        setIsListening(true)
        setCurrentTranscript('')
      }

      recognitionRef.current.onresult = (event: any) => {
        let transcript = ''
        for (let i = event.resultIndex; i < event.results.length; i++) {
          if (event.results[i].isFinal) {
            transcript += event.results[i][0].transcript
          } else {
            setCurrentTranscript(event.results[i][0].transcript)
          }
        }
        
        if (transcript) {
          processVoiceCommand(transcript, event.results[event.resultIndex][0].confidence)
        }
      }

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error)
        setIsListening(false)
      }

      recognitionRef.current.onend = () => {
        setIsListening(false)
        setCurrentTranscript('')
      }

      recognitionRef.current.start()
    } catch (error) {
      console.error('Error starting speech recognition:', error)
      simulateVoiceRecognition()
    }
  }

  const stopListening = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
    }
    setIsListening(false)
    setCurrentTranscript('')
  }

  // Simulate voice recognition for demo purposes
  const simulateVoiceRecognition = () => {
    setIsListening(true)
    setCurrentTranscript('Listening...')
    
    setTimeout(() => {
      const randomCommand = mockCommands[Math.floor(Math.random() * mockCommands.length)]
      setCurrentTranscript(randomCommand)
      
      setTimeout(() => {
        processVoiceCommand(randomCommand, 0.95)
        setIsListening(false)
        setCurrentTranscript('')
      }, 1500)
    }, 2000)
  }

  const processVoiceCommand = async (transcript: string, confidence: number) => {
    const command: VoiceCommand = {
      id: `cmd-${Date.now()}`,
      transcript,
      command: parseCommand(transcript),
      confidence,
      timestamp: Date.now(),
      status: 'processing'
    }

    setRecentCommands(prev => [command, ...prev.slice(0, 4)])

    // Send transcript to AI Chat pipeline via global event (non-blocking)
    try { window.dispatchEvent(new CustomEvent('chat:send', { detail: { text: transcript } })) } catch {}

    // Simulate command processing
    setTimeout(() => {
      const success = Math.random() > 0.2 // 80% success rate
      
      setRecentCommands(prev => prev.map(cmd => 
        cmd.id === command.id 
          ? { 
              ...cmd, 
              status: success ? 'success' : 'error',
              result: success ? getSuccessMessage(command.command) : 'Command failed to execute'
            }
          : cmd
      ))
    }, 2000)
  }

  const parseCommand = (transcript: string): string => {
    const lowerTranscript = transcript.toLowerCase()
    
    if (lowerTranscript.includes('add') && lowerTranscript.includes('expense')) {
      return 'ADD_EXPENSE'
    } else if (lowerTranscript.includes('show') && lowerTranscript.includes('trend')) {
      return 'SHOW_TRENDS'
    } else if (lowerTranscript.includes('create') && lowerTranscript.includes('invoice')) {
      return 'CREATE_INVOICE'
    } else if (lowerTranscript.includes('budget') && lowerTranscript.includes('alert')) {
      return 'SET_BUDGET_ALERT'
    } else if (lowerTranscript.includes('generate') && lowerTranscript.includes('report')) {
      return 'GENERATE_REPORT'
    } else if (lowerTranscript.includes('record') && lowerTranscript.includes('payment')) {
      return 'RECORD_PAYMENT'
    }
    
    return 'GENERAL_QUERY'
  }

  const getSuccessMessage = (command: string): string => {
    switch (command) {
      case 'ADD_EXPENSE':
        return 'Expense added successfully!'
      case 'SHOW_TRENDS':
        return 'Displaying profit trends...'
      case 'CREATE_INVOICE':
        return 'Invoice created and sent!'
      case 'SET_BUDGET_ALERT':
        return 'Budget alert configured!'
      case 'GENERATE_REPORT':
        return 'Report generated successfully!'
      case 'RECORD_PAYMENT':
        return 'Payment recorded!'
      default:
        return 'Command executed successfully!'
    }
  }

  const getCommandIcon = (command: string) => {
    switch (command) {
      case 'ADD_EXPENSE':
        return '💳'
      case 'SHOW_TRENDS':
        return '📈'
      case 'CREATE_INVOICE':
        return '📄'
      case 'SET_BUDGET_ALERT':
        return '⚠️'
      case 'GENERATE_REPORT':
        return '📊'
      case 'RECORD_PAYMENT':
        return '💰'
      default:
        return '🤖'
    }
  }

  if (!isActive) {
    return (
      <motion.button
        onClick={() => onToggle(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className={cn(
          "p-2 rounded-lg transition-all duration-200",
          "bg-primary/10 text-primary hover:bg-primary/20",
          "hover:shadow-lg hover:shadow-primary/20"
        )}
        title="Activate Voice Commands"
      >
        <Mic className="w-4 h-4" />
      </motion.button>
    )
  }

  return (
    <ModalPortal>
    <div className="fixed inset-0 z-[9999] modal-overlay flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className="w-full max-w-md"
      >
        <ThemedGlassSurface variant="light" className="p-6 glass-modal liquid-glass" hover={false}>
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary/20 to-primary/10 flex items-center justify-center">
                <Volume2 className="w-4 h-4 text-primary" />
              </div>
              <div>
                <h3 className="font-semibold">Voice Commands</h3>
                <p className="text-xs text-muted-contrast">AI-powered voice interface</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={(e) => { e.stopPropagation(); try { window.dispatchEvent(new Event('ai:help')) } catch {} }}
                className="px-2 py-1 text-xs rounded bg-white/10 hover:bg-white/15 border border-white/10"
              >
                How it works
              </button>
              <button
                onClick={() => onToggle(false)}
                className="p-1 rounded-md hover:bg-surface/50 transition-colors"
              >
                ✕
              </button>
            </div>
          </div>

          {/* Voice Input */}
          <div className="text-center mb-6">
            <motion.button
              onClick={toggleListening}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              className={cn(
                "relative w-20 h-20 rounded-full transition-all duration-300 mx-auto mb-4",
                isListening 
                  ? "bg-red-500 hover:bg-red-600 shadow-lg shadow-red-500/25" 
                  : "bg-primary hover:bg-primary/90 shadow-lg shadow-primary/25"
              )}
            >
              {isListening ? (
                <MicOff className="w-8 h-8 text-white mx-auto" />
              ) : (
                <Mic className="w-8 h-8 text-white mx-auto" />
              )}
              
              {/* Audio level visualization */}
              <AnimatePresence>
                {isListening && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-4 border-white/30"
                    animate={{
                      scale: [1, 1 + audioLevel / 100, 1],
                      opacity: [0.3, 0.6, 0.3]
                    }}
                    transition={{ duration: 0.3 }}
                  />
                )}
              </AnimatePresence>
            </motion.button>

            <div className="text-sm text-muted-contrast mb-2">
              {isListening ? "Listening..." : "Click to start speaking"}
            </div>

            {/* Current transcript */}
            <AnimatePresence>
              {currentTranscript && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-3 bg-surface/50 rounded-lg text-sm min-h-[40px] flex items-center justify-center"
                >
                  "{currentTranscript}"
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Recent Commands */}
          {recentCommands.length > 0 && (
            <div>
              <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                <Zap className="w-4 h-4" />
                Recent Commands
              </h4>
              
              <div className="space-y-2 max-h-40 overflow-y-auto">
                <AnimatePresence>
                  {recentCommands.map((command) => (
                    <motion.div
                      key={command.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      className={cn(
                        "p-3 rounded-lg border text-sm",
                        command.status === 'processing' && "border-yellow-500/30 bg-yellow-500/5",
                        command.status === 'success' && "border-green-500/30 bg-green-500/5",
                        command.status === 'error' && "border-red-500/30 bg-red-500/5"
                      )}
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{getCommandIcon(command.command)}</span>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {command.transcript}
                          </div>
                          <div className="flex items-center gap-2 mt-1">
                            <span className="text-xs text-muted-contrast">
                              {(command.confidence * 100).toFixed(0)}% confidence
                            </span>
                            {command.status === 'processing' && (
                              <div className="w-3 h-3 border-2 border-yellow-500/50 border-t-yellow-500 rounded-full animate-spin" />
                            )}
                            {command.status === 'success' && (
                              <span className="text-xs text-green-400">✓</span>
                            )}
                            {command.status === 'error' && (
                              <span className="text-xs text-red-400">✗</span>
                            )}
                          </div>
                          {command.result && (
                            <div className={cn(
                              "text-xs mt-1",
                              command.status === 'success' ? "text-green-400" : "text-red-400"
                            )}>
                              {command.result}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            </div>
          )}

          {/* Voice Commands Help */}
          <div className="mt-6 pt-4 border-t border-border/20">
            <div className="text-xs text-muted-contrast">
              <div className="font-medium mb-1">Try saying:</div>
              <div>"Add $500 Adobe subscription"</div>
              <div>"Show me profit trends"</div>
              <div>"Create invoice for $5000"</div>
            </div>
          </div>
        </ThemedGlassSurface>
      </motion.div>
    </div>
    </ModalPortal>
  )
}
