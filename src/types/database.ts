export type ClientStatus = 'active' | 'inactive' | 'pending' | 'vencido' | 'suspended' | 'canceled'
export type AlertType = 'before_due' | 'on_due' | 'after_due' | 'renewal' | 'promotion' | 'quick_message'
export type AlertSendStatus = 'sent' | 'failed' | 'pending'
export type InstanceStatus = 'connected' | 'disconnected'
export type OrganizationRole = 'owner' | 'admin' | 'member'

export interface Organization {
  id: string
  name: string
  created_at: string
  updated_at: string
}

export interface OrganizationMember {
  id: string
  organization_id: string
  user_id: string
  role: OrganizationRole
  created_at: string
  organization?: Organization
}

export interface AuditLog {
  id: string
  organization_id: string | null
  user_id: string | null
  action: string
  resource: string
  resource_id: string | null
  details: any | null
  ip_address: string | null
  created_at: string
}

export interface Service {
  id: string
  organization_id?: string
  user_id: string
  name: string
  cost: number
  created_at: string
  updated_at: string
  client_count?: number
  plans?: Array<{name: string, price: number}> | null
}

export interface Client {
  id: string
  organization_id?: string
  user_id: string
  name: string
  phone: string | null
  plan_value: number
  due_date: string // format: YYYY-MM-DD
  observation: string | null
  description: string | null
  registration_date: string
  status: ClientStatus
  created_at: string
  updated_at: string
  screens?: number
  services?: Service[]
  client_services?: ClientService[]
}

export interface ClientService {
  id: string
  client_id: string
  service_id: string
  created_at: string
  service?: Service
}

export interface Promotion {
  id: string
  organization_id?: string
  user_id: string
  name: string
  description: string | null
  discount_value: number
  is_active: boolean
  start_date: string | null
  end_date: string | null
  created_at: string
  updated_at: string
}

export interface Automation {
  id: string
  organization_id?: string
  user_id: string
  alert_type: AlertType
  days_offset: number
  send_time: string
  message_template: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface AlertHistory {
  id: string
  organization_id?: string
  user_id: string
  client_id: string
  automation_id: string
  sent_at: string
  status: AlertSendStatus
  message_content: string
  error_message: string | null
  scheduled_at: string | null
  created_at: string
  client?: Client
  automation?: Automation
}

export interface EvolutionInstance {
  id: string
  organization_id?: string
  user_id: string
  instance_name: string
  status: InstanceStatus
  qr_code: string | null
  api_key: string | null
  base_url: string | null
  min_delay: number
  max_delay: number
  reject_calls?: boolean
  reject_calls_message?: string
  created_at: string
  updated_at: string
}

export interface DashboardMetrics {
  total_active_clients: number
  total_inactive_clients: number
  total_pending_clients: number
  total_vencido_clients: number
  total_clients: number
  monthly_revenue: number
  monthly_costs: number
  monthly_net_revenue: number
}

export interface AdvancedDashboardMetrics {
  monthly_goal: number
  mrr: number
  active_clients: number
  total_clients: number
  default_clients: number
  default_amount: number
  expected_revenue: number
  received_today: number
  received_month: number
  received_last_month: number
  renewals_this_month: number
  renewals_last_month: number
  new_clients_this_month: number
  new_clients_last_month: number
  alerts_sent_today: number
  top_clients: Array<{ name: string; total_paid: number }>
  revenue_by_service: Array<{ service_name: string; total_value: number }>
  revenue_evolution: Array<{ date: string; amount: number }>
  receipt_methods: Array<{ method: string; value: number }>
}

export interface Payment {
  id: string
  organization_id?: string
  user_id: string
  client_id: string
  amount_paid: number
  net_profit: number
  months_renewed: number
  created_at: string
}

export interface MonthlyGrowth {
  month: string
  total_clients: number
  new_clients: number
}

export interface ClientsByService {
  service_name: string
  client_count: number
}

export interface ClientsManagementMetrics {
  total_clients: number
  active_clients: number
  overdue_clients: number
  suspended_clients: number
  canceled_clients: number
  new_clients_this_month: number
  no_whatsapp_clients: number
  no_service_clients: number
  pending_pix_clients: number
  due_today_clients: number
  due_tomorrow_clients: number
  due_in_7_days_clients: number
  chart_clients_by_status: Array<{ name: string; value: number }>
  chart_clients_by_plan: Array<{ name: string; value: number }>
  chart_base_growth: Array<{ month: string; new_clients: number }>
}

export interface EnrichedClient extends Client {
  last_payment_date: string | null
  renewal_count: number
  last_charge_sent_date: string | null
  last_communication_status: string | null
  days_as_client: number
}
