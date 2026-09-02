/** Extra master-list fields from the harvest spreadsheet (snake_case on import). */
export const CONTACT_PROFILE_FIELDS = [
  {
    key: 'cityRegion',
    label: 'City / region',
    headers: ['city_region', 'city region', 'city/region', 'city', 'region'],
  },
  {
    key: 'marketCategory',
    label: 'Market category',
    headers: ['market_category', 'market category', 'market_ca', 'category'],
  },
  {
    key: 'website',
    label: 'Website',
    headers: ['website', 'web', 'web_site', 'web site'],
  },
  {
    key: 'publicBusiness',
    label: 'Public business',
    headers: ['public_business', 'public business', 'public_bu', 'public_buyer', 'public buyer'],
  },
  {
    key: 'phone',
    label: 'Phone',
    headers: ['phone', 'telephone', 'mobile', 'tel'],
  },
  {
    key: 'contactRole',
    label: 'Contact role',
    headers: ['contact_role', 'contact role', 'contact_ro', 'role', 'title', 'job_title', 'job title'],
  },
  {
    key: 'contactLinkedin',
    label: 'LinkedIn',
    headers: ['contact_linkedin', 'contact linkedin', 'contact_li', 'linkedin', 'linked_in'],
  },
  {
    key: 'sourceUrl',
    label: 'Source URL',
    headers: ['source_url', 'source url', 'source_ur'],
  },
  {
    key: 'evidence',
    label: 'Evidence',
    headers: ['evidence'],
  },
  {
    key: 'marketTier',
    label: 'Market tier',
    headers: ['market_tier', 'market tier', 'market_tie', 'tier'],
  },
  {
    key: 'contactQuality',
    label: 'Contact quality',
    headers: ['contact_quality', 'contact quality', 'contact_q', 'quality'],
  },
  {
    key: 'personalization',
    label: 'Personalization',
    headers: [
      'personalization',
      'personalisation',
      'personali',
      'personalized_message',
      'personalised_message',
    ],
  },
  {
    key: 'outreachStatus',
    label: 'Outreach status',
    headers: ['outreach_status', 'outreach status', 'outreach'],
  },
]

export const CONTACT_EMAIL_HEADERS = [
  'email',
  'e-mail',
  'e_mail',
  'e mail',
  'mail',
  'company_email',
  'company email',
  'company_mail',
  'email_address',
  'email address',
  'work_email',
  'work email',
]

export const CONTACT_NAME_HEADERS = [
  'name',
  'contact',
  'full_name',
  'full name',
  'contact_name',
  'contact name',
  'contact_n',
  'contact_person',
  'contact person',
]

export const CONTACT_COMPANY_HEADERS = [
  'company',
  'organisation',
  'organization',
  'org',
  'company_name',
  'company name',
]

export const CONTACT_IMPORT_FIELDS = [
  { key: 'email', label: 'Email', required: true, headers: CONTACT_EMAIL_HEADERS },
  { key: 'name', label: 'Name', headers: CONTACT_NAME_HEADERS },
  { key: 'company', label: 'Company', headers: CONTACT_COMPANY_HEADERS },
  ...CONTACT_PROFILE_FIELDS,
]

/** Spreadsheet header order used by the downloadable template. */
export const CONTACT_TEMPLATE_HEADERS = [
  'company',
  'city_region',
  'market_category',
  'website',
  'public_business',
  'phone',
  'company_email',
  'contact_name',
  'contact_role',
  'contact_linkedin',
  'source_url',
  'evidence',
  'market_tier',
  'contact_quality',
  'personalization',
  'outreach_status',
]

export function normalizeHeader(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s/-]+/g, '_')
}

export function findHeaderIndex(headers, names) {
  const wanted = new Set((names || []).map(normalizeHeader))
  return headers.findIndex((h) => wanted.has(normalizeHeader(h)))
}

/**
 * Best-effort CSV column → master-list field map.
 * Each CSV column is used at most once. Unmapped fields are -1.
 */
export function suggestColumnMapping(headers) {
  const mapping = Object.fromEntries(CONTACT_IMPORT_FIELDS.map((field) => [field.key, -1]))
  const used = new Set()

  for (const field of CONTACT_IMPORT_FIELDS) {
    const idx = findHeaderIndex(headers, field.headers)
    if (idx >= 0 && !used.has(idx)) {
      mapping[field.key] = idx
      used.add(idx)
    }
  }

  for (const field of CONTACT_IMPORT_FIELDS) {
    if (mapping[field.key] >= 0) continue
    const aliases = field.headers.map(normalizeHeader).filter((alias) => alias.length >= 3)
    let best = -1
    let bestLen = 0
    headers.forEach((header, idx) => {
      if (used.has(idx)) return
      const n = normalizeHeader(header)
      if (!n) return
      if (field.key === 'name' && n.includes('company')) return
      if (field.key === 'company' && n.includes('email')) return
      if (field.key === 'email' && (n.includes('status') || n.includes('count'))) return
      for (const alias of aliases) {
        if (n === alias || (alias.length >= 4 && n.includes(alias))) {
          if (alias.length > bestLen) {
            best = idx
            bestLen = alias.length
          }
        }
      }
    })
    if (best >= 0) {
      mapping[field.key] = best
      used.add(best)
    }
  }

  return mapping
}

export function extraFieldsFromRow(row) {
  const extra = {}
  for (const field of CONTACT_PROFILE_FIELDS) {
    extra[field.key] = String(row?.[field.key] || '').trim()
  }
  return extra
}

export function emptyContactForm() {
  return {
    name: '',
    email: '',
    company: '',
    ...Object.fromEntries(CONTACT_PROFILE_FIELDS.map((field) => [field.key, ''])),
  }
}

export function contactFormFromRow(row) {
  return {
    name: row?.name || '',
    email: row?.email || '',
    company: row?.company || '',
    ...extraFieldsFromRow(row),
  }
}

/** Copy blank name/company/profile fields from incoming onto existing. */
export function mergeContactFields(existing, incoming, { includeNameCompany = true } = {}) {
  let next = existing
  const keys = [
    ...(includeNameCompany ? ['name', 'company'] : []),
    ...CONTACT_PROFILE_FIELDS.map((field) => field.key),
  ]
  for (const key of keys) {
    const current = String(next?.[key] || '').trim()
    const incomingValue = String(incoming?.[key] || '').trim()
    if (!current && incomingValue) {
      next = { ...next, [key]: incomingValue }
    }
  }
  return next
}

export function contactLinkHref(value, key) {
  if (!['website', 'contactLinkedin', 'sourceUrl'].includes(key)) return ''
  const raw = String(value || '').trim()
  if (!raw) return ''
  if (/^https?:\/\//i.test(raw)) return raw
  if (/^www\./i.test(raw) || raw.includes('linkedin.com') || /^[\w.-]+\.[a-z]{2,}/i.test(raw)) {
    return `https://${raw.replace(/^\/+/, '')}`
  }
  return ''
}
