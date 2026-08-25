import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it } from 'vitest'
import { LocalStorageRepository } from '../../data/local-storage-repository.ts'
import { MemoryStorage, renderApp, SEEDED } from '../../app/test-harness.tsx'
import { resetSessionStore } from '../../app/session/session-store.ts'
import type { AppState, RegisterControl, Risk } from '../../domain/types/index.ts'

/*
 * Control Register and Control Deficiency Register (CR-2026).
 *
 * These cover the change request's own QA plan where it is automatable:
 * navigation placement (QA-01), manual create and sequential IDs (QA-02),
 * framework import (QA-03), risk linkage and status propagation (QA-06,
 * QA-07), configurable scales (QA-08), custom columns (QA-10), column order
 * (QA-11), findings (QA-12), OU visibility (QA-14) and — the one that matters
 * most — no regression to the Risk Register (QA-15).
 */

const STATE_KEY = 'erm-risk-management-v3-state'

afterEach(() => {
  resetSessionStore()
})

function makeControl(overrides: Partial<RegisterControl> = {}): RegisterControl {
  return {
    id: 'ctl_seed_1',
    ref: '0001',
    source: 'Manual',
    frameworkId: null,
    frameworkVersion: '',
    businessUnitId: 'bu_technology',
    name: 'Quarterly privileged access review',
    objective: 'Privileged access is reviewed every quarter',
    ownerId: 'usr_control',
    effectiveness: 'effective',
    maturity: 'defined',
    assurance: 'medium',
    evidence: [],
    custom: {},
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

function makeRisk(overrides: Partial<Risk> = {}): Risk {
  return {
    id: 'risk_1',
    ref: 'TECH-001',
    title: 'Legacy fragility',
    type: 'Current',
    categoryId: 'cat_16',
    businessUnitId: 'bu_technology',
    riskOwnerId: 'usr_owner',
    originDate: '2026-01-01',
    reviewDate: '2027-01-01',
    targetDate: '2026-07-01',
    status: 'In Progress',
    responseType: 'Mitigate',
    outlook: 'Stable',
    description: '',
    cause: 'c',
    event: 'e',
    consequence: 'q',
    statusNarrative: '',
    inherent: { impact: 4, likelihood: 4 },
    residual: { impact: 3, likelihood: 3 },
    target: { impact: 2, likelihood: 2 },
    controls: [],
    actions: [],
    acceptance: { rationale: '', initiatorId: '', approverId: '', approvalDate: '', validUntil: '', reviewDate: '' },
    custom: {},
    history: [],
    audit: [],
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  }
}

/** Seeds storage through the real repository, so migration runs as in life. */
async function seed(mutate: (state: AppState) => void = () => undefined): Promise<MemoryStorage> {
  const storage = new MemoryStorage()
  const repository = new LocalStorageRepository({ storage })
  const state = await repository.getState()
  mutate(state)
  await repository.saveState(state)
  return storage
}

function persisted(storage: MemoryStorage): AppState {
  return JSON.parse(storage.map.get(STATE_KEY) ?? '{}') as AppState
}

describe('navigation (QA-01)', () => {
  it('places Control Register under Risk Register and before Reports', async () => {
    renderApp({ route: '/dashboard', signedInAs: SEEDED.admin })

    const nav = await screen.findByRole('navigation', { name: 'Primary navigation' })
    const links = within(nav)
      .getAllByRole('link')
      .map((link) => link.textContent)

    const register = links.findIndex((label) => label === 'Risk Register')
    const controls = links.findIndex((label) => label === 'Control Register')
    const deficiencies = links.findIndex((label) => label === 'Control Deficiencies')
    const reports = links.findIndex((label) => label === 'Reports')

    expect(register).toBeGreaterThanOrEqual(0)
    expect(controls).toBe(register + 1)
    expect(deficiencies).toBe(controls + 1)
    expect(reports).toBe(deficiencies + 1)
  })
})

describe('manual create (QA-02)', () => {
  it('issues Control IDs sequentially from 0001 and lists the control', async () => {
    const storage = await seed()
    renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add control' }))

    const dialog = within(screen.getByRole('dialog'))
    await user.selectOptions(dialog.getByRole('combobox', { name: /Organization/ }), 'bu_technology')
    await user.type(dialog.getByRole('textbox', { name: /Control name/ }), 'Access review')
    await user.click(dialog.getByRole('button', { name: 'Save' }))

    expect(await screen.findByRole('button', { name: 'Access review' })).toBeInTheDocument()
    await waitFor(() => {
      expect(persisted(storage).controls).toHaveLength(1)
    })
    expect(persisted(storage).controls[0].ref).toBe('0001')

    // Every write lands in the audit trail (SEC-10).
    expect(persisted(storage).auditEvents[0].action).toBe('control.created')
  })
})

describe('framework import (QA-03)', () => {
  it('creates controls that keep the framework identifier', async () => {
    const storage = await seed()
    renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Import from framework' }))
    await user.selectOptions(screen.getByRole('combobox', { name: /Import into organization/ }), 'bu_technology')
    await user.click(screen.getByRole('button', { name: 'Import controls' }))

    await waitFor(() => {
      expect(persisted(storage).controls.length).toBeGreaterThan(50)
    })

    const imported = persisted(storage).controls
    expect(imported.some((control) => control.ref === 'A.5.1')).toBe(true)
    expect(imported.every((control) => control.businessUnitId === 'bu_technology')).toBe(true)
    expect(imported[0].source).toBe('Framework')
  })
})

describe('OU visibility (QA-14, SEC-01)', () => {
  it('hides a control filed against another organisational unit', async () => {
    const storage = await seed((state) => {
      state.controls = [
        makeControl({ id: 'ctl_tech', ref: '0001', name: 'Technology control', businessUnitId: 'bu_technology' }),
        makeControl({ id: 'ctl_fin', ref: '0002', name: 'Finance control', businessUnitId: 'bu_finance' }),
      ]
    })

    // The seeded Control Owner is scoped to Security, a child of Technology.
    renderApp({ route: '/controls', signedInAs: SEEDED.controlOwner, storage })

    expect(await screen.findByRole('heading', { name: 'Control Register', level: 1 })).toBeInTheDocument()
    expect(screen.queryByText('Finance control')).not.toBeInTheDocument()
  })

  it('shows an administrator every unit', async () => {
    const storage = await seed((state) => {
      state.controls = [
        makeControl({ id: 'ctl_tech', ref: '0001', name: 'Technology control' }),
        makeControl({ id: 'ctl_fin', ref: '0002', name: 'Finance control', businessUnitId: 'bu_finance' }),
      ]
    })
    renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })

    expect(await screen.findByText('Technology control')).toBeInTheDocument()
    expect(screen.getByText('Finance control')).toBeInTheDocument()
  })
})

describe('configurable scales (QA-08)', () => {
  it('renders a renamed level everywhere without rewriting the control', async () => {
    const storage = await seed((state) => {
      state.controls = [makeControl()]
      state.controlConfig.effectiveness = state.controlConfig.effectiveness.map((level) =>
        level.key === 'effective' ? { ...level, labelEn: 'Fully operating' } : level,
      )
    })
    renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })

    const grid = within(await screen.findByRole('table', { name: 'Control Register' }))
    /*
     * The cell is editable, so the renamed level appears twice: once as the
     * badge's visible text and once as the selected option. Both must show the
     * new name — and the stored value must still be the stable key.
     */
    expect(grid.getAllByText('Fully operating').length).toBeGreaterThan(0)
    expect(grid.getByRole('combobox', { name: /Effectiveness/ })).toHaveValue('effective')
    expect(persisted(storage).controls[0].effectiveness).toBe('effective')
  })
})

describe('inline scale editing from the register', () => {
  it('changes effectiveness in the grid, audits it, and touches nothing else', async () => {
    const storage = await seed((state) => {
      state.controls = [makeControl()]
    })
    renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })
    const user = userEvent.setup()

    const grid = within(await screen.findByRole('table', { name: 'Control Register' }))
    await user.selectOptions(grid.getByRole('combobox', { name: /Effectiveness/ }), 'ineffective')

    await waitFor(() => {
      expect(persisted(storage).controls[0].effectiveness).toBe('ineffective')
    })

    const saved = persisted(storage).controls[0]
    // Exactly one field moved; the rest came back from the stored record.
    expect(saved.name).toBe('Quarterly privileged access review')
    expect(saved.maturity).toBe('defined')
    expect(saved.assurance).toBe('medium')
    expect(saved.ownerId).toBe('usr_control')

    const event = persisted(storage).auditEvents[0]
    expect(event.action).toBe('control.updated')
    expect(event.entityId).toBe('ctl_seed_1')
    expect(event.changes).toEqual(['effectiveness'])

    // The save is confirmed quietly, in place (§10).
    expect(await screen.findByRole('status')).toHaveTextContent(/Saved/)
  })

  it('offers maturity and assurance in the grid too', async () => {
    const storage = await seed((state) => {
      state.controls = [makeControl()]
    })
    renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })

    const grid = within(await screen.findByRole('table', { name: 'Control Register' }))
    expect(grid.getByRole('combobox', { name: /Maturity/ })).toBeInTheDocument()
    expect(grid.getByRole('combobox', { name: /Assurance level/ })).toBeInTheDocument()
  })

  it('shows a read-only badge to a user who may not edit the control', async () => {
    const storage = await seed((state) => {
      state.controls = [makeControl()]
      // Auditor: read everywhere, edit nothing.
      state.roles = state.roles.map((role) =>
        role.id === 'role_auditor' ? { ...role, permissions: { ...role.permissions, controls: 'read' } } : role,
      )
    })
    renderApp({ route: '/controls', signedInAs: SEEDED.auditor, storage })

    const grid = within(await screen.findByRole('table', { name: 'Control Register' }))
    expect(grid.getByText('Quarterly privileged access review')).toBeInTheDocument()
    expect(grid.queryByRole('combobox')).not.toBeInTheDocument()
    // The value is still readable — it is the control that is missing, not the data.
    expect(grid.getByText('Effective')).toBeInTheDocument()
  })

  it('classifies a finding from the deficiency grid', async () => {
    const storage = await seed((state) => {
      state.controls = [makeControl()]
      state.controlDeficiencies = [
        {
          id: 'cdf_1', ref: '0001', businessUnitId: 'bu_technology', controlId: 'ctl_seed_1',
          description: 'Evidence not retained', classification: 'observation',
          remediationOwnerId: '', remediationDescription: '', targetDate: '',
          custom: {}, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
        },
      ]
    })
    renderApp({ route: '/control-deficiencies', signedInAs: SEEDED.admin, storage })
    const user = userEvent.setup()

    const grid = within(await screen.findByRole('table', { name: 'Control Deficiency Register' }))
    await user.selectOptions(grid.getByRole('combobox', { name: /Classification/ }), 'critical')

    await waitFor(() => {
      expect(persisted(storage).controlDeficiencies[0].classification).toBe('critical')
    })
    expect(persisted(storage).controlDeficiencies[0].description).toBe('Evidence not retained')
    expect(persisted(storage).auditEvents[0].changes).toEqual(['classification'])
  })
})

describe('custom columns (QA-10)', () => {
  it('shows a ticked column on the risk side and an unticked one only in the register', async () => {
    const storage = await seed((state) => {
      state.risks = [makeRisk()]
      state.controls = [makeControl({ custom: { ccol_shared: 'Group IT', ccol_internal: 'Internal only' } })]
      state.controlRiskLinks = [
        { id: 'clk_1', riskId: 'risk_1', controlId: 'ctl_seed_1', createdAt: '2026-01-01T00:00:00.000Z', actorId: 'usr_admin' },
      ]
      state.controlConfig.customColumns = [
        { id: 'ccol_shared', register: 'control', labelEn: 'Owning department', labelKa: '', type: 'text', options: [], showInRiskView: true, active: true },
        { id: 'ccol_internal', register: 'control', labelEn: 'Internal note', labelKa: '', type: 'text', options: [], showInRiskView: false, active: true },
      ]
    })

    const view = renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })
    expect(await screen.findByText('Group IT')).toBeInTheDocument()
    expect(screen.getByText('Internal only')).toBeInTheDocument()
    view.unmount()
    resetSessionStore()

    renderApp({ route: '/risks/risk_1', signedInAs: SEEDED.admin, storage })
    await userEvent.click(await screen.findByRole('tab', { name: /Controls/ }))

    expect(await screen.findByRole('columnheader', { name: 'Owning department' })).toBeInTheDocument()
    expect(screen.queryByRole('columnheader', { name: 'Internal note' })).not.toBeInTheDocument()
  })
})

describe('risk linkage (QA-06, QA-07)', () => {
  it('shows a linked control on the risk, and follows the control when it changes', async () => {
    const storage = await seed((state) => {
      state.risks = [makeRisk()]
      state.controls = [makeControl()]
      state.controlRiskLinks = [
        { id: 'clk_1', riskId: 'risk_1', controlId: 'ctl_seed_1', createdAt: '2026-01-01T00:00:00.000Z', actorId: 'usr_admin' },
      ]
    })

    const view = renderApp({ route: '/risks/risk_1', signedInAs: SEEDED.admin, storage })
    await userEvent.click(await screen.findByRole('tab', { name: /Controls/ }))

    const panel = within(await screen.findByRole('region', { name: 'Linked controls' }))
    expect(panel.getByText('Quarterly privileged access review')).toBeInTheDocument()
    expect(panel.getByText('Effective')).toBeInTheDocument()
    view.unmount()
    resetSessionStore()

    // The register is edited, NOT the risk…
    const second = renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })
    await userEvent.click(await screen.findByRole('button', { name: 'Quarterly privileged access review' }))
    const editor = within(screen.getByRole('dialog'))
    await userEvent.selectOptions(editor.getByRole('combobox', { name: /Effectiveness/ }), 'ineffective')
    await userEvent.click(editor.getByRole('button', { name: 'Save' }))
    await waitFor(() => {
      expect(persisted(storage).controls[0].effectiveness).toBe('ineffective')
    })
    second.unmount()
    resetSessionStore()

    // …and the risk shows the new value without having been touched.
    renderApp({ route: '/risks/risk_1', signedInAs: SEEDED.admin, storage })
    await userEvent.click(await screen.findByRole('tab', { name: /Controls/ }))
    const after = within(await screen.findByRole('region', { name: 'Linked controls' }))
    expect(after.getByText('Ineffective')).toBeInTheDocument()
    expect(persisted(storage).risks[0].updatedAt).toBe('2026-01-01T00:00:00.000Z')
  })
})

describe('deficiency register (QA-12, FR-CD-03, FR-CD-04)', () => {
  it('maps a finding to a control by type-ahead and numbers it from 0001', async () => {
    const storage = await seed((state) => {
      state.controls = [makeControl()]
    })
    renderApp({ route: '/control-deficiencies', signedInAs: SEEDED.admin, storage })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('button', { name: 'Add finding' }))
    await user.type(screen.getByRole('searchbox', { name: /Control mapping/ }), 'privileged')
    await user.click(await screen.findByRole('button', { name: /Quarterly privileged access review/ }))
    await user.type(
      screen.getByRole('textbox', { name: /Finding description/ }),
      'Review evidence was not retained',
    )
    await user.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted(storage).controlDeficiencies).toHaveLength(1)
    })

    const finding = persisted(storage).controlDeficiencies[0]
    expect(finding.ref).toBe('0001')
    expect(finding.controlId).toBe('ctl_seed_1')
    // A finding follows its control's organisational unit (FR-CD-07).
    expect(finding.businessUnitId).toBe('bu_technology')
  })
})

describe('column order (QA-11)', () => {
  it('saves an order for one user and leaves another user unaffected', async () => {
    const storage = await seed((state) => {
      state.controls = [makeControl()]
    })

    const view = renderApp({ route: '/controls', signedInAs: SEEDED.admin, storage })
    await screen.findByText('Quarterly privileged access review')
    await userEvent.click(screen.getAllByRole('button', { name: /Move column right: Control ID/ })[0])

    await waitFor(() => {
      expect(persisted(storage).controlColumnPreferences).toHaveLength(1)
    })
    const preference = persisted(storage).controlColumnPreferences[0]
    expect(preference.userId).toBe('usr_admin')
    expect(preference.columnIds[0]).toBe('name')
    view.unmount()
    resetSessionStore()

    // Another user still gets the default order.
    renderApp({ route: '/controls', signedInAs: SEEDED.riskManager, storage })
    const headers = await screen.findAllByRole('columnheader')
    expect(headers[0].textContent).toContain('Control ID')
  })
})

describe('no regression to the Risk Register (QA-15)', () => {
  it('saves a risk with no controls linked, adding no link and no link audit event', async () => {
    const storage = await seed((state) => {
      state.risks = [makeRisk()]
    })
    renderApp({ route: '/register', signedInAs: SEEDED.admin, storage })
    const user = userEvent.setup()

    await user.click(await screen.findByRole('link', { name: /Legacy fragility/ }))
    await user.click((await screen.findAllByRole('button', { name: /Edit/ }))[0])
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).not.toBeNull()
    })
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(persisted(storage).auditEvents.length).toBeGreaterThan(0)
    })
    expect(persisted(storage).controlRiskLinks).toEqual([])
    expect(
      persisted(storage).auditEvents.some((event) => event.action === 'control.risk_links_updated'),
    ).toBe(false)
  })
})
