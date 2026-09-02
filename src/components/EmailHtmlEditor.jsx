import { useState } from 'react'
import { EditorContent, useEditor, useEditorState } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import Placeholder from '@tiptap/extension-placeholder'
import { TextStyleKit } from '@tiptap/extension-text-style/text-style-kit'
import {
  DEFAULT_TEMPLATE_HTML,
  MERGE_TAGS,
  SAMPLE_MERGE_CONTACT,
  emailCtaButtonHtml,
  normalizeEmailLayout,
  normalizeUnsubscribeHrefs,
} from '../emailHtml.js'
import { mailingUnsubscribeHrefTemplate } from '../mailingOrigin.js'
import EmailFileLinkModal from './EmailFileLinkModal.jsx'
import EmailPreviewFrame from './EmailPreviewFrame.jsx'

const FONTS = [
  { label: 'Calibri', value: 'Calibri, Arial, sans-serif' },
  { label: 'Arial', value: 'Arial, Helvetica, sans-serif' },
  { label: 'Georgia', value: 'Georgia, serif' },
  { label: 'Times', value: '"Times New Roman", Times, serif' },
  { label: 'Verdana', value: 'Verdana, Geneva, sans-serif' },
  { label: 'Trebuchet', value: '"Trebuchet MS", sans-serif' },
  { label: 'Courier', value: '"Courier New", Courier, monospace' },
]

const DEFAULT_FONT = FONTS[0]
const DEFAULT_FONT_SIZE = '16px'
const HEADING_FONT_SIZES = { 1: '26px', 2: '22px', 3: '18px' }
const FONT_SIZES = ['12px', '14px', '16px', '18px', '20px', '22px', '24px', '26px', '28px', '32px']
const MIXED_VALUE = '__mixed__'

function normalizeFontFamily(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const compact = raw.toLowerCase().replace(/['"]/g, '').replace(/\s+/g, ' ')
  const first = compact.split(',')[0].trim()
  const match = FONTS.find((font) => {
    const stacked = font.value.toLowerCase().replace(/['"]/g, '').replace(/\s+/g, ' ')
    return stacked === compact || stacked.split(',')[0].trim() === first || font.label.toLowerCase() === first
  })
  return match ? match.value : raw
}

function normalizeFontSize(value) {
  if (value == null || value === '') return ''
  const raw = String(value).trim().toLowerCase()
  if (/^\d+(\.\d+)?$/.test(raw)) return `${parseFloat(raw)}px`
  const px = raw.match(/^(\d+(?:\.\d+)?)px$/)
  if (px) return `${parseFloat(px[1])}px`
  const pt = raw.match(/^(\d+(?:\.\d+)?)pt$/)
  if (pt) return `${Math.round((parseFloat(pt[1]) * 96) / 72)}px`
  return String(value).trim()
}

function headingFontSize(level) {
  return HEADING_FONT_SIZES[level] || DEFAULT_FONT_SIZE
}

function fontLabelFor(value) {
  const matched = FONTS.find((font) => font.value === value)
  if (matched) return matched.label
  return String(value || '').split(',')[0].replace(/['"]/g, '').trim() || DEFAULT_FONT.label
}

function effectiveStyleForText(node, parent) {
  const mark = node.marks?.find((item) => item.type.name === 'textStyle')
  const fontFamily = normalizeFontFamily(mark?.attrs?.fontFamily) || DEFAULT_FONT.value
  const explicitSize = normalizeFontSize(mark?.attrs?.fontSize)
  const fontSize =
    explicitSize ||
    (parent?.type.name === 'heading' ? headingFontSize(parent.attrs.level) : DEFAULT_FONT_SIZE)
  return { fontFamily, fontSize }
}

function resolveSelectionTextStyle(editor) {
  const fallback = {
    fontFamily: DEFAULT_FONT.value,
    fontSize: DEFAULT_FONT_SIZE,
    mixedFont: false,
    mixedSize: false,
  }
  if (!editor) return fallback

  const { from, to, empty } = editor.state.selection
  if (empty) {
    const $from = editor.state.selection.$from
    const marks = editor.state.storedMarks || $from.marks()
    const textStyle = marks.find((mark) => mark.type.name === 'textStyle')
    const parent = $from.parent
    return {
      fontFamily: normalizeFontFamily(textStyle?.attrs?.fontFamily) || DEFAULT_FONT.value,
      fontSize:
        normalizeFontSize(textStyle?.attrs?.fontSize) ||
        (parent?.type.name === 'heading' ? headingFontSize(parent.attrs.level) : DEFAULT_FONT_SIZE),
      mixedFont: false,
      mixedSize: false,
    }
  }

  const fonts = new Set()
  const sizes = new Set()
  editor.state.doc.nodesBetween(from, to, (node, _pos, parent) => {
    if (!node.isText || !node.text) return
    const style = effectiveStyleForText(node, parent)
    fonts.add(style.fontFamily)
    sizes.add(style.fontSize)
  })

  if (fonts.size === 0 && sizes.size === 0) {
    const attrs = editor.getAttributes('textStyle')
    const parent = editor.state.selection.$from.parent
    return {
      fontFamily: normalizeFontFamily(attrs.fontFamily) || DEFAULT_FONT.value,
      fontSize:
        normalizeFontSize(attrs.fontSize) ||
        (parent?.type.name === 'heading' ? headingFontSize(parent.attrs.level) : DEFAULT_FONT_SIZE),
      mixedFont: false,
      mixedSize: false,
    }
  }

  return {
    fontFamily: fonts.size === 1 ? [...fonts][0] : MIXED_VALUE,
    fontSize: sizes.size === 1 ? [...sizes][0] : MIXED_VALUE,
    mixedFont: fonts.size > 1,
    mixedSize: sizes.size > 1,
  }
}

function asHexColor(value, fallback) {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : fallback
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function normalizeHref(raw) {
  const href = String(raw || '').trim()
  if (!href) return ''
  if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#') || href.startsWith('/')) return href
  return `https://${href}`
}

function compactSelectedLines(editor) {
  if (!editor) return

  const blocksIn = (from, to) => {
    const blocks = []
    editor.state.doc.nodesBetween(from, to, (node, pos) => {
      if (node.isTextblock) {
        blocks.push({
          pos,
          size: node.nodeSize,
          empty: node.content.size === 0,
        })
        return false
      }
    })
    return blocks
  }

  const { empty } = editor.state.selection
  if (empty) {
    editor.chain().focus().setHardBreak().run()
    return
  }

  let from = editor.state.selection.from
  let to = editor.state.selection.to
  for (let i = 0; i < 80; i += 1) {
    const blocks = blocksIn(from, to)
    if (blocks.length < 2) break
    const last = blocks[blocks.length - 1]
    const before = editor.state.doc.content.size
    if (last.empty) {
      editor.chain().focus().deleteRange({ from: last.pos, to: last.pos + last.size }).run()
    } else {
      editor.chain().focus().setTextSelection(last.pos + 1).setHardBreak().joinBackward().run()
    }
    const after = editor.state.doc.content.size
    to = Math.max(from + 1, to - (before - after))
  }
}

function ToolBtn({ active, onClick, disabled, children, title }) {
  return (
    <button
      type="button"
      title={title}
      className={`email-editor-btn${active ? ' email-editor-btn--active' : ''}`}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export default function EmailHtmlEditor({
  html,
  onChange,
  contentKey = '',
  subject = '',
  fromName = '',
  fromEmail = '',
  layout = 'outlook',
  placeholder = 'Write your email…',
}) {
  const emailLayout = normalizeEmailLayout(layout)
  const outlookLayout = emailLayout === 'outlook'
  const initialHtml = normalizeUnsubscribeHrefs(html || DEFAULT_TEMPLATE_HTML)
  const [sourceMode, setSourceMode] = useState(false)
  const [source, setSource] = useState(initialHtml)
  const [liveHtml, setLiveHtml] = useState(initialHtml)
  const [samplePreview, setSamplePreview] = useState(true)
  const [fileModalOpen, setFileModalOpen] = useState(false)
  const [fileLinkDefaultLabel, setFileLinkDefaultLabel] = useState('')

  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        codeBlock: false,
        code: false,
        link: {
          openOnClick: false,
          defaultProtocol: 'https',
          HTMLAttributes: {
            rel: 'noopener noreferrer',
            target: '_blank',
          },
        },
      }),
      TextStyleKit,
      TextAlign.configure({ types: ['heading', 'paragraph'] }),
      Image.configure({
        inline: false,
        allowBase64: false,
        HTMLAttributes: {
          style: 'max-width:100%;height:auto;border:0;display:block;',
        },
      }),
      Placeholder.configure({ placeholder }),
    ],
    content: normalizeUnsubscribeHrefs(html || DEFAULT_TEMPLATE_HTML),
    editorProps: {
      attributes: {
        class: 'email-editor-prose',
      },
    },
    onUpdate: ({ editor: instance }) => {
      const next = instance.getHTML()
      setLiveHtml(next)
      setSource(next)
      onChange?.(next)
    },
  }, [contentKey])

  function applySource() {
    if (!editor) return
    editor.commands.setContent(source || '', { emitUpdate: false })
    onChange?.(source || '')
    setSourceMode(false)
  }

  function insertLink() {
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    const selectedText = editor.state.doc.textBetween(from, to, ' ')
    const previous = editor.getAttributes('link').href || 'https://'
    const url = window.prompt('Link URL', previous)
    if (url === null) return
    if (!url.trim()) {
      editor.chain().focus().setTextSelection({ from, to }).unsetLink().run()
      return
    }
    const href = normalizeHref(url)
    if (empty) {
      editor
        .chain()
        .focus()
        .setTextSelection(from)
        .insertContent(`<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`)
        .run()
      return
    }
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .extendMarkRange('link')
      .setLink({ href })
      .run()
    if (!selectedText.trim()) {
      editor.chain().focus().insertContent(`<a href="${escapeHtml(href)}">${escapeHtml(href)}</a>`).run()
    }
  }

  function insertImage() {
    if (!editor) return
    const src = window.prompt('Image URL (public https:// link)', 'https://')
    if (!src?.trim()) return
    const alt = window.prompt('Alt text (shown if the image is blocked)', '') || ''
    editor.chain().focus().setImage({ src: src.trim(), alt }).run()
  }

  function insertButton() {
    if (!editor) return
    const label = window.prompt('Button label', 'Learn more')
    if (label === null) return
    const href = window.prompt('Button URL', 'https://')
    if (href === null) return
    editor
      .chain()
      .focus()
      .insertContent(emailCtaButtonHtml({ label: label.trim() || 'Learn more', href: href.trim() || 'https://' }))
      .run()
  }

  function openFileModal() {
    if (!editor) return
    const { from, to } = editor.state.selection
    setFileLinkDefaultLabel(editor.state.doc.textBetween(from, to, ' ').trim())
    setFileModalOpen(true)
  }

  function insertFileLink({ href, label, asButton }) {
    const safeHref = String(href || '').trim()
    const safeLabel = String(label || '').trim() || 'Download'
    if (!safeHref) return
    const html = asButton && !outlookLayout
      ? emailCtaButtonHtml({ label: safeLabel, href: safeHref })
      : `<a href="${escapeHtml(safeHref)}">${escapeHtml(safeLabel)}</a>`
    if (sourceMode) {
      const next = `${source || ''}${html}`
      setSource(next)
      editor?.commands.setContent(next, { emitUpdate: false })
      setLiveHtml(next)
      onChange?.(next)
      setFileModalOpen(false)
      return
    }
    editor?.chain().focus().insertContent(html).run()
    setFileModalOpen(false)
  }

  const previewHtml = liveHtml || html || ''
  const previewContact = samplePreview
    ? SAMPLE_MERGE_CONTACT
    : { name: '{{name}}', email: '{{email}}', company: '{{company}}', contact: '{{contact}}' }

  const textStyle = useEditorState({
    editor,
    selector: ({ editor: instance }) => resolveSelectionTextStyle(instance),
  }) || {
    fontFamily: DEFAULT_FONT.value,
    fontSize: DEFAULT_FONT_SIZE,
    mixedFont: false,
    mixedSize: false,
  }
  const fontFamily = textStyle.fontFamily
  const fontSize = textStyle.fontSize
  const mixedFont = textStyle.mixedFont
  const mixedSize = textStyle.mixedSize
  const color = asHexColor(editor?.getAttributes('textStyle').color, '#222222')
  const bg = asHexColor(editor?.getAttributes('textStyle').backgroundColor, '#ffffff')
  const fontOptions =
    fontFamily && fontFamily !== MIXED_VALUE && !FONTS.some((font) => font.value === fontFamily)
      ? [...FONTS, { label: fontLabelFor(fontFamily), value: fontFamily }]
      : FONTS
  const sizeOptions =
    fontSize && fontSize !== MIXED_VALUE && !FONT_SIZES.includes(fontSize)
      ? [...FONT_SIZES, fontSize].sort((a, b) => parseFloat(a) - parseFloat(b))
      : FONT_SIZES
  const styleReadout = [
    mixedFont ? 'Mixed fonts' : fontLabelFor(fontFamily),
    mixedSize ? 'Mixed sizes' : String(fontSize).replace(/px$/i, '') + 'px',
  ].join(' · ')

  return (
    <div className="email-editor">
      <div className="email-editor-toolbar" role="toolbar" aria-label="Email formatting">
        <ToolBtn title="Undo" disabled={!editor} onClick={() => editor.chain().focus().undo().run()}>
          Undo
        </ToolBtn>
        <ToolBtn title="Redo" disabled={!editor} onClick={() => editor.chain().focus().redo().run()}>
          Redo
        </ToolBtn>
        <span className="email-editor-sep" />
        <select
          className="email-editor-select"
          aria-label="Font"
          title={styleReadout}
          disabled={!editor}
          value={mixedFont ? MIXED_VALUE : fontFamily}
          onChange={(e) => {
            const value = e.target.value
            if (!value || value === MIXED_VALUE) return
            editor.chain().focus().setFontFamily(value).run()
          }}
        >
          {mixedFont ? <option value={MIXED_VALUE}>Mixed</option> : null}
          {fontOptions.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
        </select>
        <select
          className="email-editor-select email-editor-select--size"
          aria-label="Font size"
          title={styleReadout}
          disabled={!editor}
          value={mixedSize ? MIXED_VALUE : fontSize}
          onChange={(e) => {
            const value = e.target.value
            if (!value || value === MIXED_VALUE) return
            editor.chain().focus().setFontSize(value).run()
          }}
        >
          {mixedSize ? <option value={MIXED_VALUE}>Mixed</option> : null}
          {sizeOptions.map((size) => (
            <option key={size} value={size}>
              {String(size).replace(/px$/i, '')}
            </option>
          ))}
        </select>
        <span className="email-editor-style-readout" aria-live="polite">
          {styleReadout}
        </span>
        <label className="email-editor-color" title="Text colour">
          <span>A</span>
          <input
            type="color"
            disabled={!editor}
            value={color}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <label className="email-editor-color" title="Highlight">
          <span>H</span>
          <input
            type="color"
            disabled={!editor}
            value={bg}
            onChange={(e) => editor.chain().focus().setBackgroundColor(e.target.value).run()}
          />
        </label>
        <span className="email-editor-sep" />
        <ToolBtn title="Bold" active={editor?.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          B
        </ToolBtn>
        <ToolBtn
          title="Italic"
          active={editor?.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
        >
          I
        </ToolBtn>
        <ToolBtn
          title="Underline"
          active={editor?.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
        >
          U
        </ToolBtn>
        <ToolBtn
          title="Strikethrough"
          active={editor?.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
        >
          S
        </ToolBtn>
        <span className="email-editor-sep" />
        <ToolBtn
          title="Heading 1"
          active={editor?.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
        >
          H1
        </ToolBtn>
        <ToolBtn
          title="Heading 2"
          active={editor?.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </ToolBtn>
        <ToolBtn
          title="Heading 3"
          active={editor?.isActive('heading', { level: 3 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </ToolBtn>
        <ToolBtn
          title="Paragraph"
          active={editor?.isActive('paragraph') && !editor?.isActive('heading')}
          onClick={() => editor.chain().focus().setParagraph().run()}
        >
          ¶
        </ToolBtn>
        <ToolBtn
          title="Remove space between selected lines. Shift+Enter inserts a single line break."
          onClick={() => compactSelectedLines(editor)}
        >
          Tight
        </ToolBtn>
        <span className="email-editor-sep" />
        <ToolBtn
          title="Align left"
          active={editor?.isActive({ textAlign: 'left' })}
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
        >
          Left
        </ToolBtn>
        <ToolBtn
          title="Align centre"
          active={editor?.isActive({ textAlign: 'center' })}
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
        >
          Centre
        </ToolBtn>
        <ToolBtn
          title="Align right"
          active={editor?.isActive({ textAlign: 'right' })}
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
        >
          Right
        </ToolBtn>
        <span className="email-editor-sep" />
        <ToolBtn
          title="Bullet list"
          active={editor?.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
        >
          List
        </ToolBtn>
        <ToolBtn
          title="Numbered list"
          active={editor?.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
        >
          1.
        </ToolBtn>
        <ToolBtn title="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          —
        </ToolBtn>
        <span className="email-editor-sep" />
        <ToolBtn title="Link" active={editor?.isActive('link')} onClick={insertLink}>
          Link
        </ToolBtn>
        <ToolBtn title="Upload a document to Firebase Storage and insert a named link" onClick={openFileModal}>
          File
        </ToolBtn>
        {outlookLayout ? null : (
          <>
            <ToolBtn title="Image from URL" onClick={insertImage}>
              Image
            </ToolBtn>
            <ToolBtn title="Insert a table-based button (email-safe)" onClick={insertButton}>
              Button
            </ToolBtn>
          </>
        )}
        <select
          className="email-editor-select"
          aria-label="Insert merge tag"
          disabled={!editor}
          value=""
          onChange={(e) => {
            const key = e.target.value
            if (!key) return
            if (key === 'unsubscribe') {
              const href = mailingUnsubscribeHrefTemplate()
              editor
                .chain()
                .focus()
                .insertContent(`<a href="${href}" class="email-unsubscribe">unsubscribe</a>`)
                .run()
              return
            }
            editor.chain().focus().insertContent(`{{${key}}}`).run()
          }}
        >
          <option value="">Merge tag…</option>
          {MERGE_TAGS.map((tag) => (
            <option key={tag.key} value={tag.key}>
              {`{{${tag.key}}}`} — {tag.label}
            </option>
          ))}
        </select>
        <ToolBtn title="Clear formatting" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
          Clear
        </ToolBtn>
        <span className="email-editor-sep" />
        <ToolBtn
          title="Edit HTML source"
          active={sourceMode}
          onClick={() => {
            if (sourceMode) applySource()
            else {
              setSource(editor?.getHTML() || html || '')
              setSourceMode(true)
            }
          }}
        >
          HTML
        </ToolBtn>
      </div>

      <div className="email-editor-split">
        <div className={`email-editor-pane${outlookLayout ? ' email-editor-pane--outlook' : ''}`}>
          <div className="email-editor-pane-label">Editor</div>
          {sourceMode ? (
            <textarea
              className="email-editor-source"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              onBlur={applySource}
              spellCheck={false}
            />
          ) : (
            <EditorContent editor={editor} className="email-editor-canvas" />
          )}
        </div>
        <div className="email-editor-pane">
          <div className="email-editor-pane-head">
            <div className="email-editor-pane-label">
              {outlookLayout ? 'Inbox preview (Outlook message)' : 'Inbox preview (600px card)'}
            </div>
            <label className="email-editor-preview-toggle">
              <input
                type="checkbox"
                checked={samplePreview}
                onChange={(e) => setSamplePreview(e.target.checked)}
              />
              Sample merge data
            </label>
          </div>
          <EmailPreviewFrame
            html={previewHtml}
            subject={subject}
            fromName={fromName}
            fromEmail={fromEmail}
            contact={previewContact}
            layout={emailLayout}
          />
        </div>
      </div>
      <EmailFileLinkModal
        open={fileModalOpen}
        defaultLabel={fileLinkDefaultLabel}
        onCancel={() => setFileModalOpen(false)}
        onInserted={insertFileLink}
      />
    </div>
  )
}
