export interface EduProject {
  id: string;
  // --- Колонки таблицы ---
  name: string;
  selectionStart?: string;
  selectionDeadline?: string;
  customer?: string;
  customerEmail?: string;
  customerPhone?: string;
  organization?: string;
  organizationFull?: string;
  curator?: string;
  direction?: string;
  placesLeft: number;
  placesTotal: number;
  teamsCount: number;
  status?: string;
  programType?: string;
  programManager?: string;
  target?: string;
  result?: string;
  // --- Служебные ---
  updatedAt: string;
  createdAt: string;
}