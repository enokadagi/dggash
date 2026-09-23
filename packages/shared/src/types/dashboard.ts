export interface DashboardKPIs {
  totalCustomers: number;
  activeSubscriptions: number;
  monthlyRevenue: number;
  outstandingAmount: number;
  openTickets: number;
  pendingInstallations: number;
  onlineDevices: number;
  offlineDevices: number;
}

export interface RevenueChartData {
  month: string;
  revenue: number;
  expenses: number;
  profit: number;
}

export interface RecentActivity {
  id: string;
  type: string;
  description: string;
  userId?: string;
  userName?: string;
  createdAt: string;
}

export interface Alert {
  id: string;
  type: 'info' | 'warning' | 'error' | 'success';
  title: string;
  message: string;
  actionUrl?: string;
  createdAt: string;
}
