import type { ControlFrameworkId } from '../types/index.ts'

/*
 * Framework control libraries (FR-CR-02).
 *
 * Versioned seed PACKAGES, exactly as the change request requires: the data
 * lives in one place, carries a package version, and a future update to a
 * framework is itself a controlled change rather than an edit scattered across
 * the UI. An imported control keeps the framework's own identifier as its
 * Control ID and therefore never consumes a system sequence number.
 *
 * Each package is a starter set of the framework's control identifiers and
 * titles. Objectives are stated generically from the title so the register is
 * usable immediately; organisations refine the wording, and extend a package
 * through the bulk upload, without a code change.
 */

export interface FrameworkControlSeed {
  /** The framework's own identifier — becomes the Control ID. */
  uid: string
  name: string
  objective: string
}

export interface FrameworkPackage {
  id: ControlFrameworkId
  labelEn: string
  labelKa: string
  /** Package version, bumped whenever the seed content changes. */
  version: string
  /** What the identifiers refer to, shown on the import screen. */
  sourceNote: string
  controls: FrameworkControlSeed[]
}

/** Builds seeds from `[uid, title]` pairs with a shared objective phrasing. */
function seeds(rows: ReadonlyArray<readonly [string, string]>, phrasing: string): FrameworkControlSeed[] {
  return rows.map(([uid, name]) => ({
    uid,
    name,
    objective: phrasing.replace('{name}', name.charAt(0).toLowerCase() + name.slice(1)),
  }))
}

const ISO_27001_ROWS = [
  ['A.5.1', 'Policies for information security'],
  ['A.5.2', 'Information security roles and responsibilities'],
  ['A.5.3', 'Segregation of duties'],
  ['A.5.4', 'Management responsibilities'],
  ['A.5.5', 'Contact with authorities'],
  ['A.5.6', 'Contact with special interest groups'],
  ['A.5.7', 'Threat intelligence'],
  ['A.5.8', 'Information security in project management'],
  ['A.5.9', 'Inventory of information and other associated assets'],
  ['A.5.10', 'Acceptable use of information and other associated assets'],
  ['A.5.11', 'Return of assets'],
  ['A.5.12', 'Classification of information'],
  ['A.5.13', 'Labelling of information'],
  ['A.5.14', 'Information transfer'],
  ['A.5.15', 'Access control'],
  ['A.5.16', 'Identity management'],
  ['A.5.17', 'Authentication information'],
  ['A.5.18', 'Access rights'],
  ['A.5.19', 'Information security in supplier relationships'],
  ['A.5.20', 'Addressing information security within supplier agreements'],
  ['A.5.21', 'Managing information security in the ICT supply chain'],
  ['A.5.22', 'Monitoring, review and change management of supplier services'],
  ['A.5.23', 'Information security for use of cloud services'],
  ['A.5.24', 'Information security incident management planning and preparation'],
  ['A.5.25', 'Assessment and decision on information security events'],
  ['A.5.26', 'Response to information security incidents'],
  ['A.5.27', 'Learning from information security incidents'],
  ['A.5.28', 'Collection of evidence'],
  ['A.5.29', 'Information security during disruption'],
  ['A.5.30', 'ICT readiness for business continuity'],
  ['A.5.31', 'Legal, statutory, regulatory and contractual requirements'],
  ['A.5.32', 'Intellectual property rights'],
  ['A.5.33', 'Protection of records'],
  ['A.5.34', 'Privacy and protection of personally identifiable information'],
  ['A.5.35', 'Independent review of information security'],
  ['A.5.36', 'Compliance with policies, rules and standards for information security'],
  ['A.5.37', 'Documented operating procedures'],
  ['A.6.1', 'Screening'],
  ['A.6.2', 'Terms and conditions of employment'],
  ['A.6.3', 'Information security awareness, education and training'],
  ['A.6.4', 'Disciplinary process'],
  ['A.6.5', 'Responsibilities after termination or change of employment'],
  ['A.6.6', 'Confidentiality or non-disclosure agreements'],
  ['A.6.7', 'Remote working'],
  ['A.6.8', 'Information security event reporting'],
  ['A.7.1', 'Physical security perimeters'],
  ['A.7.2', 'Physical entry'],
  ['A.7.3', 'Securing offices, rooms and facilities'],
  ['A.7.4', 'Physical security monitoring'],
  ['A.7.5', 'Protecting against physical and environmental threats'],
  ['A.7.6', 'Working in secure areas'],
  ['A.7.7', 'Clear desk and clear screen'],
  ['A.7.8', 'Equipment siting and protection'],
  ['A.7.9', 'Security of assets off-premises'],
  ['A.7.10', 'Storage media'],
  ['A.7.11', 'Supporting utilities'],
  ['A.7.12', 'Cabling security'],
  ['A.7.13', 'Equipment maintenance'],
  ['A.7.14', 'Secure disposal or re-use of equipment'],
  ['A.8.1', 'User endpoint devices'],
  ['A.8.2', 'Privileged access rights'],
  ['A.8.3', 'Information access restriction'],
  ['A.8.4', 'Access to source code'],
  ['A.8.5', 'Secure authentication'],
  ['A.8.6', 'Capacity management'],
  ['A.8.7', 'Protection against malware'],
  ['A.8.8', 'Management of technical vulnerabilities'],
  ['A.8.9', 'Configuration management'],
  ['A.8.10', 'Information deletion'],
  ['A.8.11', 'Data masking'],
  ['A.8.12', 'Data leakage prevention'],
  ['A.8.13', 'Information backup'],
  ['A.8.14', 'Redundancy of information processing facilities'],
  ['A.8.15', 'Logging'],
  ['A.8.16', 'Monitoring activities'],
  ['A.8.17', 'Clock synchronization'],
  ['A.8.18', 'Use of privileged utility programs'],
  ['A.8.19', 'Installation of software on operational systems'],
  ['A.8.20', 'Networks security'],
  ['A.8.21', 'Security of network services'],
  ['A.8.22', 'Segregation of networks'],
  ['A.8.23', 'Web filtering'],
  ['A.8.24', 'Use of cryptography'],
  ['A.8.25', 'Secure development life cycle'],
  ['A.8.26', 'Application security requirements'],
  ['A.8.27', 'Secure system architecture and engineering principles'],
  ['A.8.28', 'Secure coding'],
  ['A.8.29', 'Security testing in development and acceptance'],
  ['A.8.30', 'Outsourced development'],
  ['A.8.31', 'Separation of development, test and production environments'],
  ['A.8.32', 'Change management'],
  ['A.8.33', 'Test information'],
  ['A.8.34', 'Protection of information systems during audit testing'],
] as const

const NIST_CSF_ROWS = [
  ['GV.OC', 'Organizational Context'],
  ['GV.RM', 'Risk Management Strategy'],
  ['GV.RR', 'Roles, Responsibilities, and Authorities'],
  ['GV.PO', 'Policy'],
  ['GV.OV', 'Oversight'],
  ['GV.SC', 'Cybersecurity Supply Chain Risk Management'],
  ['ID.AM', 'Asset Management'],
  ['ID.RA', 'Risk Assessment'],
  ['ID.IM', 'Improvement'],
  ['PR.AA', 'Identity Management, Authentication, and Access Control'],
  ['PR.AT', 'Awareness and Training'],
  ['PR.DS', 'Data Security'],
  ['PR.PS', 'Platform Security'],
  ['PR.IR', 'Technology Infrastructure Resilience'],
  ['DE.CM', 'Continuous Monitoring'],
  ['DE.AE', 'Adverse Event Analysis'],
  ['RS.MA', 'Incident Management'],
  ['RS.AN', 'Incident Analysis'],
  ['RS.CO', 'Incident Response Reporting and Communication'],
  ['RS.MI', 'Incident Mitigation'],
  ['RC.RP', 'Incident Recovery Plan Execution'],
  ['RC.CO', 'Incident Recovery Communication'],
] as const

const ISO_31000_ROWS = [
  ['5.2', 'Leadership and commitment'],
  ['5.3', 'Integration of risk management'],
  ['5.4.1', 'Understanding the organization and its context'],
  ['5.4.2', 'Articulating risk management commitment'],
  ['5.4.3', 'Assigning organizational roles, authorities, responsibilities and accountabilities'],
  ['5.4.4', 'Allocating resources'],
  ['5.4.5', 'Establishing communication and consultation'],
  ['5.5', 'Implementing the risk management framework'],
  ['5.6', 'Evaluating the risk management framework'],
  ['5.7', 'Improving the risk management framework'],
  ['6.2', 'Communication and consultation'],
  ['6.3.2', 'Defining the scope of the risk management process'],
  ['6.3.3', 'External and internal context'],
  ['6.3.4', 'Defining risk criteria'],
  ['6.4.2', 'Risk identification'],
  ['6.4.3', 'Risk analysis'],
  ['6.4.4', 'Risk evaluation'],
  ['6.5', 'Risk treatment'],
  ['6.6', 'Monitoring and review'],
  ['6.7', 'Recording and reporting'],
] as const

const NIS2_ROWS = [
  ['ART.20', 'Governance and management body accountability'],
  ['ART.21.2.a', 'Policies on risk analysis and information system security'],
  ['ART.21.2.b', 'Incident handling'],
  ['ART.21.2.c', 'Business continuity, backup management, disaster recovery and crisis management'],
  ['ART.21.2.d', 'Supply chain security'],
  ['ART.21.2.e', 'Security in acquisition, development and maintenance, including vulnerability handling'],
  ['ART.21.2.f', 'Policies and procedures to assess the effectiveness of risk-management measures'],
  ['ART.21.2.g', 'Basic cyber hygiene practices and cybersecurity training'],
  ['ART.21.2.h', 'Policies and procedures on the use of cryptography and encryption'],
  ['ART.21.2.i', 'Human resources security, access control policies and asset management'],
  ['ART.21.2.j', 'Multi-factor authentication and secured communications'],
  ['ART.23', 'Incident reporting obligations'],
] as const

const SOX_ROWS = [
  ['SOX.302', 'Corporate responsibility for financial reports'],
  ['SOX.404', 'Management assessment of internal control over financial reporting'],
  ['SOX.409', 'Real-time issuer disclosures'],
  ['SOX.802', 'Retention of records and audit work papers'],
  ['ELC.CE', 'Entity-level control environment'],
  ['ELC.RA', 'Entity-level risk assessment'],
  ['ELC.CA', 'Entity-level control activities'],
  ['ELC.IC', 'Information and communication'],
  ['ELC.MO', 'Monitoring of controls'],
  ['ITGC.AC', 'Access to programs and data'],
  ['ITGC.CM', 'Program change management'],
  ['ITGC.PD', 'Program development'],
  ['ITGC.OP', 'Computer operations'],
  ['FSC.RC', 'Financial statement close and account reconciliation'],
] as const

export const FRAMEWORK_PACKAGES: readonly FrameworkPackage[] = [
  {
    id: 'iso27001',
    labelEn: 'ISO/IEC 27001',
    labelKa: 'ISO/IEC 27001',
    version: '2022.1',
    sourceNote: 'Annex A control set (93 controls, four themes).',
    controls: seeds(ISO_27001_ROWS, 'Ensure {name} is defined, implemented and operating effectively.'),
  },
  {
    id: 'nistCsf2',
    labelEn: 'NIST CSF 2.0',
    labelKa: 'NIST CSF 2.0',
    version: '2.0.1',
    sourceNote: 'Core function categories across Govern, Identify, Protect, Detect, Respond and Recover.',
    controls: seeds(NIST_CSF_ROWS, 'Achieve the outcomes of the {name} category and evidence them.'),
  },
  {
    id: 'iso31000',
    labelEn: 'ISO 31000',
    labelKa: 'ISO 31000',
    version: '2018.1',
    sourceNote: 'Framework and process clauses (5.2–6.7).',
    controls: seeds(ISO_31000_ROWS, 'Operate {name} as prescribed by the risk management framework.'),
  },
  {
    id: 'nis2',
    labelEn: 'NIS2',
    labelKa: 'NIS2',
    version: '2024.1',
    sourceNote: 'Article 21(2) risk-management measures, with governance and reporting duties.',
    controls: seeds(NIS2_ROWS, 'Implement and maintain {name} to the standard the directive requires.'),
  },
  {
    id: 'sox',
    labelEn: 'SOX',
    labelKa: 'SOX',
    version: '2024.1',
    sourceNote: 'Key sections with entity-level and IT general control areas for ICFR.',
    controls: seeds(SOX_ROWS, 'Maintain {name} so financial reporting assertions are supported.'),
  },
]

export function frameworkPackage(id: ControlFrameworkId): FrameworkPackage | null {
  return FRAMEWORK_PACKAGES.find((entry) => entry.id === id) ?? null
}
