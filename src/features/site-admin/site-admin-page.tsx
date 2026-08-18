import { useState } from 'react'
import { useAppData, useAppDataStore } from '../../data/app-data-context.ts'
import {
  countDemoRequestsByStatus,
  countryName,
  demoRequestName,
  sortDemoRequests,
} from '../../domain/demo-requests/index.ts'
import { DEMO_REQUEST_STATUSES } from '../../domain/types/index.ts'
import type {
  DemoRequest,
  DemoRequestStatus,
  SiteContent,
  SiteSolution,
  SiteTeamMember,
} from '../../domain/types/index.ts'
import { pickLanguage, useTranslation, type TranslationKey } from '../../i18n/index.ts'
import { useCurrentUser } from '../../app/session/use-current-user.ts'
import './site-admin.css'

/*
 * Website Administration (ARCHITECTURE.md §8.5).
 *
 * Super Administrator only, and deliberately separate from Risk
 * Administration: a Risk Administrator manages the CLIENT logo but never the
 * AIZEN public site.
 *
 * The editor is manifest-driven rather than 58 hand-written inputs — each
 * entry pairs the English field with its `Ka` counterpart, so a new content
 * field is one line here rather than a new form.
 */

type TextKey = {
  [K in keyof SiteContent]: SiteContent[K] extends string ? K : never
}[keyof SiteContent]

type ListKey = {
  [K in keyof SiteContent]: SiteContent[K] extends string[] ? K : never
}[keyof SiteContent]

interface FieldPair {
  en: TextKey
  ka?: TextKey
  /** Rendered as a textarea rather than a single-line input. */
  long?: boolean
}

interface ListPair {
  en: ListKey
  ka: ListKey
}

interface Group {
  id: string
  labelKey: TranslationKey
  fields: FieldPair[]
  lists?: ListPair[]
}

const GROUPS: Group[] = [
  {
    id: 'brand',
    labelKey: 'site.group.brand',
    fields: [
      { en: 'brandName' },
      { en: 'brandDescriptor', ka: 'brandDescriptorKa' },
    ],
  },
  {
    id: 'hero',
    labelKey: 'site.group.hero',
    fields: [
      { en: 'heroEyebrow', ka: 'heroEyebrowKa' },
      { en: 'heroTitle', ka: 'heroTitleKa', long: true },
      { en: 'heroDescription', ka: 'heroDescriptionKa', long: true },
      { en: 'heroPrimaryCta', ka: 'heroPrimaryCtaKa' },
      { en: 'heroSecondaryCta', ka: 'heroSecondaryCtaKa' },
    ],
  },
  {
    id: 'solutions',
    labelKey: 'site.group.solutions',
    fields: [
      { en: 'solutionsTitle', ka: 'solutionsTitleKa' },
      { en: 'solutionsDescription', ka: 'solutionsDescriptionKa', long: true },
    ],
  },
  {
    id: 'about',
    labelKey: 'site.group.about',
    fields: [
      { en: 'aboutTitle', ka: 'aboutTitleKa' },
      { en: 'aboutDescription', ka: 'aboutDescriptionKa', long: true },
      { en: 'aboutReachTitle', ka: 'aboutReachTitleKa' },
      { en: 'aboutReachDescription', ka: 'aboutReachDescriptionKa', long: true },
      { en: 'aboutPeopleTitle', ka: 'aboutPeopleTitleKa' },
      { en: 'aboutPeopleDescription', ka: 'aboutPeopleDescriptionKa', long: true },
      { en: 'aboutClientsTitle', ka: 'aboutClientsTitleKa' },
      { en: 'aboutClientsDescription', ka: 'aboutClientsDescriptionKa', long: true },
      { en: 'aboutVisionTitle', ka: 'aboutVisionTitleKa' },
      { en: 'aboutVisionDescription', ka: 'aboutVisionDescriptionKa', long: true },
    ],
    lists: [{ en: 'aboutHighlights', ka: 'aboutHighlightsKa' }],
  },
  {
    id: 'team',
    labelKey: 'site.group.team',
    fields: [
      { en: 'teamTitle', ka: 'teamTitleKa' },
      { en: 'teamDescription', ka: 'teamDescriptionKa', long: true },
    ],
  },
  {
    id: 'video',
    labelKey: 'site.group.video',
    fields: [
      { en: 'videoTitle', ka: 'videoTitleKa' },
      { en: 'videoDescription', ka: 'videoDescriptionKa', long: true },
      { en: 'videoUrl' },
    ],
    lists: [{ en: 'videoHighlights', ka: 'videoHighlightsKa' }],
  },
  {
    id: 'requestDemo',
    labelKey: 'site.group.requestDemo',
    fields: [
      { en: 'requestDemoEyebrow', ka: 'requestDemoEyebrowKa' },
      { en: 'requestDemoTitle', ka: 'requestDemoTitleKa', long: true },
      { en: 'requestDemoDescription', ka: 'requestDemoDescriptionKa', long: true },
      { en: 'requestDemoConsent', ka: 'requestDemoConsentKa', long: true },
      { en: 'requestDemoSuccess', ka: 'requestDemoSuccessKa', long: true },
    ],
    lists: [{ en: 'requestDemoHighlights', ka: 'requestDemoHighlightsKa' }],
  },
  {
    // Submissions, not content: read-only detail plus the handling status.
    id: 'requests',
    labelKey: 'site.group.requests',
    fields: [],
  },
  {
    id: 'footer',
    labelKey: 'site.group.footer',
    fields: [
      { en: 'contactEmail' },
      { en: 'contactPhone' },
      { en: 'footerText', ka: 'footerTextKa', long: true },
    ],
  },
]

/** Turns a camelCase field name into a readable label. */
function humanise(field: string): string {
  return field
    .replace(/Ka$/, '')
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (character) => character.toUpperCase())
    .trim()
}

export function SiteAdminPage() {
  const { t } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  const [draft, setDraft] = useState<SiteContent | null>(null)
  const [activeGroup, setActiveGroup] = useState('brand')
  const [saved, setSaved] = useState(false)

  if (!state || !user) return null
  const content = draft ?? state.siteContent

  const patch = (changes: Partial<SiteContent>) => {
    setSaved(false)
    setDraft({ ...content, ...changes })
  }

  const save = async () => {
    await store.update({
      mutate: (next) => {
        next.siteContent = { ...content, updatedAt: new Date().toISOString(), updatedBy: user.id }
      },
      audit: {
        actorId: user.id,
        action: 'site_content.updated',
        entityType: 'SiteContent',
        entityId: 'public-site',
        summary: 'Public website content updated',
      },
    })
    setDraft(null)
    setSaved(true)
  }

  const group = GROUPS.find((candidate) => candidate.id === activeGroup) ?? GROUPS[0]

  return (
    <section aria-labelledby="site-admin-title">
      <div className="admin-section__header">
        <h1 id="site-admin-title">{t('site.title')}</h1>
        <button type="button" onClick={() => void save()}>{t('action.save')}</button>
      </div>

      <p className="panel__meta">{t('site.intro')}</p>
      {saved ? <p className="admin-warning" role="status">{t('site.saved')}</p> : null}

      <div className="admin-layout">
        <nav className="admin-nav" aria-label={t('site.title')}>
          <ul>
            {GROUPS.map((candidate) => (
              <li key={candidate.id}>
                <button
                  type="button"
                  className="admin-nav__link"
                  aria-current={activeGroup === candidate.id ? 'page' : undefined}
                  onClick={() => { setActiveGroup(candidate.id) }}
                >
                  {t(candidate.labelKey)}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="admin-workspace">
          <h2>{t(group.labelKey)}</h2>

          <div className="site-fields">
            {group.fields.map((field) => (
              <div key={field.en} className="site-field">
                <label>
                  <span>
                    {humanise(field.en)} · {t('site.english')}
                  </span>
                  {field.long ? (
                    <textarea
                      value={content[field.en]}
                      onChange={(event) => { patch({ [field.en]: event.target.value } as Partial<SiteContent>) }}
                    />
                  ) : (
                    <input
                      value={content[field.en]}
                      onChange={(event) => { patch({ [field.en]: event.target.value } as Partial<SiteContent>) }}
                    />
                  )}
                </label>

                {field.ka ? (
                  <label>
                    <span>
                      {humanise(field.en)} · {t('site.georgian')}
                    </span>
                    {field.long ? (
                      <textarea
                        value={content[field.ka]}
                        onChange={(event) => { patch({ [field.ka as TextKey]: event.target.value } as Partial<SiteContent>) }}
                      />
                    ) : (
                      <input
                        value={content[field.ka]}
                        onChange={(event) => { patch({ [field.ka as TextKey]: event.target.value } as Partial<SiteContent>) }}
                      />
                    )}
                  </label>
                ) : null}
              </div>
            ))}

            {/* List fields edit as one item per line. */}
            {(group.lists ?? []).map((list) => (
              <div key={list.en} className="site-field">
                {([list.en, list.ka] as const).map((key, index) => (
                  <label key={key}>
                    <span>
                      {humanise(list.en)} · {t(index === 0 ? 'site.english' : 'site.georgian')}
                    </span>
                    <textarea
                      value={content[key].join('\n')}
                      onChange={(event) => {
                        patch({
                          [key]: event.target.value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0),
                        } as unknown as Partial<SiteContent>)
                      }}
                    />
                  </label>
                ))}
              </div>
            ))}
          </div>

          {activeGroup === 'solutions' ? (
            <SolutionsEditor
              solutions={content.solutions}
              onChange={(solutions) => { patch({ solutions }) }}
            />
          ) : null}

          {activeGroup === 'team' ? (
            <TeamEditor team={content.team} onChange={(team) => { patch({ team }) }} />
          ) : null}

          {activeGroup === 'requests' ? <DemoRequestsPanel /> : null}
        </div>
      </div>
    </section>
  )
}

// --- solutions --------------------------------------------------------------

function SolutionsEditor({
  solutions,
  onChange,
}: {
  solutions: readonly SiteSolution[]
  onChange: (solutions: SiteSolution[]) => void
}) {
  const { t } = useTranslation()

  const patch = (index: number, changes: Partial<SiteSolution>) => {
    const next = [...solutions]
    next[index] = { ...next[index], ...changes }
    onChange(next)
  }

  return (
    <ul className="site-list">
      {solutions.map((solution, index) => (
        <li key={solution.id} className="site-list__item">
          <label>
            <span>{t('site.member.name')} · {t('site.english')}</span>
            <input value={solution.name} onChange={(event) => { patch(index, { name: event.target.value }) }} />
          </label>
          <label>
            <span>{t('site.member.name')} · {t('site.georgian')}</span>
            <input value={solution.nameKa} onChange={(event) => { patch(index, { nameKa: event.target.value }) }} />
          </label>
          <label>
            <span>{t('site.solution.status')}</span>
            <select value={solution.status} onChange={(event) => { patch(index, { status: event.target.value }) }}>
              <option value="available">available</option>
              <option value="coming-soon">coming-soon</option>
            </select>
          </label>
          <label className="site-list__wide">
            <span>{t('site.solution.features')} · {t('site.english')}</span>
            <textarea
              value={solution.features.join('\n')}
              onChange={(event) => {
                patch(index, {
                  features: event.target.value.split('\n').map((line) => line.trim()).filter((line) => line.length > 0),
                })
              }}
            />
          </label>
        </li>
      ))}
    </ul>
  )
}

// --- team -------------------------------------------------------------------

function TeamEditor({
  team,
  onChange,
}: {
  team: readonly SiteTeamMember[]
  onChange: (team: SiteTeamMember[]) => void
}) {
  const { t } = useTranslation()

  const blank = (): SiteTeamMember => ({
    id: `member_${Date.now().toString(36)}`,
    name: '', nameKa: '', role: '', roleKa: '', bio: '', bioKa: '',
    photo: '', photoFocus: 'center', order: team.length + 1,
  })

  const patch = (index: number, changes: Partial<SiteTeamMember>) => {
    const next = [...team]
    next[index] = { ...next[index], ...changes }
    onChange(next)
  }

  const readPhoto = async (index: number, file: File) => {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => { resolve(String(reader.result)) }
      reader.onerror = () => { reject(new Error('read failed')) }
      reader.readAsDataURL(file)
    })
    patch(index, { photo: dataUrl })
  }

  return (
    <>
      <ul className="site-list">
        {team.map((member, index) => (
          <li key={member.id} className="site-list__item">
            <label>
              <span>{t('site.member.name')} · {t('site.english')}</span>
              <input value={member.name} onChange={(event) => { patch(index, { name: event.target.value }) }} />
            </label>
            <label>
              <span>{t('site.member.name')} · {t('site.georgian')}</span>
              <input value={member.nameKa} onChange={(event) => { patch(index, { nameKa: event.target.value }) }} />
            </label>
            <label>
              <span>{t('site.member.role')} · {t('site.english')}</span>
              <input value={member.role} onChange={(event) => { patch(index, { role: event.target.value }) }} />
            </label>
            <label>
              <span>{t('site.member.role')} · {t('site.georgian')}</span>
              <input value={member.roleKa} onChange={(event) => { patch(index, { roleKa: event.target.value }) }} />
            </label>
            <label className="site-list__wide">
              <span>{t('site.member.bio')} · {t('site.english')}</span>
              <textarea value={member.bio} onChange={(event) => { patch(index, { bio: event.target.value }) }} />
            </label>
            <label>
              <span>{t('site.member.photo')}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void readPhoto(index, file)
                }}
              />
            </label>
            {/* Crop control: the change request asked for image focus. */}
            <label>
              <span>{t('site.member.focus')}</span>
              <select value={member.photoFocus} onChange={(event) => { patch(index, { photoFocus: event.target.value }) }}>
                {['top', 'center', 'bottom', 'left', 'right'].map((focus) => (
                  <option key={focus} value={focus}>{focus}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => { onChange(team.filter((candidate) => candidate.id !== member.id)) }}
            >
              {t('editor.remove')}
            </button>
          </li>
        ))}
      </ul>

      <button type="button" onClick={() => { onChange([...team, blank()]) }}>
        {t('site.addTeamMember')}
      </button>
    </>
  )
}

// --- demo requests ----------------------------------------------------------

/*
 * The public intake queue.
 *
 * Read-only detail: nothing a visitor submitted can be edited here, because a
 * record of what someone actually sent is worth more than a tidied one. Only
 * the handling status moves, and it saves on its own through the same mutation
 * transaction with its own audit event — it belongs to a different record from
 * the site content the surrounding form edits.
 *
 * Requests are never deleted, for the same reason categories and users are
 * not: they are referenced by the audit trail (ARCHITECTURE.md §3.7).
 */
function DemoRequestsPanel() {
  const { t, language } = useTranslation()
  const { state } = useAppData()
  const store = useAppDataStore()
  const { user } = useCurrentUser()

  if (!state || !user) return null

  const requests = sortDemoRequests(state.demoRequests)
  const counts = countDemoRequestsByStatus(requests)

  const solutionName = (id: string): string => {
    const solution = state.siteContent.solutions.find((candidate) => candidate.id === id)
    return solution ? pickLanguage(solution.name, solution.nameKa, language) : id
  }

  const userName = (id: string): string =>
    state.users.find((candidate) => candidate.id === id)?.name ?? id

  const setStatus = async (request: DemoRequest, status: DemoRequestStatus) => {
    const handledAt = new Date().toISOString()

    await store.update({
      mutate: (next) => {
        const target = next.demoRequests.find((candidate) => candidate.id === request.id)
        if (!target) return
        target.status = status
        target.handledBy = user.id
        target.handledAt = handledAt
      },
      audit: {
        actorId: user.id,
        action: 'demo_request.status_changed',
        entityType: 'DemoRequest',
        entityId: request.id,
        summary: `Demo request from ${request.company || request.email} marked ${status}`,
        changes: [`status: ${request.status} → ${status}`],
      },
    })
  }

  if (requests.length === 0) {
    return <p className="panel__meta">{t('site.requests.empty')}</p>
  }

  return (
    <>
      <p className="panel__meta">
        {DEMO_REQUEST_STATUSES.map((status) => `${t(`demo.status.${status}`)}: ${String(counts[status])}`).join(' · ')}
      </p>
      <p className="panel__meta">{t('site.requests.statusHint')}</p>

      <ul className="site-list">
        {requests.map((request) => (
          <li key={request.id} className="site-list__item site-request">
            <div className="site-request__identity">
              <strong>{demoRequestName(request)}</strong>
              <small>
                {request.jobTitle} · {request.company}
              </small>
              <small>{countryName(request.country, language)}</small>
            </div>

            <div className="site-request__contact">
              <span>{t('site.requests.contact')}</span>
              <a href={`mailto:${request.email}`}>{request.email}</a>
              <a href={`tel:${request.phone.replace(/[^+\d]/g, '')}`}>{request.phone}</a>
            </div>

            <div className="site-request__meta">
              <span>{t('site.requests.submitted')}</span>
              {/* ISO, like every other timestamp the product shows. */}
              <time dateTime={request.submittedAt}>
                {request.submittedAt.slice(0, 16).replace('T', ' ')}
              </time>
              {request.handledAt ? (
                <small>
                  {t('site.requests.handled')}: {userName(request.handledBy)}
                </small>
              ) : null}
            </div>

            <div className="site-request__interest">
              <span>{t('site.requests.interest')}</span>
              <p>{request.solutionIds.map(solutionName).join(', ')}</p>
              {request.message ? (
                <p className="site-request__message">{request.message}</p>
              ) : null}
            </div>

            <label className="site-request__status">
              <span>{t('site.requests.status')}</span>
              <select
                value={request.status}
                onChange={(event) => {
                  void setStatus(request, event.target.value as DemoRequestStatus)
                }}
              >
                {DEMO_REQUEST_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(`demo.status.${status}`)}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
      </ul>
    </>
  )
}
