import type { BusinessUnit, CustomAttribute, User } from '../../domain/types/index.ts'

/**
 * OU-style Business Unit tree (ARCHITECTURE.md §5.4):
 *
 *   Enterprise
 *   ├── Technology Division
 *   │   ├── IT Operations Department
 *   │   └── Information Security
 *   ├── Finance
 *   ├── Legal, Risk & Compliance
 *   └── People
 *
 * The Technology subtree is the fixture the scope tests rely on: a user
 * scoped to Information Security must see neither the Technology Division
 * parent nor the IT Operations sibling.
 */
export function createSeedBusinessUnits(): BusinessUnit[] {
  return [
    { id: 'bu_enterprise', code: 'ENT', nameEn: 'Enterprise', nameKa: 'საწარმო', parentId: null, active: true },
    {
      id: 'bu_technology',
      code: 'TECH',
      nameEn: 'Technology Division',
      nameKa: 'ტექნოლოგიების დივიზია',
      parentId: 'bu_enterprise',
      active: true,
    },
    {
      id: 'bu_operations',
      code: 'OPS',
      nameEn: 'IT Operations Department',
      nameKa: 'IT ოპერაციების დეპარტამენტი',
      parentId: 'bu_technology',
      active: true,
    },
    {
      id: 'bu_security',
      code: 'SEC',
      nameEn: 'Information Security',
      nameKa: 'ინფორმაციული უსაფრთხოება',
      parentId: 'bu_technology',
      active: true,
    },
    { id: 'bu_finance', code: 'FIN', nameEn: 'Finance', nameKa: 'ფინანსები', parentId: 'bu_enterprise', active: true },
    {
      id: 'bu_legal',
      code: 'LRC',
      nameEn: 'Legal, Risk & Compliance',
      nameKa: 'იურიდიული, რისკები და შესაბამისობა',
      parentId: 'bu_enterprise',
      active: true,
    },
    { id: 'bu_people', code: 'PPL', nameEn: 'People', nameKa: 'ადამიანური რესურსები', parentId: 'bu_enterprise', active: true },
  ]
}

/**
 * Demo directory. Passwords are demo-only and stored in plain text — a known,
 * documented Phase 1 limitation replaced by SSO / Google identity linking in
 * M15 (ARCHITECTURE.md §6.1, §11).
 *
 * The three administrator accounts follow the PRD test-user list (p. 5), which
 * takes precedence over the legacy v7 build's addresses.
 */
export function createSeedUsers(): User[] {
  return [
    {
      id: 'usr_super_admin',
      name: 'AIZEN Super Admin',
      title: 'Platform Owner',
      email: 'superadmin@aizen.local',
      password: 'Aizen#2026',
      status: 'Active',
      roleIds: ['role_super_admin', 'role_admin'],
      businessUnitIds: ['bu_enterprise'],
    },
    {
      id: 'usr_admin',
      name: 'ERM Administrator',
      title: 'Platform Administrator',
      email: 'admin@erm.local',
      password: 'Admin#2026',
      status: 'Active',
      roleIds: ['role_admin'],
      businessUnitIds: ['bu_enterprise'],
    },
    {
      id: 'usr_admin_sp',
      name: 'S. Pkhikidze',
      title: 'Administration',
      email: 's.pkhikidze@aizzen.com',
      password: 'Admin#2026',
      status: 'Active',
      roleIds: ['role_admin'],
      businessUnitIds: ['bu_enterprise'],
    },
    {
      id: 'usr_admin_db',
      name: 'D. Baghdavadze',
      title: 'Administration',
      email: 'd.baghdavadze@aizzen.com',
      password: 'Admin#2026',
      status: 'Active',
      roleIds: ['role_admin'],
      businessUnitIds: ['bu_enterprise'],
    },
    {
      id: 'usr_manager',
      name: 'Risk Manager',
      title: 'Risk Manager',
      email: 'risk.manager@erm.local',
      password: 'Test#2026',
      status: 'Active',
      roleIds: ['role_risk_manager'],
      businessUnitIds: ['bu_enterprise'],
    },
    {
      id: 'usr_owner',
      name: 'Nino Kapanadze',
      title: 'Technology Risk Owner',
      email: 'risk.owner@erm.local',
      password: 'Owner#2026',
      status: 'Active',
      roleIds: ['role_risk_owner'],
      businessUnitIds: ['bu_technology'],
    },
    {
      id: 'usr_control',
      name: 'Giorgi Maisuradze',
      title: 'Security Control Owner',
      email: 'control.owner@erm.local',
      password: 'Control#2026',
      status: 'Active',
      roleIds: ['role_control_owner'],
      businessUnitIds: ['bu_security'],
    },
    {
      id: 'usr_action',
      name: 'Mariam Lomidze',
      title: 'Remediation Lead',
      email: 'action.owner@erm.local',
      password: 'Action#2026',
      status: 'Active',
      roleIds: ['role_action_owner'],
      businessUnitIds: ['bu_enterprise'],
    },
    {
      id: 'usr_auditor',
      name: 'Internal Auditor',
      title: 'Internal Audit',
      email: 'auditor@erm.local',
      password: 'Audit#2026',
      status: 'Active',
      roleIds: ['role_auditor'],
      businessUnitIds: ['bu_enterprise'],
    },
  ]
}

/** Demonstrates all the attribute behaviours: select options, and showInRegister. */
export function createSeedCustomAttributes(): CustomAttribute[] {
  return [
    {
      id: 'attr_appetite',
      labelEn: 'Appetite status',
      labelKa: 'აპეტიტის სტატუსი',
      type: 'select',
      options: ['Within Appetite', 'Watch Trigger', 'Limit'],
      active: true,
      showInRegister: true,
    },
    {
      id: 'attr_kri',
      labelEn: 'Primary KRI',
      labelKa: 'ძირითადი KRI',
      type: 'text',
      options: [],
      active: true,
      showInRegister: false,
    },
    {
      id: 'attr_review_cycle',
      labelEn: 'Review cycle',
      labelKa: 'გადახედვის ციკლი',
      type: 'select',
      options: ['Monthly', 'Quarterly', 'Bi-annual', 'Annual'],
      active: true,
      showInRegister: false,
    },
  ]
}
