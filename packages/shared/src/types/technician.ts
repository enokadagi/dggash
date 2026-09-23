export interface TechnicianProfile {
  id: string;
  userId: string;
  technicianId: string;
  skills: string[];
  certification?: string;
  maxActiveJobs: number;
  currentLat?: number;
  currentLng?: number;
  lastLocationAt?: string;
  createdAt: string;
  updatedAt: string;
}
