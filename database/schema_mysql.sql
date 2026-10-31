-- Schema Trợ Lý Việt: MySQL 8 / MariaDB 10.4+, InnoDB, UTF-8.
-- Chỉ nhập vào database mới. Không DROP TABLE và không xóa dữ liệu.
-- ID công khai vẫn là UUID dạng chuỗi 36 ký tự như API hiện tại.
CREATE DATABASE IF NOT EXISTS `ccnlthd` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE `ccnlthd`;
SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE TABLE organizations (
	id VARCHAR(36) NOT NULL, 
	name VARCHAR(200) NOT NULL, 
	slug VARCHAR(120) NOT NULL, 
	is_active BOOL NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_organizations PRIMARY KEY (id)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_organizations_slug ON organizations (slug);

CREATE TABLE plans (
	id VARCHAR(36) NOT NULL, 
	code VARCHAR(50) NOT NULL, 
	display_name VARCHAR(100) NOT NULL, 
	daily_chat_limit INTEGER, 
	price_vnd INTEGER, 
	is_active BOOL NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_plans PRIMARY KEY (id), 
	CONSTRAINT uq_plans_code UNIQUE (code)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;


CREATE TABLE rate_limit_counters (
	id VARCHAR(150) NOT NULL, 
	value INTEGER NOT NULL, 
	expires_at DATETIME(6) NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_rate_limit_counters PRIMARY KEY (id)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_rate_limit_counters_expires_at ON rate_limit_counters (expires_at);

CREATE TABLE system_settings (
	id VARCHAR(100) NOT NULL, 
	auto_review BOOL NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_system_settings PRIMARY KEY (id)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;


CREATE TABLE users (
	id VARCHAR(36) NOT NULL, 
	email VARCHAR(320) NOT NULL, 
	full_name VARCHAR(200) NOT NULL, 
	password_hash VARCHAR(255) NOT NULL, 
	is_active BOOL NOT NULL, 
	is_super_admin BOOL NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_users PRIMARY KEY (id)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_users_email ON users (email);

CREATE TABLE audit_logs (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36), 
	actor_user_id VARCHAR(36), 
	action VARCHAR(100) NOT NULL, 
	resource_type VARCHAR(100) NOT NULL, 
	resource_id VARCHAR(100), 
	metadata_redacted TEXT, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_audit_logs PRIMARY KEY (id), 
	CONSTRAINT fk_audit_logs_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE SET NULL, 
	CONSTRAINT fk_audit_logs_actor_user_id_users FOREIGN KEY(actor_user_id) REFERENCES users (id) ON DELETE SET NULL
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_audit_logs_action ON audit_logs (action);
CREATE INDEX ix_audit_logs_actor_user_id ON audit_logs (actor_user_id);
CREATE INDEX ix_audit_logs_created_at ON audit_logs (created_at);
CREATE INDEX ix_audit_logs_organization_id ON audit_logs (organization_id);

CREATE TABLE chatbots (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	public_id VARCHAR(36) NOT NULL, 
	name VARCHAR(120) NOT NULL, 
	description TEXT, 
	greeting VARCHAR(500) NOT NULL, 
	tone VARCHAR(50) NOT NULL, 
	primary_color VARCHAR(7) NOT NULL, 
	avatar_url VARCHAR(500), 
	allowed_domains TEXT NOT NULL, 
	is_active BOOL NOT NULL, 
	credit_balance INTEGER NOT NULL, 
	usage_count INTEGER NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_chatbots PRIMARY KEY (id), 
	CONSTRAINT fk_chatbots_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_chatbots_organization_id ON chatbots (organization_id);
CREATE UNIQUE INDEX ix_chatbots_public_id ON chatbots (public_id);

CREATE TABLE documents (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	original_name VARCHAR(255) NOT NULL, 
	storage_key VARCHAR(255) NOT NULL, 
	mime_type VARCHAR(150) NOT NULL, 
	size_bytes BIGINT NOT NULL, 
	status ENUM('UPLOADED','PROCESSING','DONE','FAILED') NOT NULL, 
	extracted_text LONGTEXT, 
	processing_error TEXT, 
	approval_status VARCHAR(20) NOT NULL, 
	approval_note TEXT, 
	ai_review JSON, 
	approved_at DATETIME(6), 
	approved_by_user_id VARCHAR(36), 
	extracted_char_count INTEGER NOT NULL, 
	chunk_count INTEGER NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_documents PRIMARY KEY (id), 
	CONSTRAINT fk_documents_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT uq_documents_storage_key UNIQUE (storage_key), 
	CONSTRAINT fk_documents_approved_by_user_id_users FOREIGN KEY(approved_by_user_id) REFERENCES users (id) ON DELETE SET NULL
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_documents_approval_status ON documents (approval_status);
CREATE INDEX ix_documents_organization_id ON documents (organization_id);

CREATE TABLE organization_credits (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	free_remaining INTEGER NOT NULL, 
	purchased_remaining INTEGER NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_organization_credits PRIMARY KEY (id), 
	CONSTRAINT uq_organization_credits_organization_id UNIQUE (organization_id), 
	CONSTRAINT fk_organization_credits_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;


CREATE TABLE organization_limits (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	chatbot_slots INTEGER NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_organization_limits PRIMARY KEY (id), 
	CONSTRAINT uq_organization_limits_organization_id UNIQUE (organization_id), 
	CONSTRAINT fk_organization_limits_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;


CREATE TABLE organization_members (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	`role` ENUM('SUPER_ADMIN','BUSINESS_OWNER','BUSINESS_STAFF') NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_organization_members PRIMARY KEY (id), 
	CONSTRAINT uq_organization_members_organization_id UNIQUE (organization_id, user_id), 
	CONSTRAINT fk_organization_members_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_organization_members_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_organization_members_organization_id ON organization_members (organization_id);
CREATE INDEX ix_organization_members_user_id ON organization_members (user_id);

CREATE TABLE password_reset_tokens (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	token_digest VARCHAR(64) NOT NULL, 
	expires_at DATETIME(6) NOT NULL, 
	used_at DATETIME(6), 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_password_reset_tokens PRIMARY KEY (id), 
	CONSTRAINT fk_password_reset_tokens_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT uq_password_reset_tokens_token_digest UNIQUE (token_digest)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_password_reset_tokens_user_id ON password_reset_tokens (user_id);

CREATE TABLE payment_orders (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	plan_id VARCHAR(36), 
	product_code VARCHAR(50) NOT NULL, 
	product_name VARCHAR(200) NOT NULL, 
	product_type VARCHAR(30) NOT NULL, 
	quantity INTEGER NOT NULL, 
	order_code VARCHAR(100) NOT NULL, 
	amount INTEGER NOT NULL, 
	status ENUM('PENDING','SUCCESS','FAILED','EXPIRED','REVIEW') NOT NULL, 
	expires_at DATETIME(6), 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_payment_orders PRIMARY KEY (id), 
	CONSTRAINT fk_payment_orders_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_payment_orders_plan_id_plans FOREIGN KEY(plan_id) REFERENCES plans (id)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE UNIQUE INDEX ix_payment_orders_order_code ON payment_orders (order_code);
CREATE INDEX ix_payment_orders_organization_id ON payment_orders (organization_id);

CREATE TABLE quota_logs (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	usage_date DATE NOT NULL, 
	request_count INTEGER NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_quota_logs PRIMARY KEY (id), 
	CONSTRAINT uq_quota_logs_organization_id UNIQUE (organization_id, usage_date), 
	CONSTRAINT fk_quota_logs_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_quota_logs_organization_id ON quota_logs (organization_id);
CREATE INDEX ix_quota_logs_usage_date ON quota_logs (usage_date);

CREATE TABLE refresh_sessions (
	id VARCHAR(36) NOT NULL, 
	user_id VARCHAR(36) NOT NULL, 
	token_digest VARCHAR(64) NOT NULL, 
	expires_at DATETIME(6) NOT NULL, 
	revoked_at DATETIME(6), 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_refresh_sessions PRIMARY KEY (id), 
	CONSTRAINT fk_refresh_sessions_user_id_users FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE, 
	CONSTRAINT uq_refresh_sessions_token_digest UNIQUE (token_digest)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_refresh_sessions_user_id ON refresh_sessions (user_id);

CREATE TABLE subscriptions (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	plan_id VARCHAR(36) NOT NULL, 
	is_active BOOL NOT NULL, 
	starts_at DATETIME(6) NOT NULL, 
	ends_at DATETIME(6), 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_subscriptions PRIMARY KEY (id), 
	CONSTRAINT fk_subscriptions_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_subscriptions_plan_id_plans FOREIGN KEY(plan_id) REFERENCES plans (id)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_subscription_org_active ON subscriptions (organization_id, is_active);
CREATE INDEX ix_subscriptions_organization_id ON subscriptions (organization_id);
CREATE INDEX ix_subscriptions_plan_id ON subscriptions (plan_id);

CREATE TABLE support_tickets (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	created_by_user_id VARCHAR(36), 
	created_by_email VARCHAR(320), 
	created_by_name VARCHAR(200), 
	subject VARCHAR(200) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	priority VARCHAR(20) NOT NULL, 
	admin_unread_count INTEGER NOT NULL, 
	customer_unread_count INTEGER NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_support_tickets PRIMARY KEY (id), 
	CONSTRAINT fk_support_tickets_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_support_tickets_created_by_user_id_users FOREIGN KEY(created_by_user_id) REFERENCES users (id) ON DELETE SET NULL
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_support_tickets_organization_id ON support_tickets (organization_id);
CREATE INDEX ix_support_tickets_status ON support_tickets (status);

CREATE TABLE visitor_sessions (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	chatbot_id VARCHAR(36) NOT NULL, 
	token_digest VARCHAR(64) NOT NULL, 
	expires_at DATETIME(6) NOT NULL, 
	last_seen_at DATETIME(6) NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_visitor_sessions PRIMARY KEY (id), 
	CONSTRAINT fk_visitor_sessions_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT uq_visitor_sessions_token_digest UNIQUE (token_digest)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_visitor_sessions_chatbot_id ON visitor_sessions (chatbot_id);
CREATE INDEX ix_visitor_sessions_organization_id ON visitor_sessions (organization_id);

CREATE TABLE chatbot_documents (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	chatbot_id VARCHAR(36) NOT NULL, 
	document_id VARCHAR(36) NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_chatbot_documents PRIMARY KEY (id), 
	CONSTRAINT uq_chatbot_documents_chatbot_id UNIQUE (chatbot_id, document_id), 
	CONSTRAINT fk_chatbot_documents_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_chatbot_documents_chatbot_id_chatbots FOREIGN KEY(chatbot_id) REFERENCES chatbots (id) ON DELETE CASCADE, 
	CONSTRAINT fk_chatbot_documents_document_id_documents FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_chatbot_documents_chatbot_id ON chatbot_documents (chatbot_id);
CREATE INDEX ix_chatbot_documents_document_id ON chatbot_documents (document_id);
CREATE INDEX ix_chatbot_documents_organization_id ON chatbot_documents (organization_id);

CREATE TABLE conversations (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	chatbot_id VARCHAR(36) NOT NULL, 
	visitor_session_id VARCHAR(36) NOT NULL, 
	status VARCHAR(30) NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_conversations PRIMARY KEY (id), 
	CONSTRAINT fk_conversations_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_conversations_visitor_session_id_visitor_sessions FOREIGN KEY(visitor_session_id) REFERENCES visitor_sessions (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_conversations_chatbot_id ON conversations (chatbot_id);
CREATE INDEX ix_conversations_organization_id ON conversations (organization_id);
CREATE INDEX ix_conversations_visitor_session_id ON conversations (visitor_session_id);

CREATE TABLE document_chunks (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	document_id VARCHAR(36) NOT NULL, 
	chunk_index INTEGER NOT NULL, 
	content TEXT NOT NULL, 
	search_text TEXT NOT NULL, 
	search_tokens JSON NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_document_chunks PRIMARY KEY (id), 
	CONSTRAINT uq_document_chunks_document_id UNIQUE (document_id, chunk_index), 
	CONSTRAINT fk_document_chunks_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_document_chunks_document_id_documents FOREIGN KEY(document_id) REFERENCES documents (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_document_chunks_document_id ON document_chunks (document_id);
CREATE INDEX ix_document_chunks_organization_id ON document_chunks (organization_id);

CREATE TABLE support_ticket_messages (
	id VARCHAR(36) NOT NULL, 
	ticket_id VARCHAR(36) NOT NULL, 
	sender_type VARCHAR(20) NOT NULL, 
	sender_user_id VARCHAR(36), 
	sender_name VARCHAR(200) NOT NULL, 
	message TEXT NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_support_ticket_messages PRIMARY KEY (id), 
	CONSTRAINT fk_support_ticket_messages_ticket_id_support_tickets FOREIGN KEY(ticket_id) REFERENCES support_tickets (id) ON DELETE CASCADE, 
	CONSTRAINT fk_support_ticket_messages_sender_user_id_users FOREIGN KEY(sender_user_id) REFERENCES users (id) ON DELETE SET NULL
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_support_ticket_messages_ticket_id ON support_ticket_messages (ticket_id);

CREATE TABLE transactions (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	payment_order_id VARCHAR(36) NOT NULL, 
	provider VARCHAR(30) NOT NULL, 
	provider_transaction_id VARCHAR(150) NOT NULL, 
	amount INTEGER NOT NULL, 
	status ENUM('PENDING','SUCCESS','FAILED','EXPIRED','REVIEW') NOT NULL, 
	raw_payload_redacted TEXT, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_transactions PRIMARY KEY (id), 
	CONSTRAINT uq_transactions_provider UNIQUE (provider, provider_transaction_id), 
	CONSTRAINT fk_transactions_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_transactions_payment_order_id_payment_orders FOREIGN KEY(payment_order_id) REFERENCES payment_orders (id)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_transactions_organization_id ON transactions (organization_id);
CREATE INDEX ix_transactions_payment_order_id ON transactions (payment_order_id);

CREATE TABLE usage_logs (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	chatbot_id VARCHAR(36), 
	event_type VARCHAR(50) NOT NULL, 
	quantity INTEGER NOT NULL, 
	usage_date DATE NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_usage_logs PRIMARY KEY (id), 
	CONSTRAINT fk_usage_logs_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_usage_logs_chatbot_id_chatbots FOREIGN KEY(chatbot_id) REFERENCES chatbots (id) ON DELETE SET NULL
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_usage_logs_chatbot_id ON usage_logs (chatbot_id);
CREATE INDEX ix_usage_logs_event_type ON usage_logs (event_type);
CREATE INDEX ix_usage_logs_organization_id ON usage_logs (organization_id);
CREATE INDEX ix_usage_logs_usage_date ON usage_logs (usage_date);

CREATE TABLE document_chunk_tokens (
	chunk_id VARCHAR(36) NOT NULL, 
	token VARCHAR(100) NOT NULL, 
	CONSTRAINT pk_document_chunk_tokens PRIMARY KEY (chunk_id, token), 
	CONSTRAINT fk_document_chunk_tokens_chunk_id_document_chunks FOREIGN KEY(chunk_id) REFERENCES document_chunks (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_document_chunk_tokens_token ON document_chunk_tokens (token);

CREATE TABLE chat_requests (
    id VARCHAR(36) NOT NULL,
    organization_id VARCHAR(36) NOT NULL,
    conversation_id VARCHAR(36) NOT NULL,
    chatbot_id VARCHAR(36) NOT NULL,
    client_message_id VARCHAR(36) NOT NULL,
    message_hash VARCHAR(64) NOT NULL,
    status VARCHAR(20) NOT NULL,
    attempt_token VARCHAR(36) NOT NULL,
    lease_until DATETIME(6) NOT NULL,
    credit_source VARCHAR(10),
    remaining_credits INTEGER NOT NULL,
    response_data JSON,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    CONSTRAINT pk_chat_requests PRIMARY KEY (id),
    CONSTRAINT uq_chat_requests_conversation_id UNIQUE (conversation_id, client_message_id),
    CONSTRAINT fk_chat_requests_organization_id_organizations FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
    CONSTRAINT fk_chat_requests_conversation_id_conversations FOREIGN KEY (conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_chat_requests_organization_id ON chat_requests (organization_id);
CREATE INDEX ix_chat_requests_conversation_id ON chat_requests (conversation_id);
CREATE INDEX ix_chat_requests_chatbot_id ON chat_requests (chatbot_id);
CREATE INDEX ix_chat_requests_recovery ON chat_requests (organization_id, status, lease_until);

CREATE TABLE messages (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	conversation_id VARCHAR(36) NOT NULL, 
	`role` ENUM('USER','ASSISTANT','SYSTEM') NOT NULL, 
	content TEXT NOT NULL, 
	source_metadata TEXT, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_messages PRIMARY KEY (id), 
	CONSTRAINT fk_messages_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_messages_conversation_id_conversations FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_messages_conversation_id ON messages (conversation_id);
CREATE INDEX ix_messages_created_at ON messages (created_at);
CREATE INDEX ix_messages_organization_id ON messages (organization_id);

CREATE TABLE support_ticket_attachments (
	id VARCHAR(36) NOT NULL, 
	message_id VARCHAR(36) NOT NULL, 
	original_name VARCHAR(255) NOT NULL, 
	storage_key VARCHAR(500) NOT NULL, 
	mime_type VARCHAR(150) NOT NULL, 
	size_bytes BIGINT NOT NULL, 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_support_ticket_attachments PRIMARY KEY (id), 
	CONSTRAINT fk_support_ticket_attachments_message_id_support_ticket_messages FOREIGN KEY(message_id) REFERENCES support_ticket_messages (id) ON DELETE CASCADE, 
	CONSTRAINT uq_support_ticket_attachments_storage_key UNIQUE (storage_key)
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_support_ticket_attachments_message_id ON support_ticket_attachments (message_id);

CREATE TABLE leads (
	id VARCHAR(36) NOT NULL, 
	organization_id VARCHAR(36) NOT NULL, 
	chatbot_id VARCHAR(36) NOT NULL, 
	conversation_id VARCHAR(36) NOT NULL, 
	source_message_id VARCHAR(36), 
	customer_name VARCHAR(200), 
	phone VARCHAR(30), 
	email VARCHAR(320), 
	intent_summary TEXT, 
	status ENUM('NEW','CONTACTED','QUALIFIED','CLOSED','LOST') NOT NULL, 
	assigned_user_id VARCHAR(36), 
	created_at DATETIME(6) NOT NULL, 
	updated_at DATETIME(6) NOT NULL, 
	CONSTRAINT pk_leads PRIMARY KEY (id), 
	CONSTRAINT uq_leads_source_message_id UNIQUE (source_message_id), 
	CONSTRAINT fk_leads_organization_id_organizations FOREIGN KEY(organization_id) REFERENCES organizations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_leads_conversation_id_conversations FOREIGN KEY(conversation_id) REFERENCES conversations (id) ON DELETE CASCADE, 
	CONSTRAINT fk_leads_source_message_id_messages FOREIGN KEY(source_message_id) REFERENCES messages (id) ON DELETE SET NULL, 
	CONSTRAINT fk_leads_assigned_user_id_users FOREIGN KEY(assigned_user_id) REFERENCES users (id) ON DELETE SET NULL
)ENGINE=InnoDB CHARSET=utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE INDEX ix_leads_chatbot_id ON leads (chatbot_id);
CREATE INDEX ix_leads_conversation_id ON leads (conversation_id);
CREATE INDEX ix_leads_organization_id ON leads (organization_id);

-- Đánh dấu đúng revision vì các bảng trên được nhập thủ công thay vì alembic upgrade.
CREATE TABLE alembic_version (version_num VARCHAR(32) NOT NULL PRIMARY KEY);
INSERT INTO alembic_version (version_num) VALUES ('20261022_chat_retry');
