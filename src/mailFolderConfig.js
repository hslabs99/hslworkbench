/** Outlook path to the parent folder whose children are per-client scan folders. */
export const CLIENT_MAIL_ROOT_SEGMENTS = ['Inbox', 'DEV QUEUE']

export function clientMailRootLabel() {
  return CLIENT_MAIL_ROOT_SEGMENTS.join(' / ')
}
