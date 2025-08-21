/// <reference types="vite/client" />

// Ambient type for canvas-confetti to silence TS since we load dynamically
declare module 'canvas-confetti' {
  const value: any
  export default value
}


