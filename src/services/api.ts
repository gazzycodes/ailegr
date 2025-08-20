import axios from 'axios'

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000'

export const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' }
})

api.interceptors.response.use(
  (res) => res,
  (error) => {
    const message = error?.response?.data?.message || error?.response?.data?.error || error.message
    return Promise.reject(new Error(message))
  }
)

export default api


