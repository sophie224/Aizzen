import { useEffect } from 'react'
import { useAppData } from '../../data/app-data-context.ts'
import { riskColorVariables } from '../../domain/risk-engine/contrast.ts'
import { RATING_LABELS } from '../../domain/types/enums.ts'

/*
 * Publishes the configured rating palette as CSS variables (CR-005 §3.1).
 *
 * The palette is administrator-configurable, so stylesheets must never hard-code
 * it. This writes `--risk-1..4` plus the computed `-on`, `-soft` and `-border`
 * companions onto the document root whenever the saved matrix changes, which
 * makes a colour edit in Administration propagate to every surface at once.
 *
 * Renders nothing — it is a side-effect component, mounted once by the shell.
 */
export function RiskPalette() {
  const { state } = useAppData()
  const colors = state?.matrix.colors

  useEffect(() => {
    if (!colors) return

    const root = document.documentElement
    const variables = riskColorVariables(colors, RATING_LABELS)

    for (const [name, value] of Object.entries(variables)) {
      root.style.setProperty(name, value)
    }

    return () => {
      for (const name of Object.keys(variables)) {
        root.style.removeProperty(name)
      }
    }
  }, [colors])

  return null
}
