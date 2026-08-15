import type { Dashboard, ReportTemplate, SiteContent } from '../../domain/types/index.ts'
import siteContentSeed from './site-content.json'

/**
 * Default dashboard. Exercises a representative spread of the seven widget
 * types; the last remaining dashboard cannot be deleted, so one must always
 * exist (ARCHITECTURE.md §8.3).
 */
export function createSeedDashboards(): Dashboard[] {
  return [
    {
      id: 'dash_overview',
      nameEn: 'Enterprise Risk Overview',
      nameKa: 'საწარმოს რისკების მიმოხილვა',
      descriptionEn: 'Exposure, remediation delivery and trend across the enterprise.',
      descriptionKa: 'ექსპოზიცია, სარემედიაციო მიწოდება და ტრენდი საწარმოს მასშტაბით.',
      accentColor: '#1A2151',
      shared: true,
      filters: {},
      widgets: [
        {
          id: 'wid_total',
          type: 'metric',
          titleEn: 'Total risks',
          titleKa: 'სულ რისკები',
          accentColor: '#1A2151',
          backgroundColor: '#FFFFFF',
          span: 3,
          metric: 'totalRisks',
        },
        {
          id: 'wid_significant',
          type: 'metric',
          titleEn: 'Significant residual',
          titleKa: 'მნიშვნელოვანი ნარჩენი',
          // Brand navy, not the Significant rating colour: a widget accent is
          // administrator-configurable presentation, whereas rating colours
          // are read from the matrix. Reusing the hex would couple the two.
          accentColor: '#1A2151',
          backgroundColor: '#FFFFFF',
          span: 3,
          metric: 'significantResidual',
        },
        {
          id: 'wid_overdue',
          type: 'metric',
          titleEn: 'Overdue actions',
          titleKa: 'ვადაგადაცილებული ქმედებები',
          accentColor: '#1A2151',
          backgroundColor: '#FFFFFF',
          span: 3,
          metric: 'overdueActions',
        },
        {
          id: 'wid_emerging',
          type: 'metric',
          titleEn: 'Emerging risks',
          titleKa: 'წარმოქმნადი რისკები',
          accentColor: '#0D1128',
          backgroundColor: '#FFFFFF',
          span: 3,
          metric: 'emergingRisks',
        },
        {
          id: 'wid_heatmap',
          type: 'heatmap',
          titleEn: 'Residual heatmap',
          titleKa: 'ნარჩენი რისკის თბური რუკა',
          accentColor: '#1A2151',
          backgroundColor: '#FFFFFF',
          span: 6,
          scoreBasis: 'residual',
        },
        {
          id: 'wid_category',
          type: 'distribution',
          titleEn: 'Risks by category',
          titleKa: 'რისკები კატეგორიების მიხედვით',
          accentColor: '#1A2151',
          backgroundColor: '#FFFFFF',
          span: 6,
          grouping: 'category',
        },
        {
          id: 'wid_top',
          type: 'topRisks',
          titleEn: 'Top residual risks',
          titleKa: 'უმაღლესი ნარჩენი რისკები',
          accentColor: '#1A2151',
          backgroundColor: '#FFFFFF',
          span: 6,
          scoreBasis: 'residual',
          limit: 10,
        },
        {
          id: 'wid_actions',
          type: 'actionProgress',
          titleEn: 'Action plan progress',
          titleKa: 'ქმედებების გეგმის პროგრესი',
          accentColor: '#1A2151',
          backgroundColor: '#FFFFFF',
          span: 6,
        },
      ],
    },
  ]
}

/**
 * Default report template, using all three section types
 * (ARCHITECTURE.md §8.4). A compact register section must always retain at
 * least one column.
 */
export function createSeedReportTemplates(): ReportTemplate[] {
  return [
    {
      id: 'rpt_board_pack',
      nameEn: 'Board Risk Pack',
      nameKa: 'საბჭოს რისკების პაკეტი',
      descriptionEn: 'Executive summary, enterprise dashboard and the priority risk register.',
      descriptionKa: 'აღმასრულებელი შეჯამება, საწარმოს დაფა და პრიორიტეტული რისკების რეესტრი.',
      sections: [
        {
          id: 'sec_summary',
          type: 'openText',
          titleEn: 'Executive summary',
          titleKa: 'აღმასრულებელი შეჯამება',
          bodyEn: '',
          bodyKa: '',
        },
        {
          id: 'sec_dashboard',
          type: 'dashboard',
          dashboardId: 'dash_overview',
          filters: {},
        },
        {
          id: 'sec_register',
          type: 'compactRegister',
          titleEn: 'Priority risk register',
          titleKa: 'პრიორიტეტული რისკების რეესტრი',
          columns: ['ref', 'title', 'category', 'businessUnit', 'riskOwner', 'residual', 'status'],
          filters: { residualRating: 'Significant' },
        },
      ],
    },
  ]
}

/**
 * Public AIZEN website content (ARCHITECTURE.md §8.5).
 *
 * Extracted verbatim from the as-built v7 build rather than reinvented, so the
 * public site keeps every field it renders today. Editable only through
 * Website Administration by a Super Administrator.
 */
export function createSeedSiteContent(): SiteContent {
  return structuredClone(siteContentSeed) as SiteContent
}
