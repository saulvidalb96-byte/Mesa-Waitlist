export type Role = "owner" | "manager" | "host";
export type Status = "waiting" | "notified" | "seated" | "cancelled" | "noshow";

export interface Business {
  id: string;
  slug: string;
  name: string;
  brand_color: string;
  sms_ready: string;
  sms_added: string;
  self_checkin: boolean;
  seat_options: string[];
  quote_options: number[];
}

export interface Membership {
  business_id: string;
  role: Role;
  businesses: Business;
}

export interface Party {
  id: string;
  business_id: string;
  name: string;
  phone: string | null;
  size: number;
  quote_min: number | null;
  seat: string | null;
  tags: string[];
  notes: string | null;
  status: Status;
  source: "host" | "guest";
  public_token: string;
  added_at: string;
  notified_at: string | null;
  seated_at: string | null;
  removed_at: string | null;
}

export interface Member {
  business_id: string;
  user_id: string;
  role: Role;
  email: string | null;
}

export const ACTIVE: Status[] = ["waiting", "notified"];
export const isActive = (p: Party) => ACTIVE.includes(p.status);
