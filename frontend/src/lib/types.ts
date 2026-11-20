export type Money = string | number;

export type RoleBrief = { id: string; code: string; name_fr: string; name_ar: string; is_client_role: boolean };

export type Me = {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  language: "fr" | "ar";
  role: RoleBrief;
  client_id: string | null;
  permissions: string[];
  last_login_at: string | null;
};

export type Page<T> = { items: T[]; total: number; page: number; page_size: number };

export type ClientBrief = {
  id: string; name: string; client_type: string; phone: string | null; email: string | null; address: string | null;
  city: string | null; tax_id: string | null; whatsapp: string | null;
};

export type Client = ClientBrief & {
  contact_name: string | null; notes: string | null; is_archived: boolean; created_at: string;
  total_invoiced?: Money; balance?: Money;
};

export type Line = {
  id?: string; item_type: "service" | "material" | "labor"; designation: string; description: string | null;
  quantity: Money; unit: string; unit_price_ht: Money; discount: Money; tva_rate: Money;
  total_ht?: Money; total_tva?: Money; total_ttc?: Money;
};

export type QuoteListItem = {
  id: string; number: string; title: string; status: string; issue_date: string; validity_date: string;
  total_ht: Money; total_ttc: Money; client: ClientBrief; created_at: string;
};

export type Quote = QuoteListItem & {
  request_id: string | null; site_address: string | null; payment_terms: string | null; special_conditions: string | null;
  notes: string | null; language: "fr" | "ar"; subtotal_ht: Money; total_discount: Money; total_tva: Money;
  sent_at: string | null; decided_at: string | null; decision_comment: string | null; items: Line[];
  invoice_id: string | null; invoice_number: string | null;
};

export type PaymentBrief = {
  id: string; number: string; amount: Money; payment_date: string; method: string; reference: string | null;
  status: string; cancel_reason: string | null; comment: string | null;
};

export type InvoiceListItem = {
  id: string; number: string; title: string; status: string; issue_date: string; due_date: string; total_ttc: Money;
  total_due: Money; amount_paid: Money; balance: Money; client: ClientBrief; created_at: string;
};

export type Invoice = InvoiceListItem & {
  quote: { id: string; number: string } | null; site_address: string | null; payment_terms: string | null;
  notes: string | null; language: "fr" | "ar"; subtotal_ht: Money; total_discount: Money; total_ht: Money;
  total_tva: Money; stamp_duty: Money; sent_at: string | null; cancelled_at: string | null; cancel_reason: string | null;
  items: Line[]; payments: PaymentBrief[]; editable_items: boolean;
};

export type Payment = {
  id: string; number: string; amount: Money; payment_date: string; method: string; reference: string | null;
  comment: string | null; status: string; cancelled_at: string | null; cancel_reason: string | null;
  proof_document_id: string | null; client: ClientBrief;
  invoice: { id: string; number: string; total_due: Money; balance: Money; status: string }; created_at: string;
};

export type PaymentMethod = { code: string; label_fr: string; label_ar: string; active: boolean };

export type CompanySettings = {
  name: string; tagline_fr: string | null; tagline_ar: string | null; logo_document_id: string | null;
  address: string | null; city: string | null; phone: string | null; whatsapp: string | null; email: string | null;
  website: string | null; tax_id: string | null; trade_register: string | null; bank_name: string | null;
  bank_rib: string | null; bank_iban: string | null; currency: string; tax_rates: Money[]; default_tax_rate: Money;
  stamp_duty: Money; apply_stamp_duty: boolean; quote_prefix: string; invoice_prefix: string; payment_prefix: string;
  number_padding: number; quote_validity_days: number; invoice_due_days: number; payment_methods: PaymentMethod[];
  payment_terms_fr: string | null; payment_terms_ar: string | null; terms_fr: string | null; terms_ar: string | null;
  footer_fr: string | null; footer_ar: string | null;
};

export type Activity = {
  id: string; action: string; entity_type: string | null; entity_id: string | null; summary: string | null;
  created_at: string; user_name: string | null;
};

export type Notification = { id: string; type: string; data: Record<string, string>; link: string | null; is_read: boolean; created_at: string };

export type DocumentFile = {
  id: string; kind: string; entity_type: string | null; entity_id: string | null; filename: string; mime_type: string;
  size_bytes: number; created_at: string;
};

export type QuoteRequest = {
  id: string; client_id: string | null; name: string; phone: string; email: string | null; service: string;
  address: string | null; message: string; status: string; internal_notes: string | null; created_at: string;
};

export type Permission = { id: string; code: string; module: string; description: string | null };
export type Role = RoleBrief & { description: string | null; is_system: boolean; permissions: Permission[]; user_count: number };
export type User = {
  id: string; email: string; full_name: string; phone: string | null; language: "fr" | "ar"; is_active: boolean;
  role: RoleBrief; client_id: string | null; last_login_at: string | null; created_at: string;
};

// ---------- Scan / photo import ----------
export type ScannedClient = { name: string | null; phone: string | null; email: string | null; address: string | null; city: string | null; tax_id: string | null };
export type ScannedLine = { item_type: Line["item_type"]; designation: string; description: string | null; quantity: string; unit: string; unit_price_ht: string; discount: string; tva_rate: string | null };
export type ScannedSales = {
  document_number: string | null; client: ScannedClient; title: string | null; site_address: string | null;
  issue_date: string | null; second_date: string | null; payment_terms: string | null; notes: string | null;
  apply_stamp_duty: boolean | null; items: ScannedLine[]; total_ht: string | null; total_ttc: string | null;
};
export type ScannedPayment = {
  amount: string | null; payment_date: string | null; method: string | null; reference: string | null;
  invoice_number: string | null; payer_name: string | null; comment: string | null;
};
export type ScanResult<T = ScannedSales | ScannedPayment> = { document: DocumentFile; ai_enabled: boolean; extracted: T | null; ai_error: string | null };
