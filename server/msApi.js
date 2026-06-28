import { getPublicMicrosoftConfig } from './msConfig.js'
import { sendJson } from './httpUtils.js'

/** Handle Microsoft sign-in config routes. Returns true if handled. */
export function handleMsApi(req, res, pathname, env = process.env) {
  if (pathname === '/api/ms-config' && req.method === 'GET') {
    sendJson(res, 200, getPublicMicrosoftConfig(env))
    return true
  }
  return false
}
