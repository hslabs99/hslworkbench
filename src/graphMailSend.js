import { parseEmailAddress } from './emailAddress.js'

const GRAPH = 'https://graph.microsoft.com/v1.0'

export async function sendGraphMail(
  accessToken,
  {
    toEmail,
    toName,
    subject,
    html,
    fromEmail,
    fromName,
    deliveryReceiptRequested = false,
    readReceiptRequested = false,
  },
) {
  const address = parseEmailAddress(toEmail)
  if (!address) throw new Error('Recipient email is missing.')
  if (!subject) throw new Error('Email subject is missing.')

  const fromAddress = parseEmailAddress(fromEmail)
  const from = fromAddress
    ? {
        emailAddress: {
          address: fromAddress,
          name: fromName || fromAddress,
        },
      }
    : null

  const res = await fetch(`${GRAPH}/me/sendMail`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        subject,
        body: {
          contentType: 'HTML',
          content: html,
        },
        toRecipients: [
          {
            emailAddress: {
              address,
              name: toName || address,
            },
          },
        ],
        ...(from ? { from, sender: from } : {}),
        isDeliveryReceiptRequested: Boolean(deliveryReceiptRequested),
        isReadReceiptRequested: Boolean(readReceiptRequested),
      },
      saveToSentItems: true,
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const message = err.error?.message || `Microsoft Graph send failed (${res.status})`
    if (res.status === 403) {
      throw new Error(
        `${message} Grant Mail.Send on the Azure app registration, then reconnect Microsoft and consent when prompted.`,
      )
    }
    throw new Error(message)
  }
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
