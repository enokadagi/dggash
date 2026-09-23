export interface EmployeeProfile {
  id: string;
  userId: string;
  employeeId: string;
  department?: string;
  position?: string;
  hireDate: string;
  salary?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  assignedToId?: string;
  status: string;
  priority: string;
  dueDate?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Attendance {
  id: string;
  employeeId: string;
  date: string;
  checkIn?: string;
  checkOut?: string;
  status: string;
  notes?: string;
  createdAt: string;
}
