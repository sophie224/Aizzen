import type { ModuleName, PermissionLevel, PermissionSet, Role } from '../../domain/types/index.ts'
import { MODULE_NAMES } from '../../domain/types/index.ts'

/**
 * Builds a full permission set, defaulting any unlisted module to `none`.
 * Every role must carry a level for all eight modules.
 */
function permissionSet(overrides: Partial<Record<ModuleName, PermissionLevel>>): PermissionSet {
  const set = {} as PermissionSet
  for (const module of MODULE_NAMES) {
    set[module] = overrides[module] ?? 'none'
  }
  return set
}

/**
 * The seven built-in roles and their module permissions
 * (ARCHITECTURE.md §5.2). Effective permission across multiple roles is the
 * maximum per module, computed at runtime — never stored.
 */
export function createSeedRoles(): Role[] {
  return [
    {
      id: 'role_super_admin',
      nameEn: 'Super Administrator',
      nameKa: 'სუპერ ადმინისტრატორი',
      description:
        'Manages the public AIZEN website and has full access to the Risk Management solution.',
      system: true,
      permissions: permissionSet({
        dashboard: 'edit',
        register: 'edit',
        risks: 'edit',
        controls: 'edit',
        actions: 'edit',
        reports: 'edit',
        audit: 'edit',
        administration: 'edit',
      }),
    },
    {
      id: 'role_admin',
      nameEn: 'Administrator',
      nameKa: 'ადმინისტრატორი',
      description: 'Full access to all modules, master data, users, roles, matrix and settings.',
      system: true,
      permissions: permissionSet({
        dashboard: 'edit',
        register: 'edit',
        risks: 'edit',
        controls: 'edit',
        actions: 'edit',
        reports: 'edit',
        audit: 'edit',
        administration: 'edit',
      }),
    },
    {
      id: 'role_risk_manager',
      nameEn: 'Risk Manager',
      nameKa: 'რისკების მენეჯერი',
      description:
        'Administers the risk module and may manage all risk records, assessments, owners, controls and actions.',
      system: true,
      permissions: permissionSet({
        dashboard: 'read',
        register: 'edit',
        risks: 'edit',
        controls: 'edit',
        actions: 'edit',
        reports: 'edit',
        audit: 'read',
      }),
    },
    {
      id: 'role_risk_owner',
      nameEn: 'Risk Owner',
      nameKa: 'რისკის მფლობელი',
      description:
        'Owns assigned risks and may update assigned risk assessments, controls and remediation plans.',
      system: true,
      permissions: permissionSet({
        dashboard: 'read',
        register: 'read',
        risks: 'edit',
        controls: 'edit',
        actions: 'edit',
        reports: 'read',
        audit: 'read',
      }),
    },
    {
      id: 'role_control_owner',
      nameEn: 'Control Owner',
      nameKa: 'კონტროლის მფლობელი',
      description:
        'Maintains controls assigned to them and records design/operating effectiveness information.',
      system: true,
      permissions: permissionSet({
        dashboard: 'read',
        register: 'read',
        risks: 'read',
        controls: 'edit',
        actions: 'read',
        audit: 'read',
      }),
    },
    {
      id: 'role_action_owner',
      nameEn: 'Action Owner',
      nameKa: 'ქმედების მფლობელი',
      description: 'Updates assigned remediation actions, progress and delivery dates.',
      system: true,
      permissions: permissionSet({
        dashboard: 'read',
        register: 'read',
        risks: 'read',
        controls: 'read',
        actions: 'edit',
        audit: 'read',
      }),
    },
    {
      id: 'role_auditor',
      nameEn: 'Auditor',
      nameKa: 'აუდიტორი',
      description: 'Read-only access across the platform.',
      system: true,
      permissions: permissionSet({
        dashboard: 'read',
        register: 'read',
        risks: 'read',
        controls: 'read',
        actions: 'read',
        reports: 'read',
        audit: 'read',
        administration: 'none',
      }),
    },
  ]
}
