import type {
  AttributeType,
  EntityStatus,
  Language,
  PermissionSet,
  RatingLabel,
  ScaleValue,
} from './enums.ts'

/**
 * Two-level risk classification. Seeded from the Risk Category Library 2026
 * (5 Level-1 groups, 38 Level-2 categories) and editable thereafter.
 *
 * Used categories are deactivated, never hard-deleted — old risks keep the
 * reference and historical reporting still resolves the label
 * (ARCHITECTURE.md §3.7).
 */
export interface Category {
  id: string
  /** Broad group, e.g. Strategic / Operational / Financial. Required. */
  level1En: string
  level1Ka: string
  /** Specific category. Required. */
  level2En: string
  level2Ka: string
  active: boolean
}

/**
 * OU-style hierarchy node. Serves both as reporting structure and as the
 * record-level access scope (ARCHITECTURE.md §5.4).
 */
export interface BusinessUnit {
  id: string
  /** Unique uppercase code; also the risk reference prefix. */
  code: string
  nameEn: string
  nameKa: string
  /** `null` marks a root node. */
  parentId: string | null
  active: boolean
}

/**
 * Dynamic risk-schema extension. Values live on `risk.custom`, keyed by this
 * `id`. Deactivating hides the field but never deletes stored values
 * (ARCHITECTURE.md §3.7).
 */
export interface CustomAttribute {
  /** Stable key into `risk.custom`. */
  id: string
  labelEn: string
  labelKa: string
  type: AttributeType
  /** Values for `select`; trimmed, empties removed. Empty for other types. */
  options: string[]
  active: boolean
  /** Offers the attribute as a selectable Risk Register column. */
  showInRegister: boolean
}

export interface Role {
  id: string
  nameEn: string
  nameKa: string
  description: string
  /**
   * Marks the seven built-in roles. Phase 2 must protect Super Administrator
   * and core security roles from privilege-escalation edits
   * (ARCHITECTURE.md §8.5).
   */
  system: boolean
  permissions: PermissionSet
}

/**
 * Directory entry used for login, ownership pickers, role permissions and
 * Business Unit scope. Users are deactivated, never deleted — they are
 * referenced by ownership, controls, actions and audit (ARCHITECTURE.md §3.7).
 */
export interface User {
  id: string
  name: string
  title: string
  /** Login identifier; matched case-insensitively after normalisation. */
  email: string
  /**
   * Phase 1 demo credential only, stored in plain text. Phase 2 replaces this
   * with SSO / Google identity linking — see `googleSub` (ARCHITECTURE.md §6).
   */
  password: string
  status: EntityStatus
  /** At least one role required. */
  roleIds: string[]
  /** At least one DIRECT scope required; descendants are inherited, not stored. */
  businessUnitIds: string[]
  /**
   * Google's stable subject identifier, stored after an administrator-created
   * account is linked on first successful Google sign-in (ARCHITECTURE.md §6.2).
   */
  googleSub?: string
}

/** One of the 25 configured matrix cells. */
export interface MatrixCell {
  impact: ScaleValue
  likelihood: ScaleValue
  rating: RatingLabel
}

/** Bilingual label pair. */
export interface LocalisedLabel {
  en: string
  ka: string
}

/** A configurable point on the impact scale (CR-003). */
export interface ImpactLabel extends LocalisedLabel {
  /** When this level applies. Optional, shown as guidance and as a tooltip. */
  descriptionEn: string
  descriptionKa: string
}

export interface LikelihoodLabel extends ImpactLabel {
  /**
   * Percentage band over the horizon, e.g. 36–65. BOTH ends are null when the
   * organisation expresses likelihood as text only ("Once in 10 years").
   */
  percentFrom: number | null
  percentTo: number | null
  /** Free text shown instead of, or after, the percentage band. */
  textEn: string
  textKa: string
}

/**
 * One rating level.
 *
 * `key` is the STABLE identifier — it is what cells, filters, saved views and
 * exports are keyed by, so renaming a level never invalidates stored data
 * (CR-003). Colour lives in `RatingMatrix.colors`, keyed by the same key, so
 * there is exactly one place a colour is stored.
 */
export interface RatingLevel {
  key: RatingLabel
  nameEn: string
  nameKa: string
  /** Display order, lowest severity first. */
  order: number
}

/**
 * The 5×5 rating matrix — the single tenant-wide configuration every matrix,
 * axis label, rating badge and guidance panel reads from (CR-003).
 *
 * Rating is resolved by EXACT CELL, never by score band, so the same score may
 * carry different ratings in different cells (ARCHITECTURE.md §7). Score stays
 * Impact × Likelihood and no label change can affect it.
 */
export interface RatingMatrix {
  /**
   * Bumped on every saved configuration. Assessment snapshots record the
   * version they were taken against, so history stays readable after a change.
   */
  version: number
  /** The word used for the scale itself, default "Rating". */
  scaleNameEn: string
  scaleNameKa: string
  /** All 25 cells. Migration repairs the set if any are missing. */
  cells: MatrixCell[]
  /** Display names for the four levels, keyed by their stable key. */
  levels: RatingLevel[]
  colors: Record<RatingLabel, string>
  impactLabels: Record<ScaleValue, ImpactLabel>
  likelihoodLabels: Record<ScaleValue, LikelihoodLabel>
}

/** An archived configuration, kept so historical assessments stay readable. */
export interface MatrixVersion {
  version: number
  savedAt: string
  matrix: RatingMatrix
}

/** Client company logo shown top-right; base64 data URL in Phase 1. */
export interface Branding {
  clientLogo: string | null
}

/**
 * SAML configuration draft. Phase 1 stores it but performs no real
 * authentication (ARCHITECTURE.md §6.3).
 */
export interface SsoConfig {
  enabled: boolean
  providerName: string
  entityId: string
  metadataUrl: string
  acsUrl: string
  emailAttribute: string
  roleAttribute: string
  /** Newline-separated `Group=Role` pairs. */
  roleMappings: string
}

/** A solution card on the public site. */
export interface SiteSolution {
  id: string
  name: string
  nameKa: string
  description: string
  descriptionKa: string
  /** `available` renders a live link; `coming-soon` is presented as planned. */
  status: string
  route: string
  accentColor: string
  order: number
  features: string[]
  featuresKa: string[]
}

/** A team member on the About page. */
export interface SiteTeamMember {
  id: string
  name: string
  nameKa: string
  role: string
  roleKa: string
  bio: string
  bioKa: string
  /** Base64 data URL in Phase 1. */
  photo: string
  /** CSS object-position, so an administrator can re-crop the portrait. */
  photoFocus: string
  order: number
}

/**
 * Public AIZEN website content (ARCHITECTURE.md §8.5).
 *
 * Editable ONLY through Website Administration by a Super Administrator — it
 * sits outside the module permission matrix, and a Risk Administrator cannot
 * reach it.
 *
 * Shape taken from the as-built v7 build so the public site keeps every field
 * it renders today. Bilingual fields follow the `<field>` / `<field>Ka`
 * convention rather than `En` / `Ka`, which is what v7 used here.
 */
export interface SiteContent {
  brandName: string
  brandDescriptor: string
  brandDescriptorKa: string

  heroEyebrow: string
  heroEyebrowKa: string
  heroTitle: string
  heroTitleKa: string
  heroDescription: string
  heroDescriptionKa: string
  heroPrimaryCta: string
  heroPrimaryCtaKa: string
  heroSecondaryCta: string
  heroSecondaryCtaKa: string

  solutionsTitle: string
  solutionsTitleKa: string
  solutionsDescription: string
  solutionsDescriptionKa: string

  aboutTitle: string
  aboutTitleKa: string
  aboutDescription: string
  aboutDescriptionKa: string
  aboutReachTitle: string
  aboutReachTitleKa: string
  aboutReachDescription: string
  aboutReachDescriptionKa: string
  aboutPeopleTitle: string
  aboutPeopleTitleKa: string
  aboutPeopleDescription: string
  aboutPeopleDescriptionKa: string
  aboutClientsTitle: string
  aboutClientsTitleKa: string
  aboutClientsDescription: string
  aboutClientsDescriptionKa: string
  aboutVisionTitle: string
  aboutVisionTitleKa: string
  aboutVisionDescription: string
  aboutVisionDescriptionKa: string
  aboutHighlights: string[]
  aboutHighlightsKa: string[]

  teamTitle: string
  teamTitleKa: string
  teamDescription: string
  teamDescriptionKa: string
  team: SiteTeamMember[]

  videoTitle: string
  videoTitleKa: string
  videoDescription: string
  videoDescriptionKa: string
  videoHighlights: string[]
  videoHighlightsKa: string[]
  videoUrl: string
  /** Base64 data URL for an uploaded demo clip. */
  videoData: string

  contactEmail: string
  footerText: string
  footerTextKa: string

  solutions: SiteSolution[]

  updatedAt: string
  updatedBy: string
}

/** Session-local, non-authoritative UI preferences. */
export interface SessionPreferences {
  language: Language
  currentUserId: string | null
}
