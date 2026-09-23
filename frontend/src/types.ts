export type Organization = { id: string; name: string; role: string };

export type CurrentUser = {
  id: string;
  email: string;
  full_name: string;
  is_super_admin: boolean;
  organizations: Organization[];
};

export type Tokens = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_at: string;
};

export type DashboardSummary = {
  chatbot_count: number;
  conversation_count: number;
  message_count: number;
  lead_count: number;
  new_lead_count: number;
  document_count: number;
  current_plan: string;
  daily_limit: number | null;
  daily_used: number;
  free_credits_remaining: number;
  purchased_credits_remaining: number;
  chatbot_slots: number;
};

export type Chatbot = {
  id: string;
  public_id: string;
  name: string;
  description: string | null;
  greeting: string;
  tone: string;
  primary_color: string;
  is_active: boolean;
  credit_balance: number;
  usage_count: number;
  created_at: string;
};

export type DocumentItem = {
  id: string; original_name: string; mime_type: string; size_bytes: number;
  status: "UPLOADED" | "PROCESSING" | "DONE" | "FAILED";
  processing_error: string | null; created_at: string;
};

export type Conversation = {
  id: string; chatbot_id: string; status: string; created_at: string; updated_at: string;
};

export type Lead = {
  id: string; chatbot_id: string; conversation_id: string; customer_name: string | null;
  phone: string | null; email: string | null; intent_summary: string | null;
  status: "NEW" | "CONTACTED" | "QUALIFIED" | "CLOSED" | "LOST";
  created_at: string;
};

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };

export type PaymentOrder = {
  id: string; order_code: string; amount: number; status: string; expires_at: string | null;
  bank_code: string; account_number: string; account_name: string; transfer_content: string;
  qr_code_url: string;
  product_code: string; product_name: string; product_type: string; quantity: number;
};

export type PaymentOrderStatus = {
  id: string; order_code: string; amount: number; status: string; expires_at: string | null;
  product_code: string; product_name: string; product_type: string; quantity: number;
};

export type PaymentProduct = {
  code: string; name: string; description: string; product_type: "CHATBOT_SLOT" | "CHAT_CREDITS";
  quantity: number; price_vnd: number;
};

export type CreditBalance = {
  free_remaining: number; purchased_remaining: number; chatbot_slots: number; chatbot_count: number;
};

export type AdminSummary = {
  organizations: number; users: number; chatbots: number; conversations: number;
  leads: number; documents_processing: number; payments_pending: number;
};

export type AdminOrganization = {
  id: string; name: string; slug: string; is_active: boolean; created_at: string;
};

export type PublicPlan = {
  code: string; display_name: string; daily_chat_limit: number | null; price_vnd: number | null;
};
