import { TOKEN_KEY } from './session'

export class ApiError extends Error {}

/** 看板请求。401 时清掉会话并回到登录页。 */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers)
  const token = sessionStorage.getItem(TOKEN_KEY)
  if (token) headers.set('Authorization', `Bearer ${token}`)
  if (init?.body) headers.set('Content-Type', 'application/json')

  let response: Response
  try {
    response = await fetch(`${import.meta.env.VITE_API_BASE ?? ''}${path}`, { ...init, headers })
  } catch {
    throw new ApiError('连不上服务。先确认本机的 Worker 已启动。')
  }

  if (response.status === 401 && !path.endsWith('/auth/login')) {
    sessionStorage.removeItem(TOKEN_KEY)
    if (!location.pathname.startsWith('/login')) location.assign('/login')
    throw new ApiError('需要登录')
  }

  const data = (await response.json().catch(() => ({}))) as { error?: string }
  if (!response.ok) throw new ApiError(data.error || '请求失败')
  return data as T
}
