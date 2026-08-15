import { useAppData } from '../../data/app-data-context.ts'
import { pickLanguage, useTranslation } from '../../i18n/index.ts'
import { BrandLockup } from './public-header.tsx'

/** Public website footer. Brand, the administrator-managed strapline, notice. */
export function PublicFooter() {
  const { t, language } = useTranslation()
  const { state } = useAppData()

  const content = state?.siteContent
  const brandName = content?.brandName ?? 'AIZEN'
  const descriptor = pickLanguage(
    content?.brandDescriptor ?? '',
    content?.brandDescriptorKa ?? '',
    language,
  )
  const strapline = pickLanguage(content?.footerText ?? '', content?.footerTextKa ?? '', language)

  return (
    <footer className="aizen-public-footer">
      <div className="aizen-public-brand">
        <BrandLockup brandName={brandName} descriptor={descriptor} />
      </div>
      <p>{strapline}</p>
      <span>
        {t('public.footer.rights')} · {t('public.footer.localOnly')}
      </span>
    </footer>
  )
}
