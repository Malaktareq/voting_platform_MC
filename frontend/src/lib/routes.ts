// Explicit entry routes prevent admin typos from opening login or the voter page.
export const ADMIN_ROUTES = [
  '/admin', '/admin/overview', '/admin/exhibitors', '/admin/categories',
  '/admin/results', '/admin/visitors', '/admin/access', '/admin/security', '/admin/audit',
];
