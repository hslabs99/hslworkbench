# New Mailings — transfer & archive guide

This document describes the **New Mailings** feature built in the XLS Experts website (`xlsexpertscursor`) so it can be moved into a **separate marketing project** with its own Firestore database, while that project continues to **read inquiries from this website’s Firestore**.

Once the other project owns mailings, the mailing code in this repo can be archived/removed. The website should keep writing inquiries to Firestore; it no longer needs to own campaigns, audiences, or SendGrid marketing sends.

---

## 1. Product summary

Mailchimp-like admin under **New Mailings**:

| Sub-tab | Purpose |
|--------|---------|
| **Client database** | Contacts (prospects + clients): CRUD, CSV upload, engagement flags, campaign tags, drill-down send history |
| **Audiences** | Reusable named filter sets (status, sector, region, manual picks, exclude/require campaign tags) |
| **Campaigns** | WYSIWYG HTML email, select a saved audience, send via SendGrid, open/click analytics |

Supporting behaviour:

- Enquiry / discovery booking submitters are upserted as **prospects** (today, from this site).
- Campaign send stamps contact with a **campaign tag** (campaign id) for batch / exclude filters.
- Unsubscribe via signed link → `/unsubscribe`.
- SendGrid Event Webhook records opens, clicks, delivers, bounces.

---

## 2. Firestore collections (mailing)

Defined in `lib/firebase.ts`. Collections are created on first write (Firestore does not require empty pre-create).

| Collection id | Constant | Role |
|---------------|----------|------|
| `mailingContacts` | `MAILING_CONTACTS_COLLECTION` | CRM list |
| `mailingAudiences` | `MAILING_AUDIENCES_COLLECTION` | Saved audience filters |
| `mailingCampaigns` | `MAILING_CAMPAIGNS_COLLECTION` | Campaign drafts / sends + stats |
| `mailingSends` | `MAILING_SENDS_COLLECTION` | Per-recipient send + engagement log |

### 2.1 `mailingContacts` document shape

| Field | Type | Notes |
|-------|------|--------|
| `contact` | string | Contact person label |
| `name` | string | Person name (merge `{{name}}`) |
| `email` | string | Lowercased unique key |
| `company` | string | |
| `sector` | string | Free text |
| `status` | `'prospect' \| 'client'` | Client status is **manual** |
| `region` | `'NZ' \| 'International'` | Default `NZ` |
| `source` | `'upload' \| 'manual' \| 'enquiry' \| 'discovery'` | |
| `campaignTags` | string[] | Campaign ids already sent to this contact |
| `unsubscribed` | boolean | |
| `unsubscribedAt` | timestamp \| null | |
| `hasOpened` / `hasClicked` / `hasEngaged` | boolean | Engagement flags for the contacts table |
| `openCount` / `clickCount` | number | |
| `lastOpenedAt` / `lastClickedAt` / `lastSentAt` | timestamp \| null | |
| `notes` | string | |
| `createdAt` / `updatedAt` | timestamp | |

### 2.2 `mailingAudiences` document shape

| Field | Type | Notes |
|-------|------|--------|
| `name` | string | Required |
| `description` | string | |
| `filter` | object | See audience filter below |
| `createdAt` / `updatedAt` | timestamp | |

**Audience filter (`MailingAudienceFilter`):**

```ts
{
  statuses?: ('prospect' | 'client')[]
  sectors?: string[]
  regions?: ('NZ' | 'International')[]
  contactIds?: string[]           // manual selection; if non-empty, must be in list
  excludeCampaignTags?: string[]  // exclude if contact has any of these campaign ids
  requireCampaignTags?: string[]  // must have all
  includeUnsubscribed?: boolean   // default false
}
```

### 2.3 `mailingCampaigns` document shape

| Field | Type | Notes |
|-------|------|--------|
| `name` | string | |
| `subject` | string | |
| `htmlBody` | string | TipTap HTML |
| `textBody` | string | Plain fallback (auto from HTML if omitted) |
| `status` | `'draft' \| 'sending' \| 'sent' \| 'failed'` | |
| `audienceId` | string | Points at `mailingAudiences` |
| `audienceName` | string | Denormalised |
| `audience` | filter object | Snapshot at send (also legacy fallback) |
| `stats` | object | `targeted`, `sent`, `accepted`, `delivered`, `opened`, `clicked`, `bounced`, `failed`, `unsubscribed` |
| `sentAt` | timestamp \| null | |
| `createdAt` / `updatedAt` | timestamp | |

### 2.4 `mailingSends` document shape

| Field | Type | Notes |
|-------|------|--------|
| `campaignId` | string | |
| `contactId` | string | |
| `email` | string | |
| `status` | send status enum | `queued` → `accepted` → `delivered` / `opened` / `clicked` / … |
| `messageId` | string | SendGrid `x-message-id` |
| `openedAt` / `clickedAt` | timestamp \| null | |
| `lastClickUrl` | string | |
| `events` | array | `{ type, at, url?, rawEvent? }` |
| `error` | string | |
| `createdAt` / `updatedAt` | timestamp | |

---

## 3. Inquiries (this website’s Firestore — source of leads)

The marketing project should **read** (not own) the website inquiry store.

| Collection id | Constant | File |
|---------------|----------|------|
| `enquiries` | `ENQUIRIES_COLLECTION` | `lib/firebase.ts`, `lib/enquiries.ts`, `lib/enquiries-db.ts` |

Written by:

- `POST /api/contact` — `type: 'standard'`
- `POST /api/booking` — `type: 'discovery'`

### Enquiry document fields

| Field | Notes |
|-------|--------|
| `type` | `'standard' \| 'discovery'` |
| `status` | `'new' \| 'reviewed' \| 'quoted' \| 'closed'` |
| `name`, `company`, `email`, `phone`, `message` | |
| `services` | string[] |
| `service`, `solution`, `hear` | catalogue / attribution |
| `day`, `date`, `time`, `method`, `slotId` | discovery booking only |
| `emailNotified` | boolean (transactional notify) |
| `createdAt`, `updatedAt` | timestamps |

**Suggested mapping into mailing contacts (other project):**

| Enquiry | Contact |
|---------|---------|
| `name` | `name` + `contact` |
| `email` | `email` |
| `company` | `company` |
| `solution` or `service` | `sector` (if empty) |
| — | `status: 'prospect'` |
| — | `region: 'NZ'` |
| `type` | `source: 'enquiry' \| 'discovery'` |

Do **not** downgrade an existing `client` to `prospect` on re-sync. Preserve `unsubscribed`.

Today this site also calls `upsertProspectFromLead` after enquiry/booking save (`app/api/contact/route.ts`, `app/api/booking/route.ts`). After transfer, that upsert can be removed here and performed in the marketing project by polling/listening to `enquiries`.

---

## 4. Connecting the other project to *this* Firestore

The marketing app has **its own** Firestore for `mailingContacts` / audiences / campaigns / sends. It also needs a **second** Admin SDK connection (or named app) aimed at the **XLS Experts website Firebase project** to read `enquiries`.

### 4.1 Identify this project

From this repo’s env (`.env.local` / App Hosting):

- `NEXT_PUBLIC_FIREBASE_PROJECT_ID` — website Firebase project id  
- Other `NEXT_PUBLIC_FIREBASE_*` keys identify the same project for the client SDK  

Server access here uses Firebase Admin + Application Default Credentials (`lib/firebase-admin.ts`).

### 4.2 Recommended pattern (other project)

1. Keep the marketing app’s default Firebase Admin app pointed at **its own** project (mailing collections).
2. Initialize a **second** named Admin app for the website, e.g. `xls-website`:

```ts
import { cert, getApps, initializeApp, getApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'

function getWebsiteDb() {
  const name = 'xls-website'
  const existing = getApps().find((a) => a.name === name)
  const app =
    existing ??
    initializeApp(
      {
        credential: cert({
          projectId: process.env.XLS_WEBSITE_FIREBASE_PROJECT_ID,
          clientEmail: process.env.XLS_WEBSITE_FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.XLS_WEBSITE_FIREBASE_PRIVATE_KEY?.replace(
            /\\n/g,
            '\n'
          ),
        }),
        projectId: process.env.XLS_WEBSITE_FIREBASE_PROJECT_ID,
      },
      name
    )
  return getFirestore(app)
}

// Read-only inquiries
const snap = await getWebsiteDb()
  .collection('enquiries')
  .orderBy('createdAt', 'desc')
  .limit(100)
  .get()
```

3. Create a **service account** in the **website** Firebase/GCP project with permission to read Firestore (and only the `enquiries` collection if you tighten rules/IAM later).
4. Store the service account JSON fields in the marketing project’s env (never `NEXT_PUBLIC_`).
5. Optionally sync real-time updates with `onSnapshot` on `enquiries`, or a scheduled sync that upserts into `mailingContacts` in the marketing DB.

### 4.3 Security checklist

- Prefer a dedicated SA with least privilege (Firestore read on website project).
- Do not reuse the website’s SendGrid or OpenAI keys unless intentional.
- Website App Hosting continues to use ADC for **its** project; the marketing SA is only for cross-project read.
- If both projects share one GCP org, you can grant the marketing Cloud Run / App Hosting SA `roles/datastore.viewer` on the website project instead of a JSON key (prefer IAM over long-lived keys where possible).

### 4.4 Env vars for the marketing project (suggested)

```env
# Marketing project's own Firebase (mailing* collections)
# ...usual FIREBASE / NEXT_PUBLIC_FIREBASE_* for that app...

# Cross-project read of website inquiries
XLS_WEBSITE_FIREBASE_PROJECT_ID=
XLS_WEBSITE_FIREBASE_CLIENT_EMAIL=
XLS_WEBSITE_FIREBASE_PRIVATE_KEY=

# SendGrid (campaign sending — can be same account as website or separate)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=
SENDGRID_FROM_NAME=
MAILINGS_UNSUBSCRIBE_SECRET=
NEXT_PUBLIC_SITE_URL=   # public origin for /unsubscribe links
```

---

## 5. Source files to copy into the other project

### Core domain

| Path | Role |
|------|------|
| `lib/mailings.ts` | Types, filter parse helpers, `htmlToPlainText` |
| `lib/mailings-db.ts` | Firestore CRUD + audience resolve |
| `lib/mailings-send.ts` | Campaign send loop |
| `lib/mailings-unsubscribe.ts` | HMAC token + footer + merge tags |
| `lib/firebase.ts` | Collection name constants (adapt to other project) |

### APIs

| Path | Role |
|------|------|
| `app/api/admin/mailings/contacts/route.ts` | Contact list / CRUD / CSV upload |
| `app/api/admin/mailings/audiences/route.ts` | Audience CRUD + preview |
| `app/api/admin/mailings/campaigns/route.ts` | Campaign CRUD + send |
| `app/api/mailings/unsubscribe/route.ts` | Public unsubscribe API |
| `app/api/webhooks/sendgrid/route.ts` | Open/click/bounce webhook |
| `app/unsubscribe/page.tsx` | Public unsubscribe UI |

### Admin UI

| Path | Role |
|------|------|
| `components/admin-mailings-panel.tsx` | Full New Mailings UI (3 sub-tabs) |
| `components/email-html-editor.tsx` | TipTap WYSIWYG (shared) |
| `lib/tiptap-font-size.ts`, `lib/email-templates.ts` | Editor fonts/sizes (if used) |
| `components/admin-dialog.tsx` | Confirm dialogs |

### Email sending dependency

| Path | Role |
|------|------|
| `lib/email/sendgrid.ts` | `sendEmail` with `customArgs` + `tracking` |
| `lib/email/types.ts` | `SendEmailInput` (`customArgs`, `tracking`) |
| `lib/email/errors.ts`, `lib/email/index.ts` | Errors / re-exports |

Campaigns send **one recipient per API call** with:

- `customArgs`: `campaign_id`, `contact_id`, `send_id`
- `tracking`: open + click enabled; subscription tracking off (custom unsubscribe footer)
- Merge tags in HTML: `{{name}}`, `{{contact}}`, `{{company}}`, `{{email}}`

### Admin shell wiring (this repo only — recreate in other project)

| Path | What was added |
|------|----------------|
| `lib/admin-users.ts` | Tab id `mailings` / label **New Mailings**; in `DEFAULT_NON_ADMIN_TABS` |
| `app/admin/page.tsx` | Renders `AdminMailingsPanel` when `tab === 'mailings'` |

### Hooks to remove from *this* site after transfer

| Path | Change |
|------|--------|
| `app/api/contact/route.ts` | Remove `upsertProspectFromLead` |
| `app/api/booking/route.ts` | Remove `upsertProspectFromLead` |

Keep writing to `enquiries` unchanged so the marketing project can sync.

---

## 6. SendGrid configuration (marketing project)

1. **Mail Send** API key with mail send permission; set From email/name (authenticated domain).
2. **Event Webhook** →  
   `https://<marketing-app-host>/api/webhooks/sendgrid`  
   Enable at least: Delivered, Open, Click, Bounce, Dropped, Unsubscribe.  
   Include **custom args** so `campaign_id` / `contact_id` / `send_id` arrive on events.
3. Point unsubscribe links at the marketing app’s public origin (`NEXT_PUBLIC_SITE_URL` + `/unsubscribe`).

Website transactional mail (enquiry/booking confirmations) can stay on this project’s SendGrid setup; marketing campaigns should use the marketing project’s webhook URL so engagement lands in `mailingSends` there.

---

## 7. Behaviour checklist (parity when porting)

- [ ] Contacts: add / edit / delete / CSV upload (`contact`, `name`, `email`, `company`, `sector`)
- [ ] Status prospect ↔ client (manual)
- [ ] Region field (default NZ)
- [ ] Engagement flags: opened / clicked / has engaged / unsubscribed
- [ ] Campaign tags on contacts after send; filter “exclude already received campaign X”
- [ ] Audiences as first-class saved filters; campaigns only pick `audienceId`
- [ ] Audience preview count
- [ ] Campaign WYSIWYG + merge tags + unsubscribe footer
- [ ] Send + per-send log + campaign stats
- [ ] Contact drill-down activity history
- [ ] Public unsubscribe (token HMAC)
- [ ] Sync / import from website `enquiries` as prospects
- [ ] Do not re-subscribe or wipe client status on enquiry re-sync

---

## 8. Archiving New Mailings in this repo

After the marketing project is live and reading `enquiries`:

1. Remove or feature-flag the **New Mailings** admin tab (`mailings` in `ADMIN_TABS` + panel render).
2. Delete or move to `_archive/` the mailing-specific files listed in §5 (keep `enquiries` + contact/booking APIs).
3. Remove mailing-only env docs from `.env.example` if unused (`MAILINGS_UNSUBSCRIBE_SECRET`, mailing `NEXT_PUBLIC_SITE_URL` note) — keep SendGrid vars if transactional mail remains.
4. Leave SendGrid Event Webhook on the **marketing** host only.
5. Optionally migrate any existing `mailing*` documents from this Firestore into the marketing project’s Firestore (one-off export/import), then delete collections here when safe.
6. Keep this markdown (or a short pointer) so future work knows inquiries stay here and campaigns live elsewhere.

---

## 9. Quick reference — API surface

| Method | Path | Notes |
|--------|------|--------|
| GET/POST/PATCH/DELETE | `/api/admin/mailings/contacts` | `POST` also `{ action: 'upload', rows }` |
| GET/POST/PATCH/DELETE | `/api/admin/mailings/audiences` | `POST` `{ action: 'preview', filter \| audienceId }` |
| GET/POST/PATCH/DELETE | `/api/admin/mailings/campaigns` | `POST` `{ action: 'send', id }` |
| GET/POST | `/api/mailings/unsubscribe` | Token query / body |
| POST | `/api/webhooks/sendgrid` | Event array from SendGrid |
| GET | `/unsubscribe?token=` | Public page |

Admin APIs in this codebase follow the existing pattern: **UI-gated, no session token on the API**. Harden auth in the marketing project before production bulk send.

---

## 10. Related product decisions (from build)

1. One shared contact list with a **region** field (mostly NZ).
2. SendGrid for send + open/click tracking.
3. Audience = reusable filter; campaign selects audience.
4. Prospect ↔ client is manual (or external).
5. Inquiry/discovery leads become prospects; marketing project should own that sync going forward via website `enquiries`.
