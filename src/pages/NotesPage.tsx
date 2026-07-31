import { useEffect, useMemo, useState } from 'react'
import { ChevronDown, FileText, FolderOpen } from 'lucide-react'
import { Link, useParams } from 'react-router-dom'
import { useI18n } from '../i18n'
import { useNotes } from '../lib'
import type { Note } from '../types'
import { useCodeCopy } from '../useCodeCopy'

interface NoteGroup {
  order: number
  label: string
  notes: Note[]
}

export function NotesPage() {
  const { slug = '' } = useParams()
  const { t, formatDate, minutesRead } = useI18n()
  const query = useNotes()
  const contentRef = useCodeCopy()

  const groups = useMemo<NoteGroup[]>(() => {
    const grouped = new Map<number, NoteGroup>()
    query.data.forEach((note) => {
      const group = grouped.get(note.groupOrder)
      if (group) group.notes.push(note)
      else grouped.set(note.groupOrder, { order: note.groupOrder, label: note.group, notes: [note] })
    })
    return Array.from(grouped.values()).sort((a, b) => a.order - b.order)
  }, [query.data])

  const note = slug
    ? query.data.find((item) => item.slug === slug) ?? null
    : query.data[0] ?? null

  const [expanded, setExpanded] = useState<Set<number>>(
    () => new Set(groups.map((group) => group.order)),
  )

  useEffect(() => {
    if (!note) return
    setExpanded((current) => {
      if (current.has(note.groupOrder)) return current
      const next = new Set(current)
      next.add(note.groupOrder)
      return next
    })
    window.scrollTo({ top: 0 })
  }, [note])

  if (query.isError) return <div className="page-status">{t('notesError')}</div>
  if (!note) return <div className="page-status">{slug ? t('noteNotFound') : t('notesEmpty')}</div>

  return (
    <div className="page notes-page">
      <div className="notes-workspace">
        <aside className="notes-sidebar" aria-label={t('notesLibrary')}>
          <div className="notes-sidebar-title">
            <FolderOpen aria-hidden="true" />
            <span>{t('notesLibrary')}</span>
          </div>

          <div className="notes-groups">
            {groups.map((group) => {
              const isExpanded = expanded.has(group.order)
              return (
                <section className="notes-group" key={group.order}>
                  <button
                    className="notes-group-toggle"
                    type="button"
                    aria-expanded={isExpanded}
                    onClick={() => setExpanded((current) => {
                      const next = new Set(current)
                      if (next.has(group.order)) next.delete(group.order)
                      else next.add(group.order)
                      return next
                    })}
                  >
                    <span>{group.label}</span>
                    <ChevronDown className={isExpanded ? 'is-expanded' : ''} aria-hidden="true" />
                  </button>
                  {isExpanded ? (
                    <div className="notes-file-list">
                      {group.notes.map((item) => (
                        <Link
                          className={`notes-file${item.slug === note.slug ? ' active' : ''}`}
                          key={item.slug}
                          to={`/notes/${item.slug}`}
                          aria-current={item.slug === note.slug ? 'page' : undefined}
                        >
                          <FileText aria-hidden="true" />
                          <span>{item.title}</span>
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </section>
              )
            })}
          </div>
        </aside>

        <article className="note-reader">
          <header className="note-reader-head">
            <h1>{note.title}</h1>
            <div className="note-reader-meta">
              <time dateTime={note.date}>{formatDate(note.date)}</time>
              <span>·</span>
              <span>{minutesRead(note.readingMinutes)}</span>
            </div>
          </header>

          {note.coverUrl ? (
            <img className="note-reader-cover" src={note.coverUrl} alt={note.coverAlt} />
          ) : null}

          <div
            className="article-content note-reader-content"
            ref={contentRef}
            dangerouslySetInnerHTML={{ __html: note.html }}
          />
        </article>
      </div>
    </div>
  )
}
