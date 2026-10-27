export enum OperatorMenu {
  Dashboard = 'dashboard',
  Students = 'students',
  Tutors = 'tutors',
  StudyGroups = 'study-groups',
  Schedule = 'schedule',
  Rooms = 'rooms',
  Invoices = 'invoices',
  Payroll = 'payroll',
  Reports = 'reports',
  Announcements = 'announcements',
  Settings = 'settings',
}

// Null preserves the operational access of accounts created before permissions.
// An empty array explicitly disables every menu.
export function getOperatorMenuPermissions(
  permissions: OperatorMenu[] | null,
): OperatorMenu[] {
  return [...(permissions ?? Object.values(OperatorMenu))];
}
